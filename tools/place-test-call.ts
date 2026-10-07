import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { getTelephonyProvider } from '../src/lib/telephony';

async function main() {
  const mode = process.env.TELEPHONY_MODE || 'simulator';
  const to = process.argv[2] || '+14155550199';
  const from = process.argv[3] || '+14155552671';
  const answerUrl = `${process.env.PUBLIC_BASE_URL || 'http://localhost:3000'}/api/v1/webhooks/voice/answer`;

  console.log(`[Tool] place-test-call starting in mode: ${mode} from: ${from} to: ${to}`);

  try {
    const provider = getTelephonyProvider();

    const callResult = await provider.createCall({
      from,
      to,
      answerUrl,
      timeLimit: 60,
    });

    const callDetail = await provider.getCall(callResult.callUuid);

    const output = {
      timestamp: new Date().toISOString(),
      mode: provider.mode,
      from,
      to,
      answerUrl,
      callResult,
      callDetail,
    };

    console.log('[Tool] Result:', JSON.stringify(output, null, 2));

    const outPath = path.join(process.cwd(), '.tmp', 'place-call-output.json');
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
    console.log(`[Tool] Wrote output evidence to ${outPath}`);
  } catch (err: any) {
    console.error('[Tool] Execution failed:', err.message);
    process.exit(1);
  }
}

main();
