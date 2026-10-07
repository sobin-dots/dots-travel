import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySignedMediaRequest } from '@/lib/media-urls';

export const runtime = 'nodejs';

/**
 * Generates a minimal, valid 1-second 440Hz PCM mono WAV file buffer.
 * Used for offline simulator playback and zero-credential demonstrations.
 */
function generateSyntheticWavBuffer(durationSeconds = 2): Buffer {
  const sampleRate = 8000;
  const numSamples = sampleRate * durationSeconds;
  const byteRate = sampleRate * 2;
  const blockAlign = 2;
  const bitsPerSample = 16;
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(1, 22);  // NumChannels (1 mono)
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Sine wave sample generation
  const frequency = 440; // A4 tone
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * frequency * t) * 16000;
    buffer.writeInt16LE(Math.round(sample), 44 + i * 2);
  }

  return buffer;
}

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

  const mode = process.env.TELEPHONY_MODE || 'simulator';

  // In simulator mode, stream synthetic audio buffer
  if (mode === 'simulator' || !recording.recordingUrl.startsWith('http')) {
    const wav = generateSyntheticWavBuffer(Math.min(recording.durationSeconds || 3, 5));
    return new NextResponse(new Uint8Array(wav), {
      status: 200,
      headers: {
        'content-type': 'audio/wav',
        'content-length': wav.length.toString(),
        'accept-ranges': 'bytes',
        'cache-control': 'public, max-age=3600',
      },
    });
  }

  // In live mode, stream from remote Plivo URL server-side
  try {
    const remoteRes = await fetch(recording.recordingUrl);
    if (!remoteRes.ok) {
      // Fallback to synthetic if remote audio not yet processed
      const wav = generateSyntheticWavBuffer(3);
      return new NextResponse(new Uint8Array(wav), {
        status: 200,
        headers: {
          'content-type': 'audio/wav',
          'content-length': wav.length.toString(),
          'accept-ranges': 'bytes',
        },
      });
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
