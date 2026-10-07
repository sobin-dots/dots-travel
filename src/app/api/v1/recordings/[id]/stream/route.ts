import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySignedMediaRequest } from '@/lib/media-urls';

export const runtime = 'nodejs';



export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(req.url);
  const expires = Number(url.searchParams.get('expires') || '0');
  const signature = url.searchParams.get('signature') || '';

  // 1. Verify Signed URL if signature is present
  if (signature) {
    const isValid = verifySignedMediaRequest(id, expires, signature);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Forbidden: Playback signature is invalid or expired.' },
        { status: 403 }
      );
    }
  }

  // 2. Fetch Recording Record
  const recording = await db.recording.findUnique({
    where: { id },
  });

  if (!recording || recording.status === 'deleted') {
    return NextResponse.json(
      { error: 'Recording not found or deleted.' },
      { status: 404 }
    );
  }

  if (!recording.recordingUrl || !recording.recordingUrl.startsWith('http')) {
    return NextResponse.json(
      { error: 'Recording audio URL is not yet available from carrier.' },
      { status: 404 }
    );
  }

  // In live mode, stream from remote Plivo URL server-side
  try {
    const remoteRes = await fetch(recording.recordingUrl);
    if (!remoteRes.ok) {
      return NextResponse.json(
        { error: 'Recording audio is currently being processed by carrier. Please retry in a moment.' },
        { status: 503 }
      );
    }

    const contentType = remoteRes.headers.get('content-type') || 'audio/mpeg';
    const body = await remoteRes.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        'content-type': contentType,
        'content-length': body.byteLength.toString(),
        'accept-ranges': 'bytes',
        'cache-control': 'public, max-age=3600',
      },
    });
  } catch (err: any) {
    console.error('Remote media stream proxy error:', err);
    return NextResponse.json({ error: 'Failed to stream media from carrier.' }, { status: 502 });
  }
}
