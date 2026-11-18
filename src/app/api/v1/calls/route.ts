import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { CreateCallRequestSchema } from '@/lib/schemas';
import { getTelephonyProvider, getTenantTelephonyProvider } from '@/lib/telephony';
import { contactScope, managesLeads } from '@/lib/lead-access';
import { syncRecentOrgCallsFromPlivo } from '@/lib/telephony/plivo-call-sync';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'viewer');
  if (errorResponse) return errorResponse;

  const url = new URL(req.url);
  const status = url.searchParams.get('status') || undefined;
  const direction = url.searchParams.get('direction') || undefined;
  const phoneNumberId = url.searchParams.get('phoneNumberId') || undefined;
  const startDate = url.searchParams.get('startDate') || undefined;
  const endDate = url.searchParams.get('endDate') || undefined;
  const search = (url.searchParams.get('search') || '').trim();
  const contactPhone = (url.searchParams.get('contactPhone') || '').trim();
  const staffUserId = (url.searchParams.get('staffUserId') || '').trim();
  const syncParam = url.searchParams.get('sync');
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || '20'), 1), 100);
  const offset = Math.max(Number(url.searchParams.get('offset') || '0'), 0);

  const orgId = auth!.organizationId;
  if (syncParam === '1') {
    await syncRecentOrgCallsFromPlivo(orgId, { force: true });
  }
  const andConditions: any[] = [{ organizationId: orgId }];

  if (status) andConditions.push({ status });
  if (direction) andConditions.push({ direction });
  if (phoneNumberId) andConditions.push({ phoneNumberId });

  if (startDate || endDate) {
    const startedAtFilter: any = {};
    if (startDate) {
      const parsedStart = new Date(startDate);
      if (!Number.isNaN(parsedStart.getTime())) {
        startedAtFilter.gte = parsedStart;
      }
    }
    if (endDate) {
      const parsedEnd = new Date(endDate);
      if (!Number.isNaN(parsedEnd.getTime())) {
        startedAtFilter.lte = parsedEnd;
      }
    }
    if (Object.keys(startedAtFilter).length > 0) {
      andConditions.push({ startedAt: startedAtFilter });
    }
  }

  // Load organization contacts so we can both filter by customer name/phone and enrich call rows
  const [orgContacts, accessibleContacts] = await Promise.all([
    db.contact.findMany({ where: { organizationId: orgId }, select: { id: true, name: true, phone: true, email: true, assignedToId: true } }),
    auth!.role === 'viewer' || managesLeads(auth!) ? Promise.resolve([])
      : db.contact.findMany({ where: contactScope(auth!), select: { id: true } }),
  ]);
  const accessibleContactIds = new Set(accessibleContacts.map(contact => contact.id));

  if (contactPhone) {
    const cleanTarget = contactPhone.replace(/\D/g, '');
    const tail10 = cleanTarget.length >= 10 ? cleanTarget.slice(-10) : cleanTarget;
    andConditions.push({
      OR: [
        { from: { contains: contactPhone, mode: 'insensitive' } },
        { to: { contains: contactPhone, mode: 'insensitive' } },
        ...(tail10
          ? [
              { from: { contains: tail10 } },
              { to: { contains: tail10 } },
            ]
          : []),
      ],
    });
  }

  if (search) {
    const cleanDigits = search.replace(/\D/g, '');
    const matchingContactPhones = orgContacts
      .filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          (c.phone || '').toLowerCase().includes(search.toLowerCase()) ||
          (cleanDigits.length >= 4 && (c.phone || '').replace(/\D/g, '').includes(cleanDigits))
      )
      .flatMap((c) => {
        if (!c.phone) return [];
        const digits = c.phone.replace(/\D/g, '');
        const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
        return [c.phone, ...(last10 ? [last10] : [])];
      });

    const uniquePhones = Array.from(new Set(matchingContactPhones)).filter(Boolean);

    andConditions.push({
      OR: [
        { from: { contains: search, mode: 'insensitive' } },
        { to: { contains: search, mode: 'insensitive' } },
        { plivoCallUuid: { contains: search, mode: 'insensitive' } },
        ...(cleanDigits.length >= 4
          ? [
              { from: { contains: cleanDigits } },
              { to: { contains: cleanDigits } },
            ]
          : []),
        ...uniquePhones.flatMap((ph) => [
          { from: { contains: ph } },
          { to: { contains: ph } },
        ]),
      ],
    });
  }

  if (staffUserId) {
    const staffAudits = await db.auditLog.findMany({
      where: {
        organizationId: orgId,
        actorUserId: staffUserId,
        targetType: 'Call',
      },
      select: { targetId: true },
    });
    const auditedCallIds = staffAudits
      .map((a) => a.targetId)
      .filter((id): id is string => Boolean(id));

    andConditions.push({
      OR: [
        ...(auditedCallIds.length > 0 ? [{ id: { in: auditedCallIds } }] : []),
        { assignedToId: staffUserId },
        {
          requestedParams: {
            path: ['actorUserId'],
            equals: staffUserId,
          },
        },
      ],
    });
  }

  const where: any =
    andConditions.length === 1 ? andConditions[0] : { AND: andConditions };

  const [calls, totalCount] = await Promise.all([
    db.call.findMany({
      where,
      include: {
        phoneNumber: {
          select: {
            id: true,
            e164: true,
            friendlyName: true,
          },
        },
        recordings: {
          select: {
            id: true,
            plivoRecordingId: true,
            durationSeconds: true,
            status: true,
            createdAt: true,
          },
        },
        transcriptions: {
          select: {
            id: true,
            status: true,
            text: true,
          },
        },
      },
      orderBy: { startedAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.call.count({ where }),
  ]);

  // Resolve staff users for the returned page of calls
  const callIds = calls.map((c) => c.id);
  const [callAudits, orgMembers] = await Promise.all([
    callIds.length > 0
      ? db.auditLog.findMany({
          where: {
            organizationId: orgId,
            targetType: 'Call',
            targetId: { in: callIds },
          },
          select: { targetId: true, actorUserId: true },
        })
      : Promise.resolve([]),
    db.membership.findMany({
      where: { organizationId: orgId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  const userById = new Map<string, { id: string; name: string | null; email: string }>();
  for (const m of orgMembers) {
    if (m.user) {
      userById.set(m.user.id, m.user);
    }
  }

  const actorByCallId = new Map<string, string>();
  for (const a of callAudits) {
    if (a.targetId && a.actorUserId) {
      actorByCallId.set(a.targetId, a.actorUserId);
    }
  }

  const fullPhone = (value?: string | null) => {
    const digits = String(value || '').trim().replace(/[\s().+-]/g, '').replace(/^00/, '');
    return /^[1-9]\d{6,14}$/.test(digits) ? digits : null;
  };
  const contactById = new Map(orgContacts.map(contact => [contact.id, contact]));
  const contactsByPhone = new Map<string, (typeof orgContacts)[number][]>();
  for (const contact of orgContacts) {
    const phone = fullPhone(contact.phone);
    if (phone) contactsByPhone.set(phone, [...(contactsByPhone.get(phone) || []), contact]);
  }

  const enrichedCalls = calls.map((c) => {
    // A linked enquiry is authoritative even after a phone edit. For repeat
    // calls, match the customer's full number, never the agency number or a suffix.
    const linkedContact = c.enquiryContactId ? contactById.get(c.enquiryContactId) : undefined;
    const customerPhone = fullPhone(c.direction === 'outbound' ? c.to : c.from);
    const phoneMatches = customerPhone ? contactsByPhone.get(customerPhone) || [] : [];
    const matchedContact = linkedContact || (phoneMatches.length === 1 ? phoneMatches[0] : undefined);

    const reqParams = (c.requestedParams && typeof c.requestedParams === 'object' ? c.requestedParams : {}) as any;
    const resolvedActorId = c.assignedToId || reqParams.actorUserId || actorByCallId.get(c.id);
    const matchedStaff = resolvedActorId ? userById.get(resolvedActorId) : null;
    const enquiryOwner = matchedContact?.assignedToId ? userById.get(matchedContact.assignedToId) : null;

    // Deduplicate recordings per call to at most 1 primary recording
    const sortedRecs = Array.isArray(c.recordings)
      ? [...c.recordings].sort((a, b) => Number(b.durationSeconds || 0) - Number(a.durationSeconds || 0))
      : [];
    const primaryRecs = sortedRecs.length > 0 ? [sortedRecs[0]] : [];

    return {
      ...c,
      recordings: primaryRecs,
      contactName: matchedContact?.name || null,
      contactId: matchedContact?.id || null,
      enquiry: matchedContact ? { id: matchedContact.id,
        assignedTo: enquiryOwner ? { id: enquiryOwner.id, name: enquiryOwner.name } : null,
        canOpen: auth!.role !== 'viewer' && (managesLeads(auth!) || accessibleContactIds.has(matchedContact.id)),
      } : null,
      staffUser: matchedStaff
        ? { id: matchedStaff.id, name: matchedStaff.name, email: matchedStaff.email }
        : reqParams.actorEmail || reqParams.actorName
        ? { id: resolvedActorId || null, name: reqParams.actorName || null, email: reqParams.actorEmail || null }
        : null,
    };
  });

  return NextResponse.json({
    api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
    totalCount,
    limit,
    offset,
    objects: enrichedCalls,
  });
}

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  let createdCallId: string | null = null;

  try {
    const body = await req.json();
    const parsed = CreateCallRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { api_id: 'bad_req', error: parsed.error.issues[0]?.message || 'Invalid call request parameters' },
        { status: 400 }
      );
    }

    const {
      phoneNumberId,
      to,
      mode,
      xml,
      forwardTo,
      url,
      record,
      transcribe,
      transcriptionLanguage,
      machineDetection,
      timeLimit,
    } = parsed.data;

    // Verify phone number ownership
    const phoneNumber = await db.phoneNumber.findFirst({
      where: {
        id: phoneNumberId,
        organizationId: auth!.organizationId,
        status: 'active',
      },
      include: {
        organization: true,
      },
    });

    if (!phoneNumber) {
      return NextResponse.json(
        { api_id: 'not_found', error: 'Active source phone number not found in organization' },
        { status: 404 }
      );
    }

    // Resolve transcription policy cascade:
    // Org default -> PhoneNumber setting -> Per-call request override
    const resolvedTranscription =
      transcribe !== undefined
        ? transcribe
        : phoneNumber.transcribeEnabled !== undefined
        ? phoneNumber.transcribeEnabled
        : phoneNumber.organization.transcriptionDefaultEnabled;

    const resolvedLanguage = transcriptionLanguage || phoneNumber.transcriptionLanguage || 'en-US';

    // Construct Answer URL and Webhook URLs preferring live non-local request origin over stale DB webhookUrls
    const { getTenantIntegration, resolveOrgWebhookUrls } = await import('@/lib/integrations/credentials-manager');
    const plivoInteg = await getTenantIntegration(auth!.organizationId, 'plivo');
    const proto = req.headers.get('x-forwarded-proto') || (req.url.startsWith('https') ? 'https' : 'http');
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    const requestBase = host ? `${proto}://${host}` : 'http://localhost:3000';
    const { effectiveBaseUrl: effectiveBase, webhookUrls: dbWebhookUrls } = resolveOrgWebhookUrls(
      auth!.organizationId,
      requestBase,
      plivoInteg?.metadata
    );

    let answerUrl: string;

    if (mode === 'url' && url) {
      answerUrl = url;
    } else {
      const baseAnswerUrl = dbWebhookUrls.voiceAnswer || `${effectiveBase}/api/v1/webhooks/voice/answer?orgId=${auth!.organizationId}`;
      const sep = baseAnswerUrl.includes('?') ? '&' : '?';
      answerUrl = `${baseAnswerUrl}${sep}mode=${mode}`;
      if (mode === 'bridge' && forwardTo) {
        // In bridge mode: provider dials the staff member first, then on answer connects to customer 'to'
        answerUrl += `&connectTo=${encodeURIComponent(to)}&forwardTo=${encodeURIComponent(forwardTo)}`;
      } else if (mode === 'forward' && forwardTo) {
        answerUrl += `&forwardTo=${encodeURIComponent(forwardTo)}`;
      }
    }

    const ringUrl = dbWebhookUrls.voiceStatus || `${effectiveBase}/api/v1/webhooks/voice/status?orgId=${auth!.organizationId}`;
    const hangupUrl = dbWebhookUrls.voiceHangup || `${effectiveBase}/api/v1/webhooks/voice/hangup?orgId=${auth!.organizationId}`;

    // For Mobile Phone Bridge: first dial the staff/agent's mobile phone (forwardTo),
    // and once they pick up, Plivo executes answerUrl to bridge them to the customer recipient (to).
    const outboundDialTarget = (mode === 'bridge' && forwardTo) ? forwardTo : to;

    // Initialize Call record with temporary UUID
    const tempUuid = `temp_${crypto.randomBytes(12).toString('hex')}`;
    const initialCall = await db.call.create({
      data: {
        organizationId: auth!.organizationId,
        phoneNumberId: phoneNumber.id,
        plivoCallUuid: tempUuid,
        direction: 'outbound',
        status: 'queued',
        from: phoneNumber.e164,
        to, // Preserves the customer destination on the call record
        recordingEnabled: record,
        transcriptionEnabled: resolvedTranscription,
        transcriptionLanguage: resolvedLanguage,
        requestedMode: mode,
        requestedParams: {
          forwardTo,
          staffPhone: (mode === 'bridge' && forwardTo) ? forwardTo : undefined,
          customerPhone: to,
          customXml: xml,
          customUrl: url,
          actorUserId: auth!.userId,
          actorEmail: auth!.email,
        },
      },
    });
    createdCallId = initialCall.id;

    // Invoke Telephony Provider for tenant
    const provider = await getTenantTelephonyProvider(auth!.organizationId);
    const result = await provider.createCall({
      from: phoneNumber.e164,
      to: outboundDialTarget,
      answerUrl,
      ringUrl,
      hangupUrl,
      timeLimit,
      machineDetection,
    });

    // Update with real Call UUID from provider
    const updatedCall = await db.call.update({
      where: { id: initialCall.id },
      data: {
        plivoCallUuid: result.callUuid,
        requestUuid: result.requestUuid,
      },
      include: {
        phoneNumber: true,
      },
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'call.create',
      targetType: 'Call',
      targetId: updatedCall.id,
      metadata: { from: phoneNumber.e164, to, mode, callUuid: result.callUuid },
    });

    return NextResponse.json({
      api_id: result.apiId,
      message: result.message,
      call: updatedCall,
    }, { status: 201 });
  } catch (err: any) {
    console.error('Call placement error:', err);
    try {
      if (createdCallId) {
        await db.call.update({
          where: { id: createdCallId },
          data: {
            status: 'failed',
            hangupCauseCode: 500,
            hangupCauseName: err.message?.slice(0, 100),
          },
        });
      }
    } catch {}
    return NextResponse.json(
      { api_id: 'provider_err', error: err.message },
      { status: 500 }
    );
  }
}
