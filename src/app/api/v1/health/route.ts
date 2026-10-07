import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'plivo-communications-platform',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
}
