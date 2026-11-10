import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { normalizePhoneNumber } from '@/lib/csv-parser';

export const runtime = 'nodejs';

interface IncomingBulkContact {
  name: string;
  phone: string;
  email?: string;
  company?: string;
  notes?: string;
}

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  try {
    const body = await req.json();
    const rawContacts: IncomingBulkContact[] = Array.isArray(body?.contacts) ? body.contacts : [];
    const defaultCountryCode: string = typeof body?.defaultCountryCode === 'string' ? body.defaultCountryCode : '+91';

    if (rawContacts.length === 0) {
      return NextResponse.json(
        { api_id: 'val_err', error: 'No contacts provided in payload' },
        { status: 400 }
      );
    }

    if (rawContacts.length > 1000) {
      return NextResponse.json(
        { api_id: 'limit_exceeded', error: 'Maximum batch size is 1,000 contacts per upload' },
        { status: 400 }
      );
    }

    const seenInBatch = new Set<string>();
    const batchDuplicates: Array<{ name: string; phone: string; reason: string }> = [];
    const normalizedBatch: Array<{
      name: string;
      phone: string;
      email: string | null;
      company: string | null;
      notes: string | null;
    }> = [];

    // Step 1: Normalize and deduplicate within the incoming batch
    for (const item of rawContacts) {
      const trimmedName = (item.name || '').trim();
      if (!trimmedName || trimmedName.length < 2) {
        batchDuplicates.push({
          name: trimmedName || 'Unknown',
          phone: item.phone || '',
          reason: 'Invalid or missing name (minimum 2 characters required)',
        });
        continue;
      }

      const normalizedPhone = normalizePhoneNumber(item.phone || '', defaultCountryCode);
      if (!normalizedPhone) {
        batchDuplicates.push({
          name: trimmedName,
          phone: item.phone || '',
          reason: 'Invalid phone number format',
        });
        continue;
      }

      if (seenInBatch.has(normalizedPhone)) {
        batchDuplicates.push({
          name: trimmedName,
          phone: normalizedPhone,
          reason: 'Duplicate phone number within this upload file',
        });
        continue;
      }

      seenInBatch.add(normalizedPhone);

      // Validate email format if provided
      const trimmedEmail = (item.email || '').trim();
      const validEmail = trimmedEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail) ? trimmedEmail : null;

      normalizedBatch.push({
        name: trimmedName.slice(0, 100),
        phone: normalizedPhone,
        email: validEmail,
        company: (item.company || '').trim().slice(0, 100) || null,
        notes: (item.notes || '').trim().slice(0, 500) || null,
      });
    }

    // Step 2: Query database for existing contacts in this organization with these phone numbers
    const phonesToCheck = normalizedBatch.map((c) => c.phone);
    const existingInDb = await db.contact.findMany({
      where: {
        organizationId: auth!.organizationId,
        phone: { in: phonesToCheck },
      },
      select: {
        phone: true,
        name: true,
      },
    });

    const existingDbSet = new Map<string, string>();
    for (const ex of existingInDb) {
      existingDbSet.set(ex.phone, ex.name);
    }

    // Step 3: Partition into to-insert vs skipped
    const toInsert: Array<{
      id: string;
      organizationId: string;
      name: string;
      phone: string;
      email: string | null;
      company: string | null;
      notes: string | null;
    }> = [];

    const skipped: Array<{ name: string; phone: string; reason: string }> = [...batchDuplicates];

    for (const contact of normalizedBatch) {
      const existingName = existingDbSet.get(contact.phone);
      if (existingName) {
        skipped.push({
          name: contact.name,
          phone: contact.phone,
          reason: `Already exists in directory (${existingName})`,
        });
      } else {
        toInsert.push({
          id: crypto.randomUUID(),
          organizationId: auth!.organizationId,
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
          company: contact.company,
          notes: contact.notes,
        });
      }
    }

    // Step 4: Batch insert the new contacts
    if (toInsert.length > 0) {
      await db.contact.createMany({
        data: toInsert,
        skipDuplicates: true,
      });
    }

    // Step 5: Audit log
    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'contact.bulk_import',
      targetType: 'Contact',
      metadata: {
        totalSubmitted: rawContacts.length,
        importedCount: toInsert.length,
        skippedCount: skipped.length,
      },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      success: true,
      importedCount: toInsert.length,
      skippedCount: skipped.length,
      totalSubmitted: rawContacts.length,
      skippedDetails: skipped.slice(0, 50), // Return sample of skipped reasons
      message: `Successfully imported ${toInsert.length} contacts (${skipped.length} skipped).`,
    });
  } catch (err: any) {
    console.error('Bulk contacts import error:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal server error processing bulk contacts' },
      { status: 500 }
    );
  }
}

