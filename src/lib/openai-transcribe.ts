/**
 * OpenAI Whisper Speech-to-Text Transcription Service
 * High-accuracy audio transcription supporting multitrack call recordings,
 * automatic language identification, and word/segment timestamping.
 */

import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

export interface OpenAiTranscriptionOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  language?: string; // Optional ISO-639-1 code e.g. "en", "hi", "es"
  prompt?: string;
}

export interface OpenAiTranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
  segments?: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
  }>;
  rawPayload: any;
}

const LANGUAGE_NAME_TO_ISO: Record<string, string> = {
  tamil: 'ta',
  english: 'en',
  hindi: 'hi',
  telugu: 'te',
  kannada: 'kn',
  malayalam: 'ml',
  marathi: 'mr',
  bengali: 'bn',
  gujarati: 'gu',
  punjabi: 'pa',
  urdu: 'ur',
  spanish: 'es',
  french: 'fr',
  german: 'de',
  italian: 'it',
  portuguese: 'pt',
  russian: 'ru',
  chinese: 'zh',
  mandarin: 'zh',
  cantonese: 'yue',
  japanese: 'ja',
  korean: 'ko',
  arabic: 'ar',
  turkish: 'tr',
  vietnamese: 'vi',
  thai: 'th',
  indonesian: 'id',
  dutch: 'nl',
  polish: 'pl',
  swedish: 'sv',
  tagalog: 'tl',
  filipino: 'tl',
};

/**
 * Converts language names (e.g. 'tamil', 'english') or locales (e.g. 'en-US', 'ta-IN')
 * into OpenAI Whisper's strictly required ISO-639-1 two-letter code (e.g. 'ta', 'en').
 */
export function normalizeToIso639_1(input?: string): string | undefined {
  if (!input) return undefined;
  const clean = input.trim().toLowerCase();
  if (!clean) return undefined;

  // Direct lookup for language name
  if (LANGUAGE_NAME_TO_ISO[clean]) {
    return LANGUAGE_NAME_TO_ISO[clean];
  }

  // Handle locale codes like 'en-US', 'ta_IN', 'hi-IN'
  const primary = clean.split(/[-_]/)[0];
  if (LANGUAGE_NAME_TO_ISO[primary]) {
    return LANGUAGE_NAME_TO_ISO[primary];
  }

  // If already a 2-letter ISO code
  if (primary.length === 2) {
    return primary;
  }

  return clean;
}

/**
 * Generates a minimal, valid PCM mono WAV buffer for testing or simulator mode.
 */
export function generateSyntheticWavBuffer(durationSeconds = 2): Buffer {
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
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // 440Hz sine wave tone
  const frequency = 440;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.round(Math.sin(2 * Math.PI * frequency * t) * 16000);
    buffer.writeInt16LE(sample, 44 + i * 2);
  }

  return buffer;
}

/**
 * Preprocesses telephony audio for OpenAI Whisper:
 * 1. Downmixes 8kHz dual-channel (stereo) to 16kHz mono (Whisper's native format).
 * 2. Trims initial dial-tone silence so language detection triggers on actual speech.
 * Falls back safely to the original buffer if ffmpeg is unavailable.
 */
export async function preprocessAudioForWhisper(
  audioBuffer: Buffer,
  filename = 'recording.mp3'
): Promise<{ buffer: Buffer; filename: string }> {
  const tempDir = os.tmpdir();
  const id = crypto.randomUUID();
  const ext = path.extname(filename) || '.mp3';
  const inputPath = path.join(tempDir, `whisper_in_${id}${ext}`);
  const outputPath = path.join(tempDir, `whisper_out_${id}.mp3`);

  try {
    await fs.writeFile(inputPath, audioBuffer);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn('ffmpeg', [
        '-y',
        '-i',
        inputPath,
        '-af',
        'silenceremove=start_periods=1:start_duration=0.5:start_threshold=-35dB',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-b:a',
        '64k',
        outputPath,
      ]);

      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}`));
      });
      proc.on('error', (err) => reject(err));
    });

    const processedBuffer = await fs.readFile(outputPath);
    await Promise.allSettled([fs.unlink(inputPath), fs.unlink(outputPath)]);
    return { buffer: processedBuffer, filename: `clean_${filename}` };
  } catch {
    // If ffmpeg is unavailable or fails, gracefully return original buffer
    await Promise.allSettled([
      fs.unlink(inputPath).catch(() => {}),
      fs.unlink(outputPath).catch(() => {}),
    ]);
    return { buffer: audioBuffer, filename };
  }
}

/**
 * Sends audio buffer to OpenAI Whisper API (v1/audio/transcriptions)
 * Defaults to 'large-v3' model (with automatic fallback to 'whisper-1' if using official OpenAI endpoint)
 */
export async function transcribeAudioWithOpenAi(
  audioBuffer: Buffer | Uint8Array | ArrayBuffer,
  filename = 'recording.mp3',
  options: OpenAiTranscriptionOptions = {}
): Promise<OpenAiTranscriptionResult> {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error(
      'OPENAI_API_KEY is not configured. Please add OPENAI_API_KEY to your environment variables or provide it in the request.'
    );
  }

  const baseUrl = (
    options.baseUrl ||
    process.env.OPENAI_BASE_URL ||
    'https://api.openai.com/v1'
  ).replace(/\/+$/, '');

  const requestedModel =
    options.model || process.env.OPENAI_TRANSCRIPTION_MODEL || 'large-v3';

  // Preprocess audio if Buffer: downmix stereo 8kHz to mono 16kHz and trim initial connection silence
  let bufferToSend: Buffer | Uint8Array | ArrayBuffer = audioBuffer;
  let filenameToSend = filename;
  if (Buffer.isBuffer(audioBuffer)) {
    try {
      const pre = await preprocessAudioForWhisper(audioBuffer, filename);
      bufferToSend = pre.buffer;
      filenameToSend = pre.filename;
    } catch {
      // Graceful fallback to raw buffer
    }
  }

  const file = new File([bufferToSend as any], filenameToSend, {
    type: filenameToSend.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg',
  });

  const sendRequest = async (modelName: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', modelName);
    formData.append('response_format', 'verbose_json');
    formData.append('temperature', '0');
    const isoLang = normalizeToIso639_1(options.language);
    if (isoLang) {
      formData.append('language', isoLang);
    }
    if (options.prompt) {
      formData.append('prompt', options.prompt);
    }

    return fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: formData,
    });
  };

  let response = await sendRequest(requestedModel);

  // If the official OpenAI endpoint rejects 'large-v3' (as OpenAI names its hosted Whisper Large model 'whisper-1')
  if (!response.ok && (requestedModel === 'large-v3' || requestedModel === 'whisper-large-v3')) {
    try {
      const errClone = response.clone();
      const errJson = await errClone.json();
      const msg = (errJson.error?.message || '').toLowerCase();
      if (msg.includes('does not exist') || msg.includes('model')) {
        console.warn(
          `[Transcription] Model '${requestedModel}' not found on ${baseUrl}. Falling back to official hosted Whisper Large alias 'whisper-1'.`
        );
        response = await sendRequest('whisper-1');
      }
    } catch {
      // Continue with original response error
    }
  }

  if (!response.ok) {
    let errorDetail = `OpenAI API returned HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson.error?.message) {
        errorDetail = errJson.error.message;
      }
    } catch {}
    throw new Error(`OpenAI Whisper error: ${errorDetail}`);
  }

  const data = await response.json();
  const text = (data.text || '').trim();

  return {
    text,
    language: data.language,
    duration: data.duration,
    segments: data.segments,
    rawPayload: data,
  };
}
