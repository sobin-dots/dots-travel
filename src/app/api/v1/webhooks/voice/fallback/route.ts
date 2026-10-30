import { NextRequest } from 'next/server';
import { handleAnswer } from '../answer/route';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return handleAnswer(req);
}

export async function POST(req: NextRequest) {
  return handleAnswer(req);
}
