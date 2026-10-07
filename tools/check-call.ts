import 'dotenv/config';
import { db } from '../src/lib/db';

async function main() {
  const ev = await db.webhookEvent.findFirst({
    where: { rawBody: { contains: '8694673e-e5a3-4b0a-aa24-c47f8eb61408' } },
  });
  console.log('Webhook event:');
  console.log(ev?.rawBody);
}
main().catch(console.error);
