import { getTenantIntegration } from './integrations/credentials-manager';
import { db } from './db';

export interface ItineraryResult {
  title: string;
  destination: string;
  itinerary: string;
  durationDays?: number;
  departureDate?: string;
  headcountAdults?: number;
  headcountChildren?: number;
  headcountInfants?: number;
  hotelTier?: string;
  specialRequests?: string;
  customerName?: string;
  customerEmail?: string;
}

interface LlmCallOptions {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  timeoutMs?: number;
  organizationId?: string;
}

interface ResolvedAiConfig {
  deepseekKey?: string;
  deepseekBaseUrl: string;
  deepseekModel: string;
  openaiKey?: string;
  openaiModel: string;
}

function normalizeDeepSeekChatModel(model?: string): string {
  if (!model || !model.trim()) return 'deepseek-chat';
  const m = model.trim().toLowerCase();
  if (m === 'deepseek-chat' || m === 'deepseek-reasoner') return m;
  return 'deepseek-chat';
}

function normalizeOpenAiChatModel(model?: string): string {
  if (!model || !model.trim()) return 'gpt-4o-mini';
  const m = model.trim().toLowerCase();
  // Audio transcription / TTS models cannot be used on /v1/chat/completions
  if (
    m.includes('transcribe') ||
    m.includes('whisper') ||
    m.includes('tts') ||
    m.includes('audio') ||
    m.includes('realtime')
  ) {
    return 'gpt-4o-mini';
  }
  return model.trim();
}

async function resolveTenantAiConfig(organizationId?: string): Promise<ResolvedAiConfig> {
  let deepseekKey = process.env.DEEPSEEK_API_KEY;
  let deepseekBaseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  let deepseekModel = normalizeDeepSeekChatModel(process.env.DEEPSEEK_MODEL || 'deepseek-chat');

  let openaiKey = process.env.OPENAI_API_KEY;
  let openaiModel = normalizeOpenAiChatModel(process.env.OPENAI_MODEL || 'gpt-4o-mini');

  if (organizationId) {
    // 1. Fetch tenant's DeepSeek BYOK integration
    const deepseekInteg = await getTenantIntegration(organizationId, 'deepseek');
    if (deepseekInteg?.credentials?.apiKey) {
      deepseekKey = deepseekInteg.credentials.apiKey;
      if (deepseekInteg.metadata?.baseUrl) {
        deepseekBaseUrl = deepseekInteg.metadata.baseUrl.replace(/\/+$/, '');
      }
      if (deepseekInteg.metadata?.model) {
        deepseekModel = normalizeDeepSeekChatModel(deepseekInteg.metadata.model);
      }
    } else {
      // If tenant hasn't configured DeepSeek, don't silently use platform key in production
      if (process.env.NODE_ENV === 'production') {
        deepseekKey = undefined;
      }
    }

    // 2. Fetch tenant's OpenAI BYOK integration
    const openaiInteg = await getTenantIntegration(organizationId, 'openai');
    if (openaiInteg?.credentials?.apiKey) {
      openaiKey = openaiInteg.credentials.apiKey;
      const candidateModel = openaiInteg.metadata?.chatModel || openaiInteg.metadata?.model;
      if (candidateModel) {
        openaiModel = normalizeOpenAiChatModel(candidateModel);
      }
    } else {
      if (process.env.NODE_ENV === 'production') {
        openaiKey = undefined;
      }
    }
  }

  return {
    deepseekKey,
    deepseekBaseUrl,
    deepseekModel,
    openaiKey,
    openaiModel,
  };
}

/**
 * Common LLM completion invoker returning parsed JSON.
 * Primary: DeepSeek AI (or OpenAI if configured).
 */
async function callLlmJson<T>({
  messages,
  temperature = 0.7,
  timeoutMs = 35000,
  organizationId,
}: LlmCallOptions): Promise<T | null> {
  const config = await resolveTenantAiConfig(organizationId);

  const effectiveTimeout = process.env.NODE_ENV === 'test' ? Math.min(timeoutMs, 4000) : timeoutMs;

  // 1. Primary for itinerary intelligence: DeepSeek API
  if (config.deepseekKey) {
    try {
      console.log(`[AI Itinerary] Calling DeepSeek (${config.deepseekModel}) for org: ${organizationId || 'default'}...`);
      const response = await fetch(`${config.deepseekBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.deepseekKey}`,
        },
        signal: AbortSignal.timeout(effectiveTimeout),
        body: JSON.stringify({
          model: config.deepseekModel,
          response_format: { type: 'json_object' },
          messages,
          temperature,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          try {
            return JSON.parse(content) as T;
          } catch (parseErr) {
            console.warn('Failed to parse DeepSeek JSON output:', parseErr);
          }
        }
      } else {
        console.warn(`DeepSeek (${config.deepseekModel}) returned HTTP status`, response.status, await response.text());
      }
    } catch (err: any) {
      console.warn('DeepSeek error or timeout:', err?.message || err);
    }
  }

  // 2. Fallback: OpenAI API (if configured by tenant)
  if (config.openaiKey) {
    try {
      console.log(`[AI Itinerary] Calling OpenAI (${config.openaiModel}) for org: ${organizationId || 'default'}...`);
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.openaiKey}`,
        },
        signal: AbortSignal.timeout(effectiveTimeout),
        body: JSON.stringify({
          model: config.openaiModel,
          response_format: { type: 'json_object' },
          messages,
          temperature,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          try {
            return JSON.parse(content) as T;
          } catch (parseErr) {
            console.warn('Failed to parse OpenAI JSON output:', parseErr);
          }
        }
      } else {
        console.warn(`OpenAI (${config.openaiModel}) returned status`, response.status, await response.text());
      }
    } catch (err: any) {
      console.warn('OpenAI error or timeout:', err?.message || err);
    }
  }

  return null;
}

/**
 * Common LLM completion invoker returning plain text / markdown.
 */
async function callLlmText({
  messages,
  temperature = 0.5,
  timeoutMs = 35000,
  organizationId,
}: LlmCallOptions): Promise<string | null> {
  const config = await resolveTenantAiConfig(organizationId);
  const effectiveTimeout = process.env.NODE_ENV === 'test' ? Math.min(timeoutMs, 4000) : timeoutMs;

  // 1. Primary: DeepSeek API
  if (config.deepseekKey) {
    try {
      const response = await fetch(`${config.deepseekBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.deepseekKey}`,
        },
        signal: AbortSignal.timeout(effectiveTimeout),
        body: JSON.stringify({
          model: config.deepseekModel,
          messages,
          temperature,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.choices?.[0]?.message?.content || null;
      }
    } catch (err: any) {
      console.warn('DeepSeek text completion error:', err?.message || err);
    }
  }

  // 2. Secondary: OpenAI API
  if (config.openaiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.openaiKey}`,
        },
        signal: AbortSignal.timeout(effectiveTimeout),
        body: JSON.stringify({
          model: config.openaiModel,
          messages,
          temperature,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.choices?.[0]?.message?.content || null;
      }
    } catch (err: any) {
      console.warn('OpenAI text completion error:', err?.message || err);
    }
  }

  return null;
}

