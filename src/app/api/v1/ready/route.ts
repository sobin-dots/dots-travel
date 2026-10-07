import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTelephonyProvider } from '@/lib/telephony';

export const runtime = 'nodejs';

export async function GET() {
  let dbStatus = 'disconnected';
  try {
    await db.$queryRaw`SELECT 1`;
    dbStatus = 'connected';
  } catch (err: any) {
    return NextResponse.json(
      {
        ready: false,
        db: 'failed',
        error: err.message,
      },
      { status: 503 }
    );
  }

  const mode = process.env.TELEPHONY_MODE || 'simulator';

  return NextResponse.json({
    ready: true,
    db: dbStatus,
    telephonyMode: mode,
    timestamp: new Date().toISOString(),
  });
}
