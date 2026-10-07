import { TelephonyProvider } from './types';
import { PlivoProvider } from './plivo/client';
import { SimulatorProvider } from './simulator/client';

let cachedProvider: TelephonyProvider | null = null;

export interface GetTelephonyProviderOptions {
  mode?: 'simulator' | 'live';
  authId?: string;
  authToken?: string;
}

export function getTelephonyProvider(options: GetTelephonyProviderOptions = {}): TelephonyProvider {
  const mode = options.mode || (process.env.TELEPHONY_MODE === 'live' ? 'live' : 'simulator');

  if (mode === 'live') {
    const authId = options.authId || process.env.PLIVO_AUTH_ID;
    const authToken = options.authToken || process.env.PLIVO_AUTH_TOKEN;

    if (!authId || !authToken) {
      throw new Error(
        'TELEPHONY_MODE is set to "live" but PLIVO_AUTH_ID or PLIVO_AUTH_TOKEN is missing in environment.'
      );
    }
    return new PlivoProvider(authId, authToken);
  }

  // Simulator mode
  if (!cachedProvider || cachedProvider.mode !== 'simulator') {
    const webhookToken = process.env.PLIVO_WEBHOOK_AUTH_TOKEN || 'simulator-auth-token-2026';
    cachedProvider = new SimulatorProvider(webhookToken);
  }
  return cachedProvider;
}

export * from './types';
export * from './webhook-validator';
export { PlivoProvider, SimulatorProvider };
