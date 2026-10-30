import { TelephonyProvider } from './types';
import { PlivoProvider } from './plivo/client';
import { Msg91Provider } from './msg91/client';
import { getTenantIntegration } from '../integrations/credentials-manager';
import { db } from '@/lib/db';
import { decryptData } from '@/lib/crypto';

export interface GetTelephonyProviderOptions {
  authId?: string;
  authToken?: string;
  organizationId?: string;
  provider?: 'plivo' | 'msg91';
  msg91AuthKey?: string;
  senderId?: string;
  callerId?: string;
}

/**
 * Returns a configured TelephonyProvider for a tenant.
 * Uses the tenant's primary telephony provider selection and decrypted BYOK credentials.
 */
export async function getTenantTelephonyProvider(
  organizationId: string,
  preferredProvider?: 'plivo' | 'msg91'
): Promise<TelephonyProvider> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { primaryTelephonyProvider: true },
  });

  const activeProvider = preferredProvider || (org?.primaryTelephonyProvider as 'plivo' | 'msg91') || 'plivo';

  if (activeProvider === 'msg91') {
    const integration = await getTenantIntegration(organizationId, 'msg91');
    if (integration && integration.credentials?.authKey) {
      return new Msg91Provider(integration.credentials.authKey, {
        senderId: integration.credentials.senderId,
        callerId: integration.credentials.callerId,
      });
    }
    throw new Error('MSG91 is set as your telephony provider, but no active MSG91 credentials were found. Please configure your MSG91 Auth Key in Settings.');
  }

  // Active provider: Plivo
  const integration = await getTenantIntegration(organizationId, 'plivo');
  if (integration && integration.credentials?.authId && integration.credentials?.authToken) {
    return new PlivoProvider(integration.credentials.authId, integration.credentials.authToken);
  }

  // Fallback to legacy PlivoAccount model if available
  const legacyPlivo = await db.plivoAccount.findFirst({
    where: { organizationId },
  });

  if (legacyPlivo) {
    try {
      const authId = decryptData({
        ciphertext: legacyPlivo.authIdEncrypted,
        iv: legacyPlivo.encIv,
        authTag: legacyPlivo.encAuthTag,
      });
      const authToken = decryptData({
        ciphertext: legacyPlivo.authTokenEncrypted,
        iv: legacyPlivo.encIv,
        authTag: legacyPlivo.encAuthTag,
      });
      if (authId && authToken) {
        return new PlivoProvider(authId, authToken);
      }
    } catch {}
  }

  // Fallback to server env only if TELEPHONY_MODE is simulator or development fallback
  if (process.env.TELEPHONY_MODE !== 'live' && process.env.PLIVO_AUTH_ID && process.env.PLIVO_AUTH_TOKEN) {
    return new PlivoProvider(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);
  }

  throw new Error('No telephony provider credentials configured for this organization. Please configure your Plivo or MSG91 keys in Settings.');
}

/**
 * Direct synchronous provider getter (for script utilities or direct credentials).
 */
export function getTelephonyProvider(options: GetTelephonyProviderOptions = {}): TelephonyProvider {
  if (options.provider === 'msg91' && options.msg91AuthKey) {
    return new Msg91Provider(options.msg91AuthKey, {
      senderId: options.senderId,
      callerId: options.callerId,
    });
  }

  const authId = options.authId || process.env.PLIVO_AUTH_ID;
  const authToken = options.authToken || process.env.PLIVO_AUTH_TOKEN;

  if (!authId || !authToken) {
    throw new Error(
      'Live Plivo credentials required: PLIVO_AUTH_ID or PLIVO_AUTH_TOKEN is missing.'
    );
  }
  return new PlivoProvider(authId, authToken);
}

export * from './types';
export * from './webhook-validator';
export { PlivoProvider, Msg91Provider };
