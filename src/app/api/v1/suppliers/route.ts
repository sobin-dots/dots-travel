import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { z } from 'zod';

export const runtime = 'nodejs';

const CreateSupplierSchema = z.object({
  name: z.string().min(2).max(100),
  category: z.enum(['hotels', 'flights', 'transport', 'activities', 'packages']).default('hotels'),
  email: z.string().email(),
  phone: z.string().optional(),
  contactPerson: z.string().optional(),
  notes: z.string().optional(),
});

// GET /api/v1/suppliers - List all suppliers
export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const suppliers = await db.supplier.findMany({
    where: { organizationId: auth!.organizationId },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({
    api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
    objects: suppliers,
    totalCount: suppliers.length,
  });
}

// POST /api/v1/suppliers - Create supplier
export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  try {
    const body = await req.json();
    const parsed = CreateSupplierSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { api_id: 'val_err', error: parsed.error.issues[0]?.message || 'Invalid supplier data' },
        { status: 400 }
      );
    }

    const { name, category, email, phone, contactPerson, notes } = parsed.data;

    const existing = await db.supplier.findUnique({
      where: {
        organizationId_email: {
          organizationId: auth!.organizationId,
          email,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { api_id: 'conflict', error: `A supplier with email ${email} already exists (${existing.name})` },
        { status: 409 }
      );
    }

    const supplier = await db.supplier.create({
      data: {
        organizationId: auth!.organizationId,
        name,
        category,
        email,
        phone: phone || null,
        contactPerson: contactPerson || null,
        notes: notes || null,
      },
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'supplier.create',
      targetType: 'Supplier',
      targetId: supplier.id,
      metadata: { name, category, email },
    });

    return NextResponse.json(
      {
        api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
        supplier,
        message: 'Supplier created successfully',
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('Create supplier error:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error creating supplier' },
      { status: 500 }
    );
  }
}
