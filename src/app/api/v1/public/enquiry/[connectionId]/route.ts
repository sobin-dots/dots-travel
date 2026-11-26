import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { connectionSecrets, createEnquiry, lockAgency } from '@/lib/lead-intake/service';
import { equalSecret } from '@/lib/lead-intake/normalize';
import { ContactTravelFieldsSchema } from '@/lib/contact-fields';
import { normalizeAndValidatePhone } from '@/lib/phone-validation';
import { z } from 'zod';

export const runtime = 'nodejs';

const publicSubmissionSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(150),
  phone: z.string().superRefine((val, ctx) => {
    const res = normalizeAndValidatePhone(val);
    if (!res.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: res.error || 'Invalid phone number format with country code',
      });
    }
  }).transform(v => {
    const res = normalizeAndValidatePhone(v);
    return res.valid ? res.phone : v;
  }),
  email: z.string().trim().toLowerCase().email().max(254).optional().or(z.literal('')),
  destination: z.string().trim().max(200).optional(),
  preferredTravelMonth: ContactTravelFieldsSchema.shape.preferredTravelMonth,
  tourType: ContactTravelFieldsSchema.shape.tourType,
  numberOfChildren: ContactTravelFieldsSchema.shape.numberOfChildren,
  specialRequirements: ContactTravelFieldsSchema.shape.specialRequirements,
  city: ContactTravelFieldsSchema.shape.city,
  notes: z.string().max(3000).optional(),
  // Invisible bot protection / honeypot
  bot_trap: z.string().max(100).optional(),
});

// GET /api/v1/public/enquiry/[connectionId] - Returns public organization branding
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ connectionId: string }> }
) {
  const { connectionId } = await context.params;
  const cleanId = (connectionId || '').trim();
  const connection = await db.leadConnection.findUnique({
    where: { id: cleanId },
    select: {
      id: true,
      name: true,
      organizationId: true,
      enabled: true,
      provider: true,
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          brandColor: true,
          phone: true,
          website: true,
        },
      },
    },
  });

  if (!connection || !connection.enabled) {
    return NextResponse.json({ error: 'This form connection is inactive or unavailable.' }, { status: 404 });
  }

  return NextResponse.json({
    formId: connection.id,
    formName: connection.name,
    organization: connection.organization,
  });
}

// POST /api/v1/public/enquiry/[connectionId] - Validates secret + orgId, creates enquiry with round robin
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ connectionId: string }> }
) {
  const { connectionId } = await context.params;
  const cleanId = (connectionId || '').trim();

  try {
    const connection = await db.leadConnection.findUnique({
      where: { id: cleanId },
      include: { organization: true },
    });

    if (!connection || !connection.enabled) {
      return NextResponse.json({ error: 'This form connection is inactive or not found.' }, { status: 404 });
    }

    // 1. Verify Secret Key & Organization ID
    const secrets = connectionSecrets(connection.credentials);
    const suppliedSecret = req.headers.get('x-lead-secret') || req.nextUrl.searchParams.get('key');
    const suppliedOrgId = req.headers.get('x-org-id') || req.nextUrl.searchParams.get('orgId');

    // For custom website form API connections, strictly mandate both secret token and organization ID
    if (connection.provider === 'website') {
      if (!suppliedSecret) {
        return NextResponse.json(
          { error: 'Authentication required: missing x-lead-secret header' },
          { status: 401 }
        );
      }
      if (!equalSecret(suppliedSecret, secrets.webhookSecret)) {
        return NextResponse.json(
          { error: 'Authentication failed: invalid x-lead-secret security token' },
          { status: 401 }
        );
      }
      if (!suppliedOrgId) {
        return NextResponse.json(
          { error: 'Authentication required: missing x-org-id header' },
          { status: 403 }
        );
      }
      if (suppliedOrgId !== connection.organizationId) {
        return NextResponse.json(
          { error: 'Organization identifier mismatch: invalid x-org-id' },
          { status: 403 }
        );
      }
    } else {
      // For hosted public form page: verify if supplied
      if (suppliedOrgId && suppliedOrgId !== connection.organizationId) {
        return NextResponse.json({ error: 'Organization identifier mismatch' }, { status: 403 });
      }
      if (suppliedSecret && !equalSecret(suppliedSecret, secrets.webhookSecret)) {
        return NextResponse.json({ error: 'Invalid security token' }, { status: 401 });
      }
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // 2. Bot Trap Check: Honeypot field must be completely empty
    if (body.bot_trap && String(body.bot_trap).trim().length > 0) {
      // Silently accept to trap bots without revealing detection
      return NextResponse.json({ success: true, message: 'Enquiry received' }, { status: 200 });
    }

    // 3. Validate Travel Fields
    const parsed = publicSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Please check your form entries.' },
        { status: 400 }
      );
    }

    const {
      name,
      phone,
      email,
      destination,
      preferredTravelMonth,
      tourType,
      numberOfChildren,
      specialRequirements,
      city,
      notes,
    } = parsed.data;

    // 4. Create Enquiry in DB inside locked transaction (Handles round-robin assignment automatically)
    const result = await db.$transaction(async (tx) => {
      await lockAgency(tx, connection.organizationId);

      const enquiryInput = {
        submissionId: `pub_${crypto.randomBytes(8).toString('hex')}`,
        name,
        phone,
        email: email || undefined,
        destination: destination || undefined,
        preferredTravelMonth: preferredTravelMonth ?? null,
        tourType: tourType || undefined,
        numberOfChildren: numberOfChildren ?? 0,
        specialRequirements: specialRequirements || undefined,
        city: city || undefined,
        notes: notes || undefined,
        formId: connection.id,
        formName: connection.name || 'Public Web Form',
        temperature: 'hot' as const,
        tags: [`source:web_form`, `form:${connection.name}`],
      };

      const lead = await createEnquiry(
        tx,
        connection.organizationId,
        'Hosted Public Form',
        enquiryInput
      );

      // Record lead submission history
      await tx.leadSubmission.create({
        data: {
          organizationId: connection.organizationId,
          connectionId: connection.id,
          externalId: enquiryInput.submissionId,
          status: 'processed',
          leadId: lead.id,
          payload: body,
        },
      });

      // Update connection activity timestamp
      await tx.leadConnection.update({
        where: { id: connection.id },
        data: { lastReceivedAt: new Date() },
      });

      return lead;
    });

    return NextResponse.json({
      success: true,
      message: 'Thank you! Your travel enquiry has been received. Our consultant will contact you shortly.',
      leadId: result.id,
    }, { status: 201 });
  } catch (err: any) {
    console.error('Public form submission error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred while processing your enquiry. Please try again.' },
      { status: 500 }
    );
  }
}
