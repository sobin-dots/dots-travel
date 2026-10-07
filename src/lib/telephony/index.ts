import { TelephonyProvider } from './types';
import { PlivoProvider } from './plivo/client';

export interface GetTelephonyProviderOptions {
  authId?: string;
  authToken?: string;
}

export function getTelephonyProvider(options: GetTelephonyProviderOptions = {}): TelephonyProvider {
  const authId = options.authId || process.env.PLIVO_AUTH_ID;
  const authToken = options.authToken || process.env.PLIVO_AUTH_TOKEN;

  if (!authId || !authToken) {
    throw new Error(
      'Live Plivo credentials required: PLIVO_AUTH_ID or PLIVO_AUTH_TOKEN is missing in environment.'
    );
  }
  return new PlivoProvider(authId, authToken);
}

export * from './types';
export * from './webhook-validator';
export { PlivoProvider };
