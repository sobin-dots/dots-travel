import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { getTelephonyProvider } from '../src/lib/telephony';

async function main() {
  const mode = process.env.TELEPHONY_MODE || 'simulator';
  const dst = process.argv[2] || '+14155550199';
  const text = process.argv[3] || 'Plivo Communications Platform test message at ' + new Date().toISOString();
  console.log(`[Tool] send-test-sms starting in mode: ${mode} to: ${dst}`);

  try {
    const provider = getTelephonyProvider();

    const sendResult = await provider.sendMessage({
      dst,
      text,
      src: '+14155552671',
    });

    const firstUuid = sendResult.messageUuids[0];
    const statusDetail = firstUuid ? await provider.getMessage(firstUuid) : null;

    const output = {
      timestamp: new Date().toISOString(),
      mode: provider.mode,
      destination: dst,
      text,
      sendResult,
      statusDetail,
    };

    console.log('[Tool] Result:', JSON.stringify(output, null, 2));

    const outPath = path.join(process.cwd(), '.tmp', 'send-sms-output.json');
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
    console.log(`[Tool] Wrote output evidence to ${outPath}`);
  } catch (err: any) {
    console.error('[Tool] Execution failed:', err.message);
    process.exit(1);
  }
}

main();
