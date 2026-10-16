import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import {
  saveTenantIntegration,
  getTenantIntegrationsSummary,
  IntegrationProvider,
} from '@/lib/integrations/credentials-manager';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'admin');
  if (errorResponse) return errorResponse;

  try {
    const summary = await getTenantIntegrationsSummary(auth!.organizationId);

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      ...summary,
    });
  } catch (err: any) {
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Failed to fetch tenant integrations' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'admin');
  if (errorResponse) return errorResponse;

  try {
    const body = await req.json();
    const { provider, credentials, metadata, label } = body;

    if (!provider || !credentials) {
      return NextResponse.json(
        { api_id: 'bad_req', error: 'Missing required fields: provider and credentials' },
        { status: 400 }
      );
    }

    const validProviders: IntegrationProvider[] = ['openai', 'deepseek', 'plivo', 'msg91', 'whatsapp'];
    if (!validProviders.includes(provider as IntegrationProvider)) {
      return NextResponse.json(
        { api_id: 'bad_req', error: `Invalid provider. Must be one of: ${validProviders.join(', ')}` },
        { status: 400 }
      );
    }

    const result = await saveTenantIntegration(auth!.organizationId, {
      provider,
      credentials,
      metadata,
      label,
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'integration.configure',
      metadata: {
        provider,
        verified: result.verification.valid,
        error: result.verification.error,
      },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      message: result.verification.valid
        ? `${provider.toUpperCase()} integration verified and saved successfully`
        : `Saved with warning: ${result.verification.error}`,
      success: result.success,
      integration: {
        id: result.integration.id,
        provider: result.integration.provider,
        category: result.integration.category,
        maskedDetails: result.integration.maskedDetails,
        status: result.integration.status,
        lastVerifiedAt: result.integration.lastVerifiedAt,
        lastVerifyError: result.integration.lastVerifyError,
        metadata: result.integration.metadata,
      },
      verification: result.verification,
    });
  } catch (err: any) {
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Failed to configure integration' },
      { status: 500 }
    );
  }
}
