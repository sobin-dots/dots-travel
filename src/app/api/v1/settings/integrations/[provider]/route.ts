import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { deleteTenantIntegration, IntegrationProvider } from '@/lib/integrations/credentials-manager';

export const runtime = 'nodejs';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'admin');
  if (errorResponse) return errorResponse;

  const { provider } = await params;

  try {
    await deleteTenantIntegration(auth!.organizationId, provider as IntegrationProvider);

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'integration.delete',
      metadata: { provider },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      message: `${provider} integration removed successfully`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Failed to remove integration' },
      { status: 500 }
    );
  }
}
