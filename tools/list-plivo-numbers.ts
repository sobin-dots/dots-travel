import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { getTelephonyProvider } from '../src/lib/telephony';

async function main() {
  const mode = process.env.TELEPHONY_MODE || 'simulator';
  const countryIso = process.argv[2] || 'US';
  console.log(`[Tool] list-plivo-numbers starting in mode: ${mode} for country: ${countryIso}`);

  try {
    const provider = getTelephonyProvider();

    // 1. Search available inventory
    const available = await provider.searchNumbers({
      countryIso,
      limit: 5,
    });

    // 2. List currently owned numbers
    const owned = await provider.listOwnedNumbers({ limit: 10 });

    const output = {
      timestamp: new Date().toISOString(),
      mode: provider.mode,
      countryIso,
      availableCount: available.length,
      availableSample: available,
      ownedCount: owned.length,
      owned: owned,
    };

    console.log('[Tool] Result:', JSON.stringify(output, null, 2));

    const outPath = path.join(process.cwd(), '.tmp', 'list-numbers-output.json');
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
    console.log(`[Tool] Wrote output evidence to ${outPath}`);
  } catch (err: any) {
    console.error('[Tool] Execution failed:', err.message);
    process.exit(1);
  }
}

main();
