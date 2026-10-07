import { WaveFile } from 'wavefile';

export interface WavConversionOptions {
  sampleRate?: number; // target sample rate, defaults to 16000
  channels?: number;   // target channels, defaults to 1 (mono)
}

/**
 * Converts Plivo 8kHz µ-law (G.711u) audio chunks to a standard 16kHz 16-bit PCM WAV buffer.
 * Whisper performs best with 16kHz mono audio.
 */
export function convertMulawChunksToWav(
  chunks: (Buffer | string)[],
  options: WavConversionOptions = {}
): Buffer {
  if (!chunks || chunks.length === 0) {
    return Buffer.alloc(0);
  }

  const buffers: Buffer[] = chunks.map((chunk) =>
    typeof chunk === 'string' ? Buffer.from(chunk, 'base64') : chunk
  );

  const combinedMulaw = Buffer.concat(buffers);
  if (combinedMulaw.length === 0) {
    return Buffer.alloc(0);
  }

  const targetRate = options.sampleRate || 16000;

  const wav = new WaveFile();
  // 1 channel, 8000 Hz, 8-bit mu-law ('8m')
  wav.fromScratch(1, 8000, '8m', combinedMulaw);
  // Decode µ-law to 16-bit linear PCM
  wav.fromMuLaw();
  // Resample to target rate (16kHz for Whisper)
  if (targetRate !== 8000) {
    wav.toSampleRate(targetRate);
  }

  return Buffer.from(wav.toBuffer());
}

/**
 * Returns the estimated duration in seconds for 8kHz 8-bit mono µ-law audio.
 * At 8kHz mono 8-bit, 1 second = 8,000 bytes.
 */
export function estimateMulawDurationSeconds(bytesLength: number): number {
  return Math.round((bytesLength / 8000) * 10) / 10;
}
