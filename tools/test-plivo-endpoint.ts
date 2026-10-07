import 'dotenv/config';
import * as plivo from 'plivo';

async function main() {
  const client = new (plivo as any).Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);
  try {
    const apps = await client.applications.list();
    console.log('Apps:', apps);
    const appId = apps[0]?.appId;

    const res = await client.endpoints.create('threedotsagent01', 'SecureP@ss2026!P1ivo', 'ThreeDotsAgent01', appId);
    console.log('Created endpoint:', res);
  } catch (err: any) {
    console.error('Create error:', err.message || err);
  }
}

main().catch(console.error).finally(() => process.exit(0));
