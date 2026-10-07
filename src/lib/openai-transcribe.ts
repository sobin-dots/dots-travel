import OpenAI, { toFile } from 'openai';

/**
 * OpenAI Speech-to-Text Transcription Service
 * Uses official OpenAI SDK with gpt-4o-transcribe & Whisper-1,
 * SSRF URL protection, and file size validation.
 */

export interface OpenAiTranscriptionOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  language?: string; // ISO-639-1 code e.g. "ta", "en"
  prompt?: string;
  temperature?: number;
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

const MAX_AUDIO_BYTES = 24 * 1024 * 1024;

const DEFAULT_ALLOWED_HOSTS = [
  'media.plivo.com',
  'aps1.media.plivo.com',
  's3.amazonaws.com',
  'plivo-recordings.s3.amazonaws.com',
  'plivo-transcriptions-production.s3.amazonaws.com',
];

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
 * Normalizes language inputs to ISO-639-1 standard codes.
 */
export function normalizeToIso639_1(input?: string): string | undefined {
  if (!input) return undefined;
  const clean = input.trim().toLowerCase();
  if (!clean) return undefined;

  if (LANGUAGE_NAME_TO_ISO[clean]) return LANGUAGE_NAME_TO_ISO[clean];

  const primary = clean.split(/[-_]/)[0];
  if (LANGUAGE_NAME_TO_ISO[primary]) return LANGUAGE_NAME_TO_ISO[primary];
  if (primary.length === 2) return primary;

  return clean;
}

/**
 * Transcribes a remote audio recording URL using OpenAI's transcription service.
 * Includes SSRF URL host validation, max byte checks, and gpt-4o-transcribe processing.
 */
export async function transcribeRecording(
  recordingUrl: string,
  options: OpenAiTranscriptionOptions = {}
): Promise<string> {
  const url = new URL(recordingUrl);

  const userAllowedHosts = (process.env.RECORDING_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  const allowedHosts = new Set([...DEFAULT_ALLOWED_HOSTS, ...userAllowedHosts]);

  const isAllowedHost =
    allowedHosts.has(url.hostname.toLowerCase()) ||
    url.hostname.toLowerCase().endsWith('.media.plivo.com') ||
    url.hostname.toLowerCase().endsWith('.plivo.com');

  // Prevent arbitrary server-side URL fetching (SSRF protection).
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !isAllowedHost
  ) {
    throw new Error('Untrusted recording URL');
  }

  const fetchHeaders: Record<string, string> = {
    'User-Agent': 'Pilvo-Downloader/1.0',
    'ngrok-skip-browser-warning': 'true',
  };

  let response = await fetch(url, {
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(60_000),
    headers: fetchHeaders,
  });

  // If carrier bucket requires Basic Auth, retry with Plivo credentials
  if (
    !response.ok &&
    (response.status === 401 || response.status === 403) &&
    process.env.PLIVO_AUTH_ID &&
    process.env.PLIVO_AUTH_TOKEN
  ) {
    const basicAuth = Buffer.from(
      `${process.env.PLIVO_AUTH_ID}:${process.env.PLIVO_AUTH_TOKEN}`
    ).toString('base64');
    response = await fetch(url, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(60_000),
      headers: { ...fetchHeaders, Authorization: `Basic ${basicAuth}` },
    });
  }

  if (!response.ok) {
    throw new Error(`Recording download failed: ${response.status}`);
  }

  const declaredSize = Number(response.headers.get('content-length') ?? 0);
  if (declaredSize > MAX_AUDIO_BYTES) {
    throw new Error('Recording needs compression or chunking');
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  if (audioBuffer.length > MAX_AUDIO_BYTES) {
    throw new Error('Recording needs compression or chunking');
  }

  const file = await toFile(audioBuffer, 'recording.mp3', {
    type: 'audio/mpeg',
  });

  const openai = new OpenAI({
    apiKey: options.apiKey || process.env.OPENAI_API_KEY,
    baseURL: options.baseUrl || process.env.OPENAI_BASE_URL,
  });

  const model =
    options.model ||
    process.env.OPENAI_TRANSCRIPTION_MODEL ||
    'gpt-4o-transcribe';

  const params: any = {
    file,
    model,
  };

  const isoLang = normalizeToIso639_1(options.language);
  if (isoLang) {
    params.language = isoLang;
  }
  if (options.prompt) {
    params.prompt = options.prompt;
  }

  try {
    const result = await openai.audio.transcriptions.create(params);
    return result.text;
  } catch (err: any) {
    // If gpt-4o-transcribe is not supported on a specific API key tier, fallback to whisper-1
    if (model !== 'whisper-1' && err.message?.toLowerCase().includes('model')) {
      console.warn(`[OpenAI Transcribe] Model '${model}' failed. Retrying with 'whisper-1' fallback.`);
      const fallbackResult = await openai.audio.transcriptions.create({
        ...params,
        model: 'whisper-1',
      });
      return fallbackResult.text;
    }
    throw err;
  }
}

/**
 * Convenience wrapper returning structured result with text & raw payload.
 */
export async function transcribeAudioFromUrl(
  mediaUrl: string,
  options: OpenAiTranscriptionOptions = {}
): Promise<OpenAiTranscriptionResult> {
  const text = await transcribeRecording(mediaUrl, options);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return {
    text,
    rawPayload: {
      text,
      model: options.model || process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-transcribe',
      wordCount,
    },
  };
}

/**
 * Transcribes raw in-memory audio buffers (WAV / MP3) using the official OpenAI SDK.
 */
export async function transcribeAudioWithOpenAi(
  audioBuffer: Buffer | Uint8Array | ArrayBuffer,
  filename = 'recording.mp3',
  options: OpenAiTranscriptionOptions = {}
): Promise<OpenAiTranscriptionResult> {
  const buf = Buffer.isBuffer(audioBuffer) ? audioBuffer : Buffer.from(audioBuffer as any);
  if (buf.length > MAX_AUDIO_BYTES) {
    throw new Error('Recording needs compression or chunking');
  }

  const file = await toFile(buf, filename, {
    type: filename.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg',
  });

  const openai = new OpenAI({
    apiKey: options.apiKey || process.env.OPENAI_API_KEY,
    baseURL: options.baseUrl || process.env.OPENAI_BASE_URL,
  });

  const model =
    options.model ||
    process.env.OPENAI_TRANSCRIPTION_MODEL ||
    'gpt-4o-transcribe';

  const params: any = {
    file,
    model,
  };

  const isoLang = normalizeToIso639_1(options.language);
  if (isoLang) {
    params.language = isoLang;
  }
  if (options.prompt) {
    params.prompt = options.prompt;
  }

  let text = '';
  try {
    const result = await openai.audio.transcriptions.create(params);
    text = result.text;
  } catch (err: any) {
    if (model !== 'whisper-1' && err.message?.toLowerCase().includes('model')) {
      console.warn(`[OpenAI Transcribe] Model '${model}' failed. Retrying with 'whisper-1' fallback.`);
      const fallback = await openai.audio.transcriptions.create({
        ...params,
        model: 'whisper-1',
      });
      text = fallback.text;
    } else {
      throw err;
    }
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return {
    text: text.trim(),
    rawPayload: { text, model, wordCount },
  };
}