export interface TripParameters {
  destination?: string;
  departureDate?: string;
  returnDate?: string;
  durationDays?: number;
  headcountAdults?: number;
  headcountChildren?: number;
  headcountInfants?: number;
  targetBudget?: number;
  hotelTier?: string; // luxury_5star | boutique_4star | chalet_villa | standard_3star
  specialRequests?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
}

function computeReturnDateIso(departureDate?: string, durationDays?: number): string {
  if (!departureDate || !durationDays || durationDays < 1) return '';
  const d = new Date(departureDate);
  if (isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + Math.max(0, Math.round(durationDays) - 1));
  return d.toISOString().split('T')[0];
}

function normalizeHotelTierCode(raw?: string | null): string {
  if (!raw) return '';
  const s = String(raw).trim().toLowerCase();
  if (s === 'luxury_5star' || s === 'boutique_4star' || s === 'chalet_villa' || s === 'standard_3star') {
    return s;
  }
  if (s.includes('villa') || s.includes('chalet') || s.includes('வில்லா')) return 'chalet_villa';
  if (
    s.includes('5') ||
    s.includes('five') ||
    s.includes('luxury') ||
    s.includes('பைசா') ||
    s.includes('லக்ஸரி')
  ) {
    return 'luxury_5star';
  }
  if (s.includes('4') || s.includes('four') || s.includes('boutique') || s.includes('ஃபோர்')) {
    return 'boutique_4star';
  }
  if (s.includes('3') || s.includes('three') || s.includes('standard') || s.includes('த்ரீ')) {
    return 'standard_3star';
  }
  return '';
}

const MONTH_ALIASES: Array<{ month: number; patterns: string[] }> = [
  { month: 1, patterns: ['january', 'jan', 'ஜனவரி'] },
  { month: 2, patterns: ['february', 'feb', 'பிப்ரவரி', 'பெப்ரவரி'] },
  { month: 3, patterns: ['march', 'mar', 'மார்ச்'] },
  { month: 4, patterns: ['april', 'apr', 'ஏப்ரல்'] },
  { month: 5, patterns: ['may', 'மே'] },
  { month: 6, patterns: ['june', 'jun', 'ஜூன்'] },
  { month: 7, patterns: ['july', 'jul', 'ஜூலை'] },
  { month: 8, patterns: ['august', 'aug', 'ஆகஸ்ட்'] },
  { month: 9, patterns: ['september', 'sept', 'sep', 'செப்டம்பர்'] },
  { month: 10, patterns: ['october', 'oct', 'அக்டோபர்'] },
  { month: 11, patterns: ['november', 'nov', 'நவம்பர்'] },
  { month: 12, patterns: ['december', 'dec', 'டிசம்பர்'] },
];

function resolveSpokenDateFromTranscript(transcript: string, referenceDate?: Date | string): string {
  const ref = referenceDate ? new Date(referenceDate) : new Date();
  const baseDate = isNaN(ref.getTime()) ? new Date() : ref;

  // 1. Explicit YYYY-MM-DD
  const isoMatch = transcript.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];

  // 2. Spoken Month + Day (+ optional Year) or Day + Month (+ optional Year) in English or Tamil
  for (const { month, patterns } of MONTH_ALIASES) {
    for (const pat of patterns) {
      // e.g. "டிசம்பர் 20", "December 20, 2026", "டிசம்பர் 20ஆம் தேதி"
      const monthFirstRegex = new RegExp(
        `${pat}\\s*(\\d{1,2})(?:st|nd|rd|th|ஆம்)?(?:[\\s,]+(20\\d{2}))?`,
        'i'
      );
      const m1 = transcript.match(monthFirstRegex);
      if (m1) {
        const day = parseInt(m1[1], 10);
        if (day >= 1 && day <= 31) {
          let year = m1[2] ? parseInt(m1[2], 10) : baseDate.getUTCFullYear();
          const candidate = new Date(Date.UTC(year, month - 1, day));
          if (!m1[2] && candidate.getTime() + 86400000 < baseDate.getTime()) {
            year += 1;
          }
          return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }

      // e.g. "28 டிசம்பர் 2026", "20th December"
      const dayFirstRegex = new RegExp(
        `(\\d{1,2})(?:st|nd|rd|th)?\\s+${pat}(?:[\\s,]+(20\\d{2}))?`,
        'i'
      );
      const m2 = transcript.match(dayFirstRegex);
      if (m2) {
        const day = parseInt(m2[1], 10);
        if (day >= 1 && day <= 31) {
          let year = m2[2] ? parseInt(m2[2], 10) : baseDate.getUTCFullYear();
          const candidate = new Date(Date.UTC(year, month - 1, day));
          if (!m2[2] && candidate.getTime() + 86400000 < baseDate.getTime()) {
            year += 1;
          }
          return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }
    }
  }

  // 3. Relative weekday (e.g. "coming Sunday", "next Sunday", "சண்டே", "ஞாயிற்றுக்கிழமை")
  const weekdayMap: Array<{ dayOfWeek: number; tokens: string[] }> = [
    { dayOfWeek: 0, tokens: ['sunday', 'சண்டே', 'ஞாயிறு', 'ஞாயிற்றுக்கிழமை'] },
    { dayOfWeek: 1, tokens: ['monday', 'மண்டே', 'திங்கள்', 'திங்கட்கிழமை'] },
    { dayOfWeek: 2, tokens: ['tuesday', 'டியூஸ்டே', 'செவ்வாய்'] },
    { dayOfWeek: 3, tokens: ['wednesday', 'வெட்னஸ்டே', 'புதன்'] },
    { dayOfWeek: 4, tokens: ['thursday', 'தர்ஸ்டே', 'வியாழன்'] },
    { dayOfWeek: 5, tokens: ['friday', 'ஃபிரைடே', 'வெள்ளி'] },
    { dayOfWeek: 6, tokens: ['saturday', 'சாட்டர்டே', 'சனி', 'சனிக்கிழமை'] },
  ];
  const lower = transcript.toLowerCase();
  for (const { dayOfWeek, tokens } of weekdayMap) {
    if (tokens.some((tok) => lower.includes(tok))) {
      const currentDow = baseDate.getUTCDay();
      let daysAhead = (dayOfWeek - currentDow + 7) % 7;
      if (daysAhead === 0) daysAhead = 7;
      const target = new Date(baseDate.getTime());
      target.setUTCDate(target.getUTCDate() + daysAhead);
      return target.toISOString().split('T')[0];
    }
  }

  return '';
}

function parseTamilOrEnglishNumber(wordOrDigits?: string): number | undefined {
  if (!wordOrDigits) return undefined;
  const trimmed = wordOrDigits.trim().toLowerCase();
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  const wordMap: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    ஒரு: 1,
    ஒன்னு: 1,
    ஒன்று: 1,
    இரண்டு: 2,
    ரெண்டு: 2,
    மூன்று: 3,
    மூணு: 3,
    நான்கு: 4,
    நாலு: 4,
    ஐந்து: 5,
    அஞ்சு: 5,
    ஆறு: 6,
    ஏழு: 7,
    எட்டு: 8,
    ஒன்பது: 9,
    பத்து: 10,
  };
  return wordMap[trimmed];
}

