/**
 * OpenAI Whisper Speech-to-Text Transcription Service
 * Optimized for Vercel Serverless and Plivo Audio Streams.
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
 * Fetches an audio file from a remote URL (e.g., Plivo Media URL) and converts it to a Buffer.
 */
export async function fetchAudioFromUrl(url: string): Promise<{ buffer: Buffer; filename: string }> {
  console.log(`[Plivo Fetch] Downloading audio from: ${url}`);
  
  const fetchHeaders: Record<string, string> = {
    'User-Agent': 'Pilvo-Downloader/1.0',
    'ngrok-skip-browser-warning': 'true',
  };
  
  let response = await fetch(url, { headers: fetchHeaders });

  // If carrier requires basic auth, retry with Plivo credentials
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
      headers: { ...fetchHeaders, Authorization: `Basic ${basicAuth}` },
    });
  }

  if (!response.ok) {
    throw new Error(`Failed to download audio from Plivo URL: HTTP ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (
    contentType.includes('text/html') ||
    contentType.includes('application/xhtml') ||
    contentType.includes('application/xml')
  ) {
    throw new Error(`Carrier URL returned a document (${contentType}) instead of an audio file. This often happens with ngrok interstitial pages or unauthorized endpoints.`);
  }

  const arrayBuffer = await response.arrayBuffer();
  
  if (arrayBuffer.byteLength < 1000) {
    throw new Error(`Downloaded audio file is suspiciously small (${arrayBuffer.byteLength} bytes). It may be empty or invalid.`);
  }

  const buffer = Buffer.from(arrayBuffer);

  // Extract or infer filename with extension
  const urlPath = new URL(url).pathname;
  let filename = urlPath.split('/').pop() || 'recording.mp3';
  if (!/\.(mp3|wav|m4a|ogg|webm|flac)$/i.test(filename)) {
    filename += '.mp3';
  }

  return { buffer, filename };
}

/**
 * Main transcription routine sending audio payload to OpenAI Whisper.
 */
export async function transcribeAudioWithOpenAi(
  audioBuffer: Buffer | Uint8Array | ArrayBuffer,
  filename = 'recording.mp3',
  options: OpenAiTranscriptionOptions = {}
): Promise<OpenAiTranscriptionResult> {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error('OPENAI_API_KEY is not configured. Please supply a valid OpenAI API key.');
  }

  const baseUrl = (
    options.baseUrl ||
    process.env.OPENAI_BASE_URL ||
    'https://api.openai.com/v1'
  ).replace(/\/+$/, '');

  const requestedModel = options.model || process.env.OPENAI_TRANSCRIPTION_MODEL || 'whisper-1';

  const audioSize =
    audioBuffer instanceof ArrayBuffer
      ? audioBuffer.byteLength
      : audioBuffer.length;

  console.log(
    `[Whisper] Processing ${audioSize} bytes (${filename}) | Model: ${requestedModel} | BaseURL: ${baseUrl}`
  );

  // Construct standard File instance for FormData upload
  const file = new File([audioBuffer as any], filename, {
    type: filename.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg',
  });

  // Prompt guide to drastically boost code-switching & Indian English accuracy
  const defaultPrompt =
    options.prompt ||
    'This conversation is in mixed Tamil and English (Tanglish). Keywords: Dubai, Chennai, Trivandrum, conference, itinerary, flight, 5-star hotel, package, booking, travel.';

  const sendRequest = async (modelName: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', modelName);
    formData.append('response_format', 'verbose_json');
    formData.append('temperature', (options.temperature ?? 0).toString());
    formData.append('prompt', defaultPrompt);

    const isoLang = normalizeToIso639_1(options.language);
    if (isoLang) {
      formData.append('language', isoLang);
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

  // Fallback check if standard endpoint rejects model name variants
  if (!response.ok && (requestedModel === 'large-v3' || requestedModel === 'whisper-large-v3')) {
    try {
      const errClone = response.clone();
      const errJson = await errClone.json();
      const msg = (errJson.error?.message || '').toLowerCase();
      if (msg.includes('does not exist') || msg.includes('model')) {
        console.warn(`[Whisper] Model '${requestedModel}' not found. Falling back to default 'whisper-1'.`);
        response = await sendRequest('whisper-1');
      }
    } catch {
      // Continue with primary response error handling
    }
  }

  if (!response.ok) {
    let errorDetail = `OpenAI API returned HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson.error?.message) {
        errorDetail = errJson.error.message;
      }
    } catch { }
    console.error(`[Whisper Error] ${errorDetail}`);
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

/**
 * Convenience wrapper to fetch and transcribe a audio directly from a URL (e.g., Plivo).
 */
export async function transcribeAudioFromUrl(
  mediaUrl: string,
  options: OpenAiTranscriptionOptions = {}
): Promise<OpenAiTranscriptionResult> {
  const { buffer, filename } = await fetchAudioFromUrl(mediaUrl);
  return transcribeAudioWithOpenAi(buffer, filename, options);
}