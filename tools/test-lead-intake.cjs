// Run the release checks against a disposable schema on the configured LOCAL database.
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');

async function main() {
  const url = new URL(process.env.DATABASE_URL);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('This runner only accepts a local PostgreSQL server.');
  const schema = `lead_release_test_${randomBytes(8).toString('hex')}`;
  url.searchParams.set('schema', schema);
  const admin = new PrismaClient();
  let created = false;
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); created = true;
    const env = { ...process.env, DATABASE_URL: url.toString(), LEAD_INTAKE_DATABASE_TESTS: '1', ENCRYPTION_KEK: randomBytes(32).toString('base64'), JWT_ACCESS_SECRET: randomBytes(32).toString('hex'), RESEND_API_KEY: '', RESEND_FROM_EMAIL: '' };
    for (const args of [
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      [require('node:path').join(require.resolve('vitest/package.json'), '..', 'vitest.mjs'), 'run', 'tests/lead-intake.test.ts', 'tests/lead-intake-database.test.ts', 'tests/itinerary-api-regression.test.ts', 'tests/contacts-bulk-import.test.ts', 'tests/tenant-isolation.test.ts', 'tests/security-controls.test.ts', 'tests/itinerary-comparison.test.ts', 'tests/priorities-database.test.ts', 'tests/contact-details-database.test.ts', 'tests/enquiry-workflow-database.test.ts'],
    ]) {
      const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
      if (result.status !== 0) { process.exitCode = result.status || 1; break; }
    }
  } finally {
    if (created && /^lead_release_test_[0-9a-f]{16}$/.test(schema)) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