export async function extractTripParametersFromTranscript(
  transcriptText: string,
  contactInfo?: {
    name?: string;
    phone?: string;
    email?: string;
    company?: string;
    referenceDate?: Date | string;
  },
  organizationId?: string
): Promise<TripParameters> {
  const cleanContactName =
    contactInfo?.name &&
    contactInfo.name.toLowerCase() !== 'valued client' &&
    contactInfo.name.toLowerCase() !== 'customer' &&
    contactInfo.name.toLowerCase() !== 'guest'
      ? contactInfo.name
      : '';

  if (!transcriptText || !transcriptText.trim()) {
    return {
      destination: '',
      departureDate: '',
      returnDate: '',
      durationDays: undefined,
      headcountAdults: undefined,
      headcountChildren: undefined,
      headcountInfants: undefined,
      targetBudget: undefined,
      hotelTier: '',
      specialRequests: '',
      customerName: cleanContactName,
      customerEmail: contactInfo?.email || '',
      customerPhone: contactInfo?.phone || '',
    };
  }

  const refDateObj = contactInfo?.referenceDate ? new Date(contactInfo.referenceDate) : new Date();
  const referenceDateIso = (isNaN(refDateObj.getTime()) ? new Date() : refDateObj).toISOString().split('T')[0];

  // Strict transcript-only extractor supporting both English and Tamil/phonetic transcripts
  const extractStrictlyFromTranscript = (): TripParameters => {
    const text = transcriptText.toLowerCase();

    // 1. Destination (clean English)
    let destination = '';
    if (text.includes('singapore') || text.includes('sentosa') || text.includes('சிங்கப்பூர்') || text.includes('சென்டோசா')) {
      destination = 'Singapore';
    } else if (text.includes('maldives') || text.includes('மால்தீவ்ஸ்') || text.includes('மாலத்தீவு')) {
      destination = 'Maldives';
    } else if (
      text.includes('dubai') ||
      text.includes('uae') ||
      text.includes('united arab emirates') ||
      text.includes('துபை') ||
      text.includes('துபாய்') ||
      text.includes('அபுதாபி')
    ) {
      destination = 'Dubai, United Arab Emirates';
    } else if (
      text.includes('rome') ||
      text.includes('italy') ||
      text.includes('amalfi') ||
      text.includes('florence') ||
      text.includes('venice') ||
      text.includes('ரோம்') ||
      text.includes('இத்தாலி')
    ) {
      destination = text.includes('யூரோப்') || text.includes('europe') ? 'Rome, Europe' : 'Rome & Amalfi Coast, Italy';
    } else if (text.includes('europe') || text.includes('யூரோப்') || text.includes('ஐரோப்பா')) {
      destination = 'Europe';
    } else if (text.includes('paris') || text.includes('france') || text.includes('பாரிஸ்') || text.includes('பிரான்ஸ்')) {
      destination = 'Paris, France';
    } else if (
      text.includes('swiss') ||
      text.includes('alps') ||
      text.includes('switzerland') ||
      text.includes('zurich') ||
      text.includes('zermatt') ||
      text.includes('சுவிட்சர்லாந்து') ||
      text.includes('சுவிஸ்')
    ) {
      destination = 'Swiss Alps, Switzerland';
    } else if (text.includes('bali') || text.includes('indonesia') || text.includes('ubud') || text.includes('பாலி')) {
      destination = 'Bali, Indonesia';
    } else if (
      text.includes('thailand') ||
      text.includes('phuket') ||
      text.includes('bangkok') ||
      text.includes('krabi') ||
      text.includes('தாய்லாந்து') ||
      text.includes('பூகெட்') ||
      text.includes('பாங்காக்') ||
      text.includes('பட்டாயா')
    ) {
      destination = 'Phuket & Krabi, Thailand';
    } else if (
      text.includes('malaysia') ||
      text.includes('kuala lumpur') ||
      text.includes('langkawi') ||
      text.includes('மலேசியா') ||
      text.includes('லங்காவி')
    ) {
      destination = 'Kuala Lumpur & Langkawi, Malaysia';
    } else if (
      text.includes('sri lanka') ||
      text.includes('colombo') ||
      text.includes('இலங்கை') ||
      text.includes('ஸ்ரீலங்கா')
    ) {
      destination = 'Sri Lanka';
    } else if (
      text.includes('vietnam') ||
      text.includes('hanoi') ||
      text.includes('da nang') ||
      text.includes('halong') ||
      text.includes('வியட்நாம்')
    ) {
      destination = 'Vietnam';
    } else if (
      text.includes('tokyo') ||
      text.includes('kyoto') ||
      text.includes('japan') ||
      text.includes('டோக்கியோ') ||
      text.includes('ஜப்பான்')
    ) {
      destination = 'Tokyo & Kyoto, Japan';
    } else if (
      text.includes('london') ||
      text.includes('uk') ||
      text.includes('england') ||
      text.includes('லண்டன்') ||
      text.includes('இங்கிலாந்து')
    ) {
      destination = 'London, United Kingdom';
    } else if (
      text.includes('kerala') ||
      text.includes('munnar') ||
      text.includes('alleppey') ||
      text.includes('கேரளா') ||
      text.includes('மூணாறு')
    ) {
      destination = 'Kerala, India';
    } else if (text.includes('kashmir') || text.includes('srinagar') || text.includes('gulmarg') || text.includes('காஷ்மீர்')) {
      destination = 'Kashmir, India';
    } else if (text.includes('goa') || text.includes('கோவா')) {
      destination = 'Goa, India';
    } else if (text.includes('andaman') || text.includes('அந்தமான்')) {
      destination = 'Andaman Islands, India';
    } else if (text.includes('manali') || text.includes('shimla') || text.includes('மனாலி') || text.includes('சிம்லா')) {
      destination = 'Shimla & Manali, India';
    } else if (text.includes('ooty') || text.includes('kodaikanal') || text.includes('ஊட்டி') || text.includes('கொடைக்கானல்')) {
      destination = 'Ooty & Kodaikanal, India';
    } else if (
      text.includes('greece') ||
      text.includes('santorini') ||
      text.includes('athens') ||
      text.includes('mykonos') ||
      text.includes('கிரீஸ்')
    ) {
      destination = 'Athens & Santorini, Greece';
    } else if (text.includes('new york') || text.includes('nyc') || text.includes('நியூயார்க்')) {
      destination = 'New York City, USA';
    }

    // 2. Duration (Days)
    let durationDays: number | undefined = undefined;
    // Check "<X> nights <Y> days" / "<X> நைட்ஸ் <Y> டேஸ்" first so we pick the days count
    const nightsDaysMatch = transcriptText.match(
      /(\d+|ஒரு|இரண்டு|ரெண்டு|மூன்று|மூணு|நான்கு|நாலு|ஐந்து|அஞ்சு|ஆறு|ஏழு|எட்டு|ஒன்பது|பத்து)\s*(?:நைட்ஸ்|nights?|இரவு)\s*(?:,|\s)*(\d+|ஒரு|இரண்டு|ரெண்டு|மூன்று|மூணு|நான்கு|நாலு|ஐந்து|அஞ்சு|ஆறு|ஏழு|எட்டு|ஒன்பது|பத்து)\s*(?:டேஸ்|days?|நாட்கள்|நாள்)/i
    );
    if (nightsDaysMatch) {
      const parsedDays = parseTamilOrEnglishNumber(nightsDaysMatch[2]);
      if (parsedDays) durationDays = Math.max(1, Math.min(60, parsedDays));
    }
    if (!durationDays) {
      const daysMatch = transcriptText.match(
        /(\d+|ஒரு|இரண்டு|ரெண்டு|மூன்று|மூணு|நான்கு|நாலு|ஐந்து|அஞ்சு|ஆறு|ஏழு|எட்டு|ஒன்பது|பத்து)\s*(?:டேஸ்|days?|நாட்கள்|நாள்)/i
      );
      if (daysMatch) {
        const parsedDays = parseTamilOrEnglishNumber(daysMatch[1]);
        if (parsedDays) durationDays = Math.max(1, Math.min(60, parsedDays));
      }
    }
    if (!durationDays) {
      const nightsOnlyMatch = transcriptText.match(
        /(\d+|ஒரு|இரண்டு|ரெண்டு|மூன்று|மூணு|நான்கு|நாலு|ஐந்து|அஞ்சு|ஆறு|ஏழு|எட்டு|ஒன்பது|பத்து)\s*(?:நைட்ஸ்|nights?|இரவு)/i
      );
      if (nightsOnlyMatch) {
        const parsedNights = parseTamilOrEnglishNumber(nightsOnlyMatch[1]);
        if (parsedNights) durationDays = Math.max(1, Math.min(60, parsedNights + 1));
      } else if (text.includes('a week') || text.includes('one week') || text.includes('ஒரு வாரம்')) {
        durationDays = 7;
      } else if (text.includes('weekend')) {
        durationDays = 3;
      }
    }

    // 3. Departure Date & Return Date
    const departureDate = resolveSpokenDateFromTranscript(transcriptText, contactInfo?.referenceDate);
    const returnDate = computeReturnDateIso(departureDate, durationDays);

    // 4. Headcount (Adults, Children, Infants)
    let headcountAdults: number | undefined = undefined;
    let headcountChildren: number | undefined = undefined;
    let headcountInfants: number | undefined = undefined;

    // Check Tamil/English "myself and wife" ("நானும், வைப்பும்" / "நானும் என் மனைவியும்" / "my wife and i")
    if (
      text.includes('நானும், வைப்பும்') ||
      text.includes('நானும் வைப்பும்') ||
      text.includes('நானும் என் மனைவியும்') ||
      text.includes('my wife and i') ||
      text.includes('my husband and i')
    ) {
      headcountAdults = 2;
    }

    // Explicit adults match in English or Tamil ("இரண்டு அடல்ஸ்", "2 adults", "6 பீபுள்", "ஐந்து பேர்")
    const adultTokenMatch = transcriptText.match(
      /(\d+|ஒரு|இரண்டு|ரெண்டு|மூன்று|மூணு|நான்கு|நாலு|ஐந்து|அஞ்சு|ஆறு|ஏழு|எட்டு|ஒன்பது|பத்து)\s*(?:அடல்ஸ்|அடல்ட்ஸ்|அடல்ட்|adults?|guests?|passengers?)/i
    );
    if (adultTokenMatch) {
      const n = parseTamilOrEnglishNumber(adultTokenMatch[1]);
      if (n) headcountAdults = Math.max(1, Math.min(50, n));
    }

    // Explicit children match in English or Tamil ("ரெண்டு கிட்ஸும்", "ஒரு சைல்டு", "2 kids")
    const childTokenMatch = transcriptText.match(
      /(\d+|ஒரு|இரண்டு|ரெண்டு|மூன்று|மூணு|நான்கு|நாலு|ஐந்து|அஞ்சு|ஆறு)\s*(?:கிட்ஸும்|கிட்ஸ்|கிட்|சைல்டு|சைல்ட்|குழந்தைகள்|குழந்தை|kids?|children|child)/i
    );
    if (childTokenMatch) {
      const n = parseTamilOrEnglishNumber(childTokenMatch[1]);
      if (n != null) headcountChildren = Math.max(0, Math.min(20, n));
    }

    // Explicit infants match
    const infantTokenMatch = transcriptText.match(
      /(\d+|ஒரு|இரண்டு|ரெண்டு)\s*(?:இன்ஃபன்ட்|கைக்குழந்தை|infants?|babies|baby)/i
    );
    if (infantTokenMatch) {
      const n = parseTamilOrEnglishNumber(infantTokenMatch[1]);
      if (n != null) headcountInfants = Math.max(0, Math.min(10, n));
    }

    // Total people/group count when adults wasn't explicitly separated
    if (headcountAdults === undefined) {
      const peopleMatch = transcriptText.match(
        /(\d+|ஒரு|இரண்டு|ரெண்டு|மூன்று|மூணு|நான்கு|நாலு|ஐந்து|அஞ்சு|ஆறு|ஏழு|எட்டு|ஒன்பது|பத்து)\s*(?:பீபுள்|பேர்|மெம்பர்ஸ்|people|persons?|pax|members?)/i
      );
      if (peopleMatch) {
        const total = parseTamilOrEnglishNumber(peopleMatch[1]);
        if (total) {
          headcountAdults = Math.max(1, Math.min(50, total));
        }
      } else if (text.includes('couple') || text.includes('honeymoon') || text.includes('two of us')) {
        headcountAdults = 2;
      } else if (text.includes('family of 4') || text.includes('four of us')) {
        headcountAdults = 2;
        if (headcountChildren === undefined) headcountChildren = 2;
      } else if (text.includes('family of 3') || text.includes('three of us')) {
        headcountAdults = 2;
        if (headcountChildren === undefined) headcountChildren = 1;
      } else if (text.includes('solo') || text.includes('single traveller') || text.includes('just me')) {
        headcountAdults = 1;
      }
    }

    // 5. Budget
    let targetBudget: number | undefined = undefined;
    const rangeLakhMatch = transcriptText.match(/(\d+)\s*(?:to|டூ|-)\s*(\d+)\s*(?:லாக்|லட்சம்|lakhs?|lakh)/i);
    if (rangeLakhMatch) {
      const high = parseInt(rangeLakhMatch[2], 10);
      if (high > 0 && high < 100) targetBudget = high * 100000;
    } else {
      const budgetMatch =
        transcriptText.match(
          /(?:₹|rs\.?|inr|\$)?\s*(\d{1,3}(?:,\d{2,3})+|\d+)\s*(?:dollars?|usd|inr|rupees?|ரூபீஸ்|ரூபாய்|lakhs?|lakh|லாக்|லட்சம்|budget|\$|₹)/i
        ) ||
        transcriptText.match(
          /(?:budget|பட்ஜெட்|around|under|maximum)\s*(?:வந்து|of)?\s*(?:₹|rs\.?|inr|\$)?\s*(\d[\d,]*)(?:\s*(?:k|lakh|லாக்|லட்சம்|ரூபீஸ்|ரூபாய்))?/i
        );
      if (budgetMatch) {
        const bStr = budgetMatch[1].replace(/,/g, '');
        let bVal = parseInt(bStr, 10);
        const fullMatch = budgetMatch[0].toLowerCase();
        if ((fullMatch.includes('lakh') || fullMatch.includes('லாக்') || fullMatch.includes('லட்சம்')) && bVal < 1000) {
          bVal *= 100000;
        } else if (fullMatch.includes('k') && bVal < 1000) {
          bVal *= 1000;
        }
        if (bVal >= 500 && bVal <= 50000000) targetBudget = bVal;
      }
    }

    // 6. Hotel Tier
    let hotelTier = '';
    if (text.includes('chalet') || text.includes('villa') || text.includes('வில்லா')) {
      hotelTier = 'chalet_villa';
    } else if (
      text.includes('5 star') ||
      text.includes('5-star') ||
      text.includes('five star') ||
      text.includes('5 ஸ்டார்') ||
      text.includes('பைசா ஹோட்டல்') ||
      text.includes('luxury') ||
      text.includes('லக்ஸரி')
    ) {
      hotelTier = 'luxury_5star';
    } else if (
      text.includes('boutique') ||
      text.includes('4 star') ||
      text.includes('4-star') ||
      text.includes('four star') ||
      text.includes('4 ஸ்டார்') ||
      text.includes('ஃபோர் ஸ்டார்')
    ) {
      hotelTier = 'boutique_4star';
    } else if (
      text.includes('standard') ||
      text.includes('3 star') ||
      text.includes('3-star') ||
      text.includes('three star') ||
      text.includes('3 ஸ்டார்') ||
      text.includes('த்ரீ ஸ்டார்')
    ) {
      hotelTier = 'standard_3star';
    }

    // 7. Special Requests & Inclusions (clean English)
    const reqParts: string[] = [];
    if (rangeLakhMatch) {
      reqParts.push(`Budget: ₹${rangeLakhMatch[1]},000 - ₹${rangeLakhMatch[2]} Lakh`);
    } else if (targetBudget) {
      reqParts.push(`Budget: ₹${targetBudget.toLocaleString('en-IN')}`);
    }
    if (text.includes('பிரேக்ஃபாஸ்ட்') || text.includes('breakfast')) {
      if (text.includes('டின்னர்') || text.includes('dinner')) {
        reqParts.push('Breakfast and dinner included');
      } else {
        reqParts.push('Daily breakfast included');
      }
    } else if (text.includes('ஃபுட்') || text.includes('சாப்பாடு') || text.includes('food')) {
      reqParts.push('All meals / food package requested');
    }
    if (text.includes('தனியா கேப்') || text.includes('private cab') || (text.includes('சைட்சீயிங்') && text.includes('கேப்'))) {
      reqParts.push('Private sightseeing cab');
    }
    if ((text.includes('தமிழ்') || text.includes('tamil')) && (text.includes('டிரைவர்') || text.includes('driver') || text.includes('கைடு') || text.includes('guide'))) {
      reqParts.push('Tamil-speaking driver/guide');
    }
    if (text.includes('ஃபேமிலி') || text.includes('family hotel')) {
      reqParts.push('Family-friendly hotel');
    }
    if (text.includes('vegetarian') || text.includes('vegan') || text.includes('halal') || text.includes('kosher')) {
      reqParts.push('Dietary preference noted in call');
    }
    if (text.includes('anniversary') || text.includes('honeymoon') || text.includes('birthday')) {
      reqParts.push('Special celebration amenities requested');
    }
    const specialRequests = reqParts.join(', ');

    // 8. Customer Name
    let extractedName = cleanContactName;
    if (!extractedName) {
      const nameMatch = transcriptText.match(
        /(?:my\s+name\s+is|i\s+am|this\s+is)\s+([A-Z][a-zA-Z]{2,25})(?:\s+[A-Z][a-zA-Z]{1,25})?(?=[.,;\s]|$)/i
      );
      if (nameMatch && nameMatch[1]) {
        const candidate = nameMatch[1].trim();
        const stopWords = new Set(['calling', 'looking', 'planning', 'interested', 'travelling', 'traveling', 'going', 'from']);
        if (!stopWords.has(candidate.toLowerCase())) {
          extractedName = candidate.charAt(0).toUpperCase() + candidate.slice(1);
        }
      }
    }

    return {
      destination,
      departureDate,
      returnDate,
      durationDays,
      headcountAdults,
      headcountChildren,
      headcountInfants,
      targetBudget,
      hotelTier,
      specialRequests,
      customerName: extractedName,
      customerEmail: contactInfo?.email || '',
      customerPhone: contactInfo?.phone || '',
    };
  };

  const strictFallback = extractStrictlyFromTranscript();

  const messages = [
    {
      role: 'system',
      content: `You are an elite multilingual travel concierge assistant. Extract structured travel inquiry parameters ONLY if they are explicitly mentioned or clearly implied in the customer call transcript.
The transcript may be in Tamil, Tanglish (English words written phonetically in Tamil script such as "சிங்கப்பூர்" = Singapore, "மால்தீவ்ஸ்" = Maldives, "துபை" = Dubai, "யூரோப்" = Europe, "ரோம்" = Rome, "3 நைட்ஸ் 4 டேஸ்" = 4 days, "10 டேஸ்" = 10 days, "நானும் வைப்பும் ரெண்டு கிட்ஸும்" = 2 adults and 2 children, "இரண்டு அடல்ஸ் ஒரு சைல்டு" = 2 adults and 1 child, "6 பீபுள்" / "ஐந்து பேர்" = 6 / 5 adults, "4 ஸ்டார்" = boutique_4star, "பைசா ஹோட்டல்" / "5 ஸ்டார்" = luxury_5star, "50,000 ரூபீஸ்" / "75 to 1 லாக்" = budget), Hindi, or English.

CRITICAL RULES:
1. Translate ALL extracted text fields ("destination", "specialRequests", "customerName") into clean, natural English.
2. Do NOT invent, guess, or provide default values for any field not mentioned in the transcript. If a parameter is not mentioned at all, return null for that key.
3. Reference Call Date: ${referenceDateIso}. If the caller mentions a partial or relative travel date (e.g. "December 20", "டிசம்பர் 20", "28 டிசம்பர் 2026", "coming Sunday"), resolve it relative to ${referenceDateIso} into "YYYY-MM-DD" for "departureDate". If both "departureDate" and "durationDays" are known, calculate "returnDate" in "YYYY-MM-DD".
4. Distinguish the CUSTOMER's name from the travel agency staff/agent's name (for example, if the agent says "ஹலோ பிரின்ஸ் நான் சுதர்சன் பேசுகிறேன்" / "Hello Prince, I am Sudharsan speaking", "Prince" is the customer and "Sudharsan" is the agent). Only put the customer's name in "customerName" (in English).
5. Map "hotelTier" strictly to one of: ["luxury_5star", "boutique_4star", "chalet_villa", "standard_3star"] if hotel category/star rating is mentioned, otherwise null.
6. In "specialRequests", summarize all mentioned preferences, meal plans (e.g. breakfast & dinner, free food), transport (e.g. private sightseeing cab), driver/guide language (e.g. Tamil-speaking driver), and stated budget in clean English.

Return a strictly valid JSON object with these keys:
- "destination": Clean English destination city/country if mentioned, otherwise null
- "departureDate": Target departure date in YYYY-MM-DD format if mentioned, otherwise null
- "returnDate": Target return date in YYYY-MM-DD format if mentioned or calculable from departureDate + durationDays, otherwise null
- "durationDays": Trip duration in integer days if mentioned (e.g. "3 nights 4 days" -> 4), otherwise null
- "headcountAdults": Number of adults (integer) if mentioned, otherwise null
- "headcountChildren": Number of children (integer) if mentioned, otherwise null
- "headcountInfants": Number of infants (integer) if mentioned, otherwise null
- "targetBudget": Approximate total budget as a number if stated, otherwise null
- "hotelTier": One of ["luxury_5star", "boutique_4star", "chalet_villa", "standard_3star"] if mentioned, otherwise null
- "specialRequests": Clean English summary of special requests, inclusions, meals, cab, guide, and budget if mentioned, otherwise null
- "customerName": Clean English customer name if mentioned, otherwise null`,
    },
    {
      role: 'user',
      content: `Call Reference Date: ${referenceDateIso}
Known Contact Name: ${cleanContactName || 'Unknown'}
Transcript:
${transcriptText}

Extract the mentioned trip parameters into JSON (with all text values translated to English).`,
    },
  ];

  try {
    const result = await callLlmJson<TripParameters>({
      messages,
      temperature: 0.1,
      timeoutMs: 12000,
      organizationId,
    });

    if (result) {
      const destination = (result.destination ? String(result.destination).trim() : '') || strictFallback.destination || '';
      const departureDate =
        (result.departureDate && /^\d{4}-\d{2}-\d{2}$/.test(String(result.departureDate).trim())
          ? String(result.departureDate).trim()
          : '') ||
        strictFallback.departureDate ||
        '';
      const durationDays =
        result.durationDays != null && Number(result.durationDays) > 0
          ? Number(result.durationDays)
          : strictFallback.durationDays;
      const returnDate =
        (result.returnDate && /^\d{4}-\d{2}-\d{2}$/.test(String(result.returnDate).trim())
          ? String(result.returnDate).trim()
          : '') ||
        computeReturnDateIso(departureDate, durationDays) ||
        strictFallback.returnDate ||
        '';
      const headcountAdults =
        result.headcountAdults != null && Number(result.headcountAdults) > 0
          ? Number(result.headcountAdults)
          : strictFallback.headcountAdults;
      const headcountChildren =
        result.headcountChildren != null && Number(result.headcountChildren) >= 0
          ? Number(result.headcountChildren)
          : strictFallback.headcountChildren;
      const headcountInfants =
        result.headcountInfants != null && Number(result.headcountInfants) >= 0
          ? Number(result.headcountInfants)
          : strictFallback.headcountInfants;
      const targetBudget =
        result.targetBudget != null && Number(result.targetBudget) > 0
          ? Number(result.targetBudget)
          : strictFallback.targetBudget;
      const hotelTier = normalizeHotelTierCode(result.hotelTier) || strictFallback.hotelTier || '';
      const specialRequests =
        (result.specialRequests ? String(result.specialRequests).trim() : '') ||
        strictFallback.specialRequests ||
        '';
      const customerName =
        cleanContactName ||
        (result.customerName ? String(result.customerName).trim() : '') ||
        strictFallback.customerName ||
        '';

      return {
        destination,
        departureDate,
        returnDate,
        durationDays,
        headcountAdults,
        headcountChildren,
        headcountInfants,
        targetBudget,
        hotelTier,
        specialRequests,
        customerName,
        customerEmail: contactInfo?.email || '',
        customerPhone: contactInfo?.phone || '',
      };
    }
  } catch (err: any) {
    console.warn('Parameter extraction LLM failed, using strict transcript extraction:', err?.message || err);
  }

  return strictFallback;
}

