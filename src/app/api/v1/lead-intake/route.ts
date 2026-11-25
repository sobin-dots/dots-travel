import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { encryptData } from '@/lib/crypto';
import { providers } from '@/lib/lead-intake/normalize';
import { phoneReadiness } from '@/lib/telephony/phone-readiness';

export const runtime = 'nodejs';
const connectionSchema = z.object({
  id: z.string().uuid().optional(), name: z.string().trim().min(1).max(100), provider: z.enum(providers),
  enabled: z.boolean().default(true),
  webhookSecret: z.string().min(24).max(256),
  appSecret: z.string().min(10).max(256).optional(), pageAccessToken: z.string().min(10).max(4000).optional(),
  pageId: z.string().regex(/^\d+$/).optional(), graphVersion: z.string().regex(/^v\d+\.\d+$/).optional(),
  formNames: z.record(z.string().min(1).max(200), z.string().trim().min(1).max(200)).default({}),
}).superRefine((v, ctx) => {
  if (v.provider === 'meta' && (!v.appSecret || !v.pageAccessToken || !v.pageId || !v.graphVersion)) ctx.addIssue({ code: 'custom', message: 'Meta requires app secret, page access token, page ID and Graph API version' });
  if (v.provider === 'google_ads' && !Object.keys(v.formNames).length) ctx.addIssue({ code: 'custom', message: 'Map each Google Ads form ID to its exact form name' });
});

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'admin'); if (errorResponse) return errorResponse;
  const organizationId = auth!.organizationId;
  const [connections, submissions, members, organization, failedCount] = await Promise.all([
    db.leadConnection.findMany({ where: { organizationId }, select: { id: true, name: true, provider: true, enabled: true, formNames: true, lastReceivedAt: true }, orderBy: { createdAt: 'desc' } }),
    db.leadSubmission.findMany({
      where: { organizationId },
      select: {
        id: true,
        externalId: true,
        connectionId: true,
        status: true,
        attempts: true,
        error: true,
        leadId: true,
        payload: true,
        createdAt: true,
        lead: {
          select: {
            id: true,
            title: true,
            status: true,
            stage: true,
            assignedTo: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    db.membership.findMany({ where: { organizationId }, select: { id: true, userId: true, role: true, receivesLeads: true, availableForLeads: true, voiceBusy: true, voicePresenceAt: true, voiceEndpoint: true, user: { select: { name: true, status: true } } } }),
    db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { firstContactMinutes: true } }),
    db.leadSubmission.count({ where: { organizationId, status: 'failed' } }),
  ]);
  const publicMembers = members.map(({ voiceEndpoint, ...member }) => ({ ...member, phoneReadiness: phoneReadiness({ ...member, voiceEndpoint }) }));
  return NextResponse.json({ connections, submissions, members: publicMembers, failedCount, ...organization, workerConfigured: !!process.env.LEAD_INTAKE_WORKER_SECRET, emailAlertsConfigured: !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM_EMAIL }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'admin'); if (errorResponse) return errorResponse;
  const parsed = connectionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  const { id, name, provider, enabled, formNames, ...secrets } = parsed.data;
  if (id && !await db.leadConnection.findFirst({ where: { id, organizationId: auth!.organizationId, provider } })) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  const data = { name, provider, enabled, formNames, credentials: { ...encryptData(JSON.stringify(secrets)) } };
  const connection = id
    ? await db.leadConnection.update({ where: { id }, data, select: { id: true } })
    : await db.leadConnection.create({ data: { ...data, organizationId: auth!.organizationId }, select: { id: true } });
  await logAuditEvent({ organizationId: auth!.organizationId, actorUserId: auth!.userId, action: 'lead_connection.save', targetId: connection.id, targetType: 'LeadConnection' });
  return NextResponse.json(connection, { status: id ? 200 : 201 });
}

const settingsSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('member'), membershipId: z.string().uuid(), receivesLeads: z.boolean(), availableForLeads: z.boolean() }),
  z.object({ action: z.literal('deadline'), minutes: z.number().int().min(1).max(10080) }),
  z.object({ action: z.literal('connection'), id: z.string().uuid(), enabled: z.boolean() }),
  z.object({ action: z.literal('retry'), id: z.string().uuid() }),
]);
export async function PATCH(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'admin'); if (errorResponse) return errorResponse;
  const parsed = settingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid settings' }, { status: 400 });
  const body = parsed.data; const organizationId = auth!.organizationId;
  let count = 1;
  if (body.action === 'member') count = (await db.membership.updateMany({ where: { id: body.membershipId, organizationId, role: { in: ['owner', 'admin', 'operator', 'sales'] } }, data: { receivesLeads: body.receivesLeads, availableForLeads: body.availableForLeads } })).count;
  if (body.action === 'deadline') await db.organization.update({ where: { id: organizationId }, data: { firstContactMinutes: body.minutes } });
  if (body.action === 'connection') count = (await db.leadConnection.updateMany({ where: { id: body.id, organizationId }, data: { enabled: body.enabled } })).count;
  if (body.action === 'retry') count = (await db.leadSubmission.updateMany({ where: { id: body.id, organizationId, status: 'failed' }, data: { status: 'pending', attempts: 0, nextAttemptAt: new Date(), error: null } })).count;
  if (!count) return NextResponse.json({ error: 'Record not found or action unavailable' }, { status: 404 });
  await logAuditEvent({ organizationId, actorUserId: auth!.userId, action: `lead_intake.${body.action}`, metadata: body });
  return NextResponse.json({ success: true });
}
