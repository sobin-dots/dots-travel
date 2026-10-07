import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { CreateContactRequestSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

// GET /api/v1/contacts - List contacts
export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const contacts = await db.contact.findMany({
    where: { organizationId: auth!.organizationId },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({
    api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
    objects: contacts,
    totalCount: contacts.length,
  });
}

// POST /api/v1/contacts - Add a new contact
export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  try {
    const body = await req.json();
    const parsed = CreateContactRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { api_id: 'val_err', error: parsed.error.issues[0]?.message || 'Invalid contact data' },
        { status: 400 }
      );
    }

    const { name, phone, email, company, notes } = parsed.data;

    // Check if contact with same phone already exists
    const existing = await db.contact.findUnique({
      where: {
        organizationId_phone: {
          organizationId: auth!.organizationId,
          phone,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { api_id: 'conflict', error: `A contact with phone number ${phone} already exists (${existing.name})` },
        { status: 409 }
      );
    }

    const contact = await db.contact.create({
      data: {
        organizationId: auth!.organizationId,
        name,
        phone,
        email: email || null,
        company: company || null,
        notes: notes || null,
      },
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'contact.create',
      targetType: 'Contact',
      targetId: contact.id,
      metadata: { name, phone, company },
    });

    return NextResponse.json(
      {
        api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
        contact,
        message: 'Contact added successfully',
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('Create contact error:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error creating contact' },
      { status: 500 }
    );
  }
}
