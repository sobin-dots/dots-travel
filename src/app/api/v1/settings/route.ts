import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { UpdateSettingsSchema } from '@/lib/schemas';
import { encryptData, maskAuthId } from '@/lib/crypto';
import { getTelephonyProvider } from '@/lib/telephony';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'admin');
  if (errorResponse) return errorResponse;

  const org = await db.organization.findUnique({
    where: { id: auth!.organizationId },
    include: {
      plivoAccounts: {
        select: {
          id: true,
          label: true,
          authIdLast4: true,
          status: true,
          lastVerifiedAt: true,
          lastVerifyError: true,
        },
      },
    },
  });

  return NextResponse.json({
    api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
    telephonyMode: 'live',
    organization: org,
  });
}

export async function PATCH(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'admin');
  if (errorResponse) return errorResponse;

  try {
    const body = await req.json();
    const parsed = UpdateSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { api_id: 'bad_req', error: parsed.error.issues[0]?.message || 'Invalid settings parameters' },
        { status: 400 }
      );
    }

    const {
      transcriptionDefaultEnabled,
      transcriptionLanguage,
      recordingRetentionDays,
      notificationEmail,
      redactMessageContent,
      plivoAuthId,
      plivoAuthToken,
    } = parsed.data;

    const updateData: any = {};
    if (transcriptionDefaultEnabled !== undefined) updateData.transcriptionDefaultEnabled = transcriptionDefaultEnabled;
    if (transcriptionLanguage !== undefined) updateData.transcriptionLanguage = transcriptionLanguage;
    if (recordingRetentionDays !== undefined) updateData.recordingRetentionDays = recordingRetentionDays;
    if (notificationEmail !== undefined) updateData.notificationEmail = notificationEmail;
    if (redactMessageContent !== undefined) updateData.redactMessageContent = redactMessageContent;

    const updatedOrg = await db.organization.update({
      where: { id: auth!.organizationId },
      data: updateData,
    });

    // Update credentials if provided
    if (plivoAuthId && plivoAuthToken) {
      const encId = encryptData(plivoAuthId);
      const encToken = encryptData(plivoAuthToken);

      const existingAccount = await db.plivoAccount.findFirst({
        where: { organizationId: auth!.organizationId },
      });

      // Verify credentials with provider
      const provider = getTelephonyProvider();
      const verifyResult = await provider.verifyCredentials(plivoAuthId, plivoAuthToken);

      if (existingAccount) {
        await db.plivoAccount.update({
          where: { id: existingAccount.id },
          data: {
            authIdEncrypted: encId.ciphertext,
            authIdLast4: plivoAuthId.slice(-4),
            authTokenEncrypted: encToken.ciphertext,
            encIv: encId.iv,
            encAuthTag: encId.authTag,
            encKeyVersion: encId.keyVersion,
            status: verifyResult.valid ? 'verified' : 'failed',
            lastVerifiedAt: new Date(),
            lastVerifyError: verifyResult.error,
          },
        });
      } else {
        await db.plivoAccount.create({
          data: {
            organizationId: auth!.organizationId,
            label: 'Primary Account',
            authIdEncrypted: encId.ciphertext,
            authIdLast4: plivoAuthId.slice(-4),
            authTokenEncrypted: encToken.ciphertext,
            encIv: encId.iv,
            encAuthTag: encId.authTag,
            encKeyVersion: encId.keyVersion,
            status: verifyResult.valid ? 'verified' : 'failed',
            lastVerifiedAt: new Date(),
            lastVerifyError: verifyResult.error,
          },
        });
      }
    }

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'settings.update',
      metadata: { updatedFields: Object.keys(parsed.data) },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      message: 'Settings updated successfully',
      organization: updatedOrg,
    });
  } catch (err: any) {
    return NextResponse.json(
      { api_id: 'server_err', error: err.message },
      { status: 500 }
    );
  }
}
