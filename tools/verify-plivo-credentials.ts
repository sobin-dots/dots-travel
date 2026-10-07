import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { getTelephonyProvider } from '../src/lib/telephony';

async function main() {
  const mode = process.env.TELEPHONY_MODE || 'simulator';
  console.log(`[Tool] verify-plivo-credentials starting in mode: ${mode}`);

  try {
    const provider = getTelephonyProvider();
    const authId = process.env.PLIVO_AUTH_ID || '';
    const authToken = process.env.PLIVO_AUTH_TOKEN || '';

    const result = await provider.verifyCredentials(authId, authToken);

    const output = {
      timestamp: new Date().toISOString(),
      mode: provider.mode,
      success: result.valid,
      authIdLast4: result.authIdLast4,
      accountName: result.accountName,
      cashCredits: result.cashCredits,
      error: result.error,
    };

    console.log('[Tool] Result:', JSON.stringify(output, null, 2));

    const outPath = path.join(process.cwd(), '.tmp', 'verify-credentials-output.json');
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
    console.log(`[Tool] Wrote output evidence to ${outPath}`);

    if (!result.valid) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('[Tool] Execution failed:', err.message);
    process.exit(1);
  }
}

main();
