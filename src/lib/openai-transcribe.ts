/**
 * OpenAI Whisper Speech-to-Text Transcription Service
 * High-accuracy audio transcription supporting multitrack call recordings,
 * automatic language identification, and word/segment timestamping.
 *
 * Designed to run on Vercel serverless (no ffmpeg dependency).
 */

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
 * Sends audio buffer to OpenAI Whisper API (v1/audio/transcriptions)
 * Defaults to 'whisper-1' model (the official OpenAI hosted Whisper Large V3).
 *
 * Anti-hallucination measures:
 * - temperature=0 for greedy deterministic decoding
 * - ISO-639-1 language normalization
 * - Model auto-fallback from 'large-v3' to 'whisper-1'
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
    options.model || process.env.OPENAI_TRANSCRIPTION_MODEL || 'whisper-1';

  // Determine audio size for logging
  const audioSize =
    audioBuffer instanceof ArrayBuffer
      ? audioBuffer.byteLength
      : audioBuffer.length;

  console.log(
    `[Whisper] Preparing ${audioSize} bytes as '${filename}', model=${requestedModel}, lang=${options.language || 'auto'}, baseUrl=${baseUrl}`
  );

  const file = new File([audioBuffer as any], filename, {
    type: filename.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg',
  });

  const sendRequest = async (modelName: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', modelName);
    formData.append('response_format', 'verbose_json');
    // temperature=0: greedy decoding prevents hallucination loops (e.g. repetitive Tamil text on silence/noise)
    formData.append('temperature', '0');

    const isoLang = normalizeToIso639_1(options.language);
    if (isoLang) {
      formData.append('language', isoLang);
      console.log(`[Whisper] Language locked to ISO-639-1: '${isoLang}' (from '${options.language}')`);
    } else {
      console.log(`[Whisper] Language: auto-detect (no language constraint)`);
    }

    if (options.prompt) {
      formData.append('prompt', options.prompt);
    }

    console.log(`[Whisper] Sending request to ${baseUrl}/audio/transcriptions with model=${modelName}`);

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
          `[Whisper] Model '${requestedModel}' not found on ${baseUrl}. Falling back to 'whisper-1'.`
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
    console.error(`[Whisper] API error: ${errorDetail}`);
    throw new Error(`OpenAI Whisper error: ${errorDetail}`);
  }

  const data = await response.json();
  const text = (data.text || '').trim();

  console.log(
    `[Whisper] Success: detected_lang=${data.language}, duration=${data.duration}s, text_length=${text.length}, segments=${data.segments?.length || 0}`
  );

  return {
    text,
    language: data.language,
    duration: data.duration,
    segments: data.segments,
    rawPayload: data,
  };
}