export interface FormattedRulesContext {
  promptText: string;
  ruleCount: number;
  rules: Array<{
    id: string;
    title: string;
    category: string;
    priority: number;
    rulePrompt: string;
    condition?: string | null;
  }>;
}

/**
 * Loads active itinerary preparation rules for the tenant organization from the database,
 * evaluates applicable conditions against trip parameters, and formats them as strict LLM context.
 */
export async function getActiveItineraryRulesForOrg(
  organizationId?: string,
  params?: TripParameters
): Promise<FormattedRulesContext> {
  if (!organizationId) {
    return { promptText: '', ruleCount: 0, rules: [] };
  }

  try {
    const rules = await db.itineraryRule.findMany({
      where: {
        organizationId,
        isActive: true,
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    if (!rules || rules.length === 0) {
      return { promptText: '', ruleCount: 0, rules: [] };
    }

    // Filter rules based on condition if specified
    const applicableRules = rules.filter((r) => {
      if (!r.condition || r.condition.trim().toLowerCase() === 'all') return true;
      const cond = r.condition.toLowerCase();

      // Check condition keywords against trip params
      if (cond.includes('children') || cond.includes('family') || cond.includes('kids')) {
        return (params?.headcountChildren ?? 0) > 0 || (params?.headcountInfants ?? 0) > 0;
      }
      if (cond.includes('luxury') || cond.includes('5star') || cond.includes('5-star')) {
        return params?.hotelTier === 'luxury_5star' || params?.hotelTier === 'chalet_villa';
      }
      if (cond.includes('budget') || cond.includes('standard')) {
        return params?.hotelTier === 'standard_3star' || (params?.targetBudget ? params.targetBudget < 3000 : false);
      }
      if (cond.startsWith('destination:')) {
        const destTarget = cond.replace('destination:', '').trim();
        return (params?.destination || '').toLowerCase().includes(destTarget);
      }

      return true;
    });

    if (applicableRules.length === 0) {
      return { promptText: '', ruleCount: 0, rules: [] };
    }

    const lines = applicableRules.map((r, i) => {
      const priorityLabel = r.priority >= 3 ? 'STRICT / MANDATORY' : r.priority === 2 ? 'HIGH PRIORITY' : 'STANDARD';
      const condLabel = r.condition && r.condition !== 'all' ? ` [Applies when: ${r.condition}]` : '';
      return `${i + 1}. [${r.title.toUpperCase()}] (Category: ${r.category.toUpperCase()} | Priority: ${priorityLabel}${condLabel}):\n   Rule Directive: ${r.rulePrompt}`;
    });

    const promptText = `### MANDATORY AGENCY ITINERARY PREPARATION RULES:
The travel agency has established ${applicableRules.length} mandatory operational rule(s) that you MUST strictly abide by when synthesizing this itinerary:

${lines.join('\n\n')}

CRITICAL INSTRUCTION: You MUST incorporate all the active rules above into the final schedule, pacing, accommodation descriptions, dining recommendations, and quotation scope. Do not violate any of the specified rules under any circumstances.`;

    return {
      promptText,
      ruleCount: applicableRules.length,
      rules: applicableRules,
    };
  } catch (err: any) {
    console.warn('Failed to load active itinerary rules for org:', err?.message || err);
    return { promptText: '', ruleCount: 0, rules: [] };
  }
}

export async function generateItineraryFromTranscript(
  transcriptText: string,
  contactInfo?: { name?: string; phone?: string; company?: string; email?: string },
  organizationId?: string,
  customParams?: TripParameters
): Promise<ItineraryResult> {
  // Extract strictly from transcript (no fallback defaults) and merge with user-supplied customParams
  const extracted = transcriptText?.trim()
    ? await extractTripParametersFromTranscript(transcriptText, contactInfo, organizationId)
    : {};

  const destination = customParams?.destination?.trim() || extracted.destination?.trim() || '';
  const duration = customParams?.durationDays ?? extracted.durationDays;
  const adults = customParams?.headcountAdults ?? extracted.headcountAdults;
  const children = customParams?.headcountChildren ?? extracted.headcountChildren;
  const infants = customParams?.headcountInfants ?? extracted.headcountInfants;
  const budgetVal = customParams?.targetBudget ?? extracted.targetBudget;
  const budget = budgetVal ? `₹${Number(budgetVal).toLocaleString('en-IN')}` : '';
  const hotelTier = customParams?.hotelTier?.trim() || extracted.hotelTier?.trim() || '';
  const departureDate = customParams?.departureDate?.trim() || extracted.departureDate?.trim() || '';
  const specialRequests = customParams?.specialRequests?.trim() || extracted.specialRequests?.trim() || '';
  const customerName =
    (customParams?.customerName && customParams.customerName !== 'Valued Client' ? customParams.customerName.trim() : '') ||
    (contactInfo?.name && contactInfo.name !== 'Valued Client' ? contactInfo.name.trim() : '') ||
    extracted.customerName?.trim() ||
    '';
  const customerEmail = customParams?.customerEmail?.trim() || contactInfo?.email?.trim() || extracted.customerEmail?.trim() || '';

  // 1. Fetch organization's active itinerary preparation rules from Settings
  const rulesContext = await getActiveItineraryRulesForOrg(organizationId, {
    ...extracted,
    ...customParams,
    destination: destination || undefined,
    durationDays: duration,
    headcountAdults: adults,
    headcountChildren: children,
    hotelTier: hotelTier || undefined,
  });

  // If neither transcript nor destination was provided, return blank itinerary and only the provided fields
  if (!transcriptText?.trim() && !destination) {
    return {
      title: '',
      destination: '',
      itinerary: '',
      durationDays: duration,
      departureDate: departureDate || undefined,
      headcountAdults: adults,
      headcountChildren: children,
      headcountInfants: infants,
      hotelTier: hotelTier || undefined,
      specialRequests: specialRequests || undefined,
      customerName: customerName || undefined,
      customerEmail: customerEmail || undefined,
    };
  }

  const messages = [
    {
      role: 'system',
      content:
        `You are an elite FIT travel proposal specialist. Analyze the customer conversation transcript, confirmed travel parameters, and the travel agency's strict itinerary preparation rules, and generate a comprehensive, destination-specific FIT travel proposal.${
          rulesContext.ruleCount > 0 ? `\n\n${rulesContext.promptText}` : ''
        }\n\nIMPORTANT: Do NOT use static sample content from other destinations. Every section, day programme, inclusion, exclusion, and preference must be dynamically tailored to the guest's actual destination (${destination || 'as stated in transcript'}), duration (${duration ? `${duration} days` : 'as stated in transcript'}), and transcript. Do NOT use USD currency or include estimated budget disclaimers before supplier quotation; always use INR (₹) if currency is referenced, and use clean bullet points (- ...) instead of pipe tables (| ... |) for lists.\n\nReturn a strictly valid JSON object with the following keys:\n- "title": A compelling title for the itinerary\n- "destination": The target destination\n- "itinerary": The complete Markdown travel proposal following this exact structure:\n  1. "# <Title>" with Guest, Destination, Duration, Travel Dates, Party Size, Accommodation Category\n  2. "## 1. Executive Summary" (Overview paragraph + structured Trip Overview bullets: Destination, Duration, Hotel plan, Meal plan, Transfers, Flights, Pace)\n  3. "## 2. Guest Preferences" with "### Recorded requirements" and "### To confirm before booking"\n  4. "## 3. Day-by-Day Journey Itinerary" with "### Day 1: <Title>" through the final day. Each day MUST include 1-2 concise programme paragraphs followed by:\n     Overnight: <City> (omit on final departure day)\n     Meals: <Included meals>\n     Transfers: <Transfer type>\n     Included experience: <Specific attraction/tour included>\n     Notes: <Operational note>\n  5. "## 4. Curated Accommodations" (Hotel category, Stay, Room, Meal plan, Hotel name)\n  6. "## 5. Package Includes" (numbered list of exact included services matching the daily itinerary)\n  7. "## 6. Package Excludes" (numbered list of excluded items)\n  8. "## 7. Before Travel" (clean bullet list of items to provide or confirm before travel — never a pipe table)\n  (Do NOT include a Sample Quotation section in the itinerary before supplier quotation)`,
    },
    {
      role: 'user',
      content: `Customer Name: ${customerName || 'Not specified'}
Phone: ${contactInfo?.phone || customParams?.customerPhone || 'Not specified'}
Email: ${customerEmail || 'Not specified'}

Confirmed Trip Parameters:
- Target Destination: ${destination || 'Extract from transcript'}
- Duration: ${duration ? `${duration} Days / ${Math.max(1, duration - 1)} Nights` : 'Extract from transcript'}
- Departure Date: ${departureDate || 'Not specified'}
- Party Size: ${adults != null ? `${adults} Adults` : 'Not specified'}${children != null ? `, ${children} Children` : ''}
- Target Budget: ${budget || 'Not specified'}
- Preferred Hotel Tier: ${hotelTier || 'Not specified'}
- Special Requests & Inclusions: ${specialRequests || 'None specified'}
${rulesContext.promptText ? `\nEnforced Agency Preparation Rules (${rulesContext.ruleCount} active):\n${rulesContext.promptText}\n` : ''}
Verbatim Call Transcript:
${transcriptText || '(No call transcript available)'}

Synthesize the travel proposal adhering strictly to the confirmed parameters and all active agency itinerary preparation rules. Return the JSON object with "title", "destination", and "itinerary".`,
    },
  ];

  const result = await callLlmJson<{ title?: string; destination?: string; itinerary?: string }>({
    messages,
    temperature: 0.6,
    timeoutMs: 35000,
    organizationId,
  });

  if (result?.itinerary) {
    let finalItinerary = result.itinerary;
    if (rulesContext.rules.length > 0 && !finalItinerary.includes('Applied Agency Guidelines')) {
      finalItinerary += `\n\n> **Applied Agency Guidelines:**\n${rulesContext.rules.map((r) => `> - *${r.title}*: ${r.rulePrompt}`).join('\n')}\n`;
    }
    const resolvedDestination = result.destination?.trim() || destination;
    const resolvedTitle =
      result.title?.trim() ||
      (resolvedDestination
        ? duration
          ? `Bespoke ${duration}-Day Journey to ${resolvedDestination}`
          : `${resolvedDestination} Itinerary`
        : '');
    const titleDayMatch = resolvedTitle.match(/\b(\d+)-Day\b/i);
    const effectiveDuration = titleDayMatch ? parseInt(titleDayMatch[1], 10) : duration;

    return {
      title: resolvedTitle,
      destination: resolvedDestination,
      itinerary: finalItinerary,
      durationDays: effectiveDuration,
      departureDate: departureDate || undefined,
      headcountAdults: adults,
      headcountChildren: children,
      headcountInfants: infants,
      hotelTier: hotelTier || undefined,
      specialRequests: specialRequests || undefined,
      customerName: customerName || undefined,
      customerEmail: customerEmail || undefined,
    };
  }

  // No hardcoded offline fallback itinerary — keep itinerary blank for manual entry/revision
  const minimalTitle = destination
    ? duration
      ? `Bespoke ${duration}-Day Journey to ${destination}`
      : `${destination} Itinerary`
    : '';

  return {
    title: minimalTitle,
    destination,
    itinerary: '',
    durationDays: duration,
    departureDate: departureDate || undefined,
    headcountAdults: adults,
    headcountChildren: children,
    headcountInfants: infants,
    hotelTier: hotelTier || undefined,
    specialRequests: specialRequests || undefined,
    customerName: customerName || undefined,
    customerEmail: customerEmail || undefined,
  };
}

export async function reviseItineraryWithDeepSeek(
  currentItinerary: string,
  correctionNotes: string,
  organizationId?: string
): Promise<string> {
  const rulesContext = await getActiveItineraryRulesForOrg(organizationId);

  const messages = [
    {
      role: 'system',
      content:
        `You are an expert travel concierge. Revise the provided travel itinerary according to the user corrections and requested adjustments while maintaining full adherence to the agency's established itinerary preparation rules.${
          rulesContext.ruleCount > 0 ? `\n\n${rulesContext.promptText}` : ''
        }\n\nPreserve the structured sections (Executive Summary, Guest Preferences, Day-by-Day Journey Itinerary with Overnight/Meals/Transfers/Included experience/Notes, Curated Accommodations, Package Includes, Package Excludes, Before Travel) and output the revised Markdown itinerary. Do NOT use USD currency or include estimated budget conflict disclaimers before supplier quotation; use clean bullet lists (- ...) instead of pipe tables (| ... |) for Guest Preferences, Package Includes, Package Excludes, and Before Travel.`,
    },
    {
      role: 'user',
      content: `Current Itinerary:
${currentItinerary}

Requested Corrections & Changes:
${correctionNotes}
${rulesContext.promptText ? `\nActive Agency Itinerary Preparation Rules:\n${rulesContext.promptText}\n` : ''}
Provide the complete updated and polished itinerary adhering to the corrections and agency rules.`,
    },
  ];

  const content = await callLlmText({
    messages,
    temperature: 0.5,
    timeoutMs: 35000,
    organizationId,
  });

  if (content) return content;

  return currentItinerary;
}


