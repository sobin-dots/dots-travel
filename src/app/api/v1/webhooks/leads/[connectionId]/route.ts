import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { connectionSecrets, receiveSubmission } from '@/lib/lead-intake/service';
import { equalSecret, parseWebhookJson, providerId, validMetaSignature } from '@/lib/lead-intake/normalize';

export const runtime = 'nodejs';
type Context = { params: Promise<{ connectionId: string }> };

export async function GET(req: NextRequest, context: Context) {
  const { connectionId } = await context.params;
  const connection = await db.leadConnection.findUnique({ where: { id: connectionId } });
  if (!connection?.enabled || connection.provider !== 'meta') return new NextResponse('Not found', { status: 404 });
  const secrets = connectionSecrets(connection.credentials);
  if (req.nextUrl.searchParams.get('hub.mode') !== 'subscribe' || !equalSecret(req.nextUrl.searchParams.get('hub.verify_token') || '', secrets.webhookSecret)) return new NextResponse('Unauthorized', { status: 403 });
  return new NextResponse(req.nextUrl.searchParams.get('hub.challenge') || '', { headers: { 'Content-Type': 'text/plain' } });
}

export async function POST(req: NextRequest, context: Context) {
  const { connectionId } = await context.params;
  const connection = await db.leadConnection.findUnique({ where: { id: connectionId } });
  if (!connection?.enabled) return NextResponse.json({ error: 'Connection unavailable' }, { status: 404 });
  const secrets = connectionSecrets(connection.credentials);
  // Bound the actual stream, including requests without a Content-Length header.
  const reader = req.body?.getReader();
  if (!reader) return NextResponse.json({ error: 'Body required' }, { status: 400 });
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 256_000) { await reader.cancel(); return NextResponse.json({ error: 'Payload too large' }, { status: 413 }); }
    chunks.push(value);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  let body;
  try { body = parseWebhookJson(raw); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Object required' }, { status: 400 });
  let events: { externalId: string; payload: typeof body }[];
  if (connection.provider === 'meta') {
    if (!secrets.appSecret || !validMetaSignature(raw, req.headers.get('x-hub-signature-256') || '', secrets.appSecret)) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    try {
      if (body.object !== 'page' || !Array.isArray(body.entry) || body.entry.length > 100) throw new Error();
      events = body.entry.flatMap((entry: { id: string; changes: { field: string; value: Record<string, unknown> }[] }) => {
        if (String(entry.id) !== secrets.pageId) throw new Error();
        if (!Array.isArray(entry.changes)) throw new Error();
        return entry.changes.filter(c => c.field === 'leadgen').map(c => ({ externalId: providerId(c.value.leadgen_id), payload: c.value }));
      });
      if (events.length > 100) throw new Error();
    } catch { return NextResponse.json({ error: 'Invalid Meta page or event' }, { status: 400 }); }
  } else {
    const supplied = connection.provider === 'google_ads' ? body.google_key : req.headers.get('x-lead-secret');
    if (typeof supplied !== 'string' || !equalSecret(supplied, secrets.webhookSecret)) return NextResponse.json({ error: 'Invalid webhook key' }, { status: 401 });
    delete body.google_key;
    // Retain authenticated invalid submissions for diagnosis and replay as well.
    let externalId;
    try { externalId = providerId(connection.provider === 'google_ads' ? body.lead_id : body.submissionId); }
    catch { externalId = `invalid:${createHash('sha256').update(JSON.stringify(body)).digest('hex')}`; }
    events = [{ externalId, payload: body }];
  }
  try {
    // Acknowledge only after durable storage. The scheduled worker performs retrieval and assignment.
    for (const event of events) await receiveSubmission(connection, event.externalId, event.payload);
    return NextResponse.json({ accepted: events.length });
  } catch {
    return NextResponse.json({ error: 'Unable to store submission; retry delivery' }, { status: 503 });
  }
}
