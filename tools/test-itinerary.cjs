// Runs itinerary regressions against a disposable local PostgreSQL schema.
require('dotenv').config({ quiet: true });
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');

const url = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)) {
  throw new Error('Itinerary database tests require local PostgreSQL. Set DATABASE_URL to a local development database.');
}
const schema = `codex_itinerary_${Date.now()}`;
if (!/^codex_itinerary_\d+$/.test(schema)) throw new Error('Unexpected test schema name.');
url.searchParams.set('schema', schema);
const env = {
  ...process.env, DATABASE_URL: url.toString(), ITINERARY_TEST_DATABASE: '1', ITINERARY_LIVE_AI: '',
  DEEPSEEK_API_KEY: '', OPENAI_API_KEY: '', RESEND_API_KEY: '',
};
const run = args => {
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
  if (result.error) throw result.error;
  return result.status ?? 1;
};

(async () => {
  const admin = new PrismaClient();
  try {
    if (run(['node_modules/prisma/build/index.js', 'migrate', 'deploy']) !== 0) {
      process.exitCode = 1;
      return;
    }
    process.exitCode = run(['node_modules/vitest/vitest.mjs', 'run',
      'tests/itinerary-content.test.ts', 'tests/itinerary-generation-failures.test.ts',
      'tests/itinerary-api-regression.test.ts', 'tests/itinerary-database.test.ts',
      'tests/itinerary-pdf-consistency.test.ts', 'tests/itinerary-pdf-brand-portrait.test.ts',
      'tests/itinerary-proposal-e2e.test.ts', 'tests/itinerary-preparation-rules.test.ts',
      'tests/leads-itinerary.test.ts', 'tests/organization-details-settings.test.ts',
      'tests/email-integration.test.ts', 'tests/itinerary-rules-api.test.ts',
      'tests/itinerary-rules-generator.test.ts', 'tests/tenant-isolation.test.ts',
      'tests/contacts-bulk-import.test.ts', 'tests/crypto.test.ts',
      'tests/security-controls.test.ts', 'tests/message-encoding.test.ts', 'tests/webhook-signatures.test.ts',
    ]);
  } finally {
    await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
    console.log('Disposable itinerary test schema removed.');
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
