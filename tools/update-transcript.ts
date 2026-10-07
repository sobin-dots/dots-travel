import 'dotenv/config';
import { db } from '../src/lib/db';

async function main() {
  await db.recording.updateMany({
    where: { callId: '795966cc-61dc-408e-94a0-fec372661638' },
    data: { durationSeconds: 47 }
  });
  console.log('Recording duration set to 47');
}
main().catch(console.error);
