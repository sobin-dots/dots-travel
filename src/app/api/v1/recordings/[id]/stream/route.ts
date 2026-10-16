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
    const totalSize = body.byteLength;
    const rangeHeader = req.headers.get('range');

    if (rangeHeader && rangeHeader.startsWith('bytes=')) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (!isNaN(start) && start < totalSize) {
        const chunk = body.slice(start, Math.min(end + 1, totalSize));
        return new NextResponse(chunk, {
          status: 206,
          headers: {
            'content-type': contentType,
            'content-length': chunk.byteLength.toString(),
            'content-range': `bytes ${start}-${Math.min(end, totalSize - 1)}/${totalSize}`,
            'accept-ranges': 'bytes',
            'cache-control': 'public, max-age=3600',
          },
        });
      }
    }

    return new NextResponse(body, {
      status: 200,
      headers: {
        'content-type': contentType,
        'content-length': totalSize.toString(),
        'accept-ranges': 'bytes',
        'cache-control': 'public, max-age=3600',
      },
    });
  } catch (err: any) {
    console.error('Remote media stream proxy error:', err);
    return NextResponse.json({ error: 'Failed to stream media from carrier.' }, { status: 502 });
  }
}
