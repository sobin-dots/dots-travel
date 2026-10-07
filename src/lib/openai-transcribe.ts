/**
 * OpenAI Whisper Speech-to-Text Transcription Service
 * High-accuracy audio transcription supporting multitrack call recordings,
 * automatic language identification, and word/segment timestamping.
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

  const file = new File([audioBuffer as any], filename, {
    type: filename.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg',
  });

  const sendRequest = async (modelName: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', modelName);
    formData.append('response_format', 'verbose_json');
    if (options.language) {
      formData.append('language', options.language);
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
