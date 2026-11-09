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

async function resolveTenantAiConfig(organizationId?: string): Promise<ResolvedAiConfig> {
  let deepseekKey = process.env.DEEPSEEK_API_KEY;
  let deepseekBaseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  let deepseekModel = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

  let openaiKey = process.env.OPENAI_API_KEY;
  let openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (organizationId) {
    // 1. Fetch tenant's DeepSeek BYOK integration
    const deepseekInteg = await getTenantIntegration(organizationId, 'deepseek');
    if (deepseekInteg?.credentials?.apiKey) {
      deepseekKey = deepseekInteg.credentials.apiKey;
      if (deepseekInteg.metadata?.baseUrl) {
        deepseekBaseUrl = deepseekInteg.metadata.baseUrl.replace(/\/+$/, '');
      }
      if (deepseekInteg.metadata?.model) {
        deepseekModel = deepseekInteg.metadata.model;
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
      if (openaiInteg.metadata?.model) {
        openaiModel = openaiInteg.metadata.model;
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

export async function extractTripParametersFromTranscript(
  transcriptText: string,
  contactInfo?: { name?: string; phone?: string; email?: string; company?: string },
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

  // Strict transcript-only extractor (no fallback defaults when not mentioned in transcript)
  const extractStrictlyFromTranscript = (): TripParameters => {
    const text = transcriptText.toLowerCase();

    // Destination: only set if explicitly mentioned in transcript
    let destination = '';
    if (text.includes('singapore') || text.includes('sentosa')) destination = 'Singapore';
    else if (text.includes('dubai') || text.includes('uae') || text.includes('united arab emirates')) destination = 'Dubai, United Arab Emirates';
    else if (text.includes('paris') || text.includes('france')) destination = 'Paris, France';
    else if (text.includes('tokyo') || text.includes('kyoto') || text.includes('japan')) destination = 'Tokyo & Kyoto, Japan';
    else if (text.includes('swiss') || text.includes('alps') || text.includes('switzerland') || text.includes('zurich') || text.includes('zermatt')) destination = 'Swiss Alps, Switzerland';
    else if (text.includes('bali') || text.includes('indonesia') || text.includes('ubud')) destination = 'Bali, Indonesia';
    else if (text.includes('rome') || text.includes('italy') || text.includes('amalfi') || text.includes('florence') || text.includes('venice')) destination = 'Rome & Amalfi Coast, Italy';
    else if (text.includes('london') || text.includes('uk') || text.includes('england')) destination = 'London, United Kingdom';
    else if (text.includes('maldives')) destination = 'Maldives';
    else if (text.includes('new york') || text.includes('nyc')) destination = 'New York City, USA';
    else if (text.includes('thailand') || text.includes('phuket') || text.includes('bangkok') || text.includes('krabi')) destination = 'Phuket & Krabi, Thailand';
    else if (text.includes('vietnam') || text.includes('hanoi') || text.includes('da nang') || text.includes('halong')) destination = 'Vietnam';
    else if (text.includes('kerala') || text.includes('munnar') || text.includes('alleppey')) destination = 'Kerala, India';
    else if (text.includes('greece') || text.includes('santorini') || text.includes('athens') || text.includes('mykonos')) destination = 'Athens & Santorini, Greece';

    // Duration: only set if explicitly mentioned in transcript
    let durationDays: number | undefined = undefined;
    const durMatch = text.match(/(\d+)\s*(days?|nights?)/i);
    if (durMatch) {
      durationDays = Math.max(1, Math.min(60, parseInt(durMatch[1], 10)));
    } else if (text.includes('a week') || text.includes('one week') || text.includes('7 days')) {
      durationDays = 7;
    } else if (text.includes('weekend') || text.includes('3 days')) {
      durationDays = 3;
    }

    // Departure Date: only set if an explicit YYYY-MM-DD date is mentioned in transcript
    let departureDate = '';
    const isoDateMatch = transcriptText.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (isoDateMatch) {
      departureDate = isoDateMatch[1];
    }

    // Headcount: only set if explicitly mentioned in transcript
    let headcountAdults: number | undefined = undefined;
    let headcountChildren: number | undefined = undefined;
    let headcountInfants: number | undefined = undefined;

    if (text.includes('solo') || text.includes('single traveller') || text.includes('just me') || text.includes('myself')) {
      headcountAdults = 1;
    } else if (text.includes('couple') || text.includes('honeymoon') || text.includes('two of us') || text.includes('my wife and i') || text.includes('my husband and i')) {
      headcountAdults = 2;
    } else if (text.includes('family of 4') || text.includes('four of us')) {
      headcountAdults = 2;
      headcountChildren = 2;
    } else if (text.includes('family of 3') || text.includes('three of us')) {
      headcountAdults = 2;
      headcountChildren = 1;
    } else {
      const adultMatch = text.match(/(\d+)\s*(adults?|guests?|passengers?|people|persons?)/i);
      if (adultMatch) {
        headcountAdults = Math.max(1, Math.min(50, parseInt(adultMatch[1], 10)));
      }
      const childMatch = text.match(/(\d+)\s*(kids?|children)/i);
      if (childMatch) {
        headcountChildren = Math.max(0, Math.min(20, parseInt(childMatch[1], 10)));
      }
      const infantMatch = text.match(/(\d+)\s*(infants?|babies)/i);
      if (infantMatch) {
        headcountInfants = Math.max(0, Math.min(10, parseInt(infantMatch[1], 10)));
      }
    }

    // Budget: only set if explicitly mentioned in transcript
    let targetBudget: number | undefined = undefined;
    const budgetMatch =
      text.match(/(?:₹|rs\.?|inr|\$)?\s*(\d{1,3}(?:,\d{2,3})+|\d+)\s*(?:dollars?|usd|inr|rupees?|lakhs?|budget|\$|₹)/i) ||
      text.match(/(?:budget|around|under|maximum)\s*(?:of\s*)?(?:₹|rs\.?|inr|\$)?\s*(\d[\d,]*)(?:k|lakh)?/i);
    if (budgetMatch) {
      const bStr = budgetMatch[1].replace(/,/g, '');
      let bVal = parseInt(bStr, 10);
      if (budgetMatch[0].toLowerCase().includes('lakh') && bVal < 1000) bVal *= 100000;
      else if (budgetMatch[0].toLowerCase().includes('k') && bVal < 1000) bVal *= 1000;
      if (bVal >= 500 && bVal <= 50000000) targetBudget = bVal;
    }

    // Hotel tier: only set if explicitly mentioned in transcript
    let hotelTier = '';
    if (text.includes('chalet') || text.includes('villa')) hotelTier = 'chalet_villa';
    else if (text.includes('5 star') || text.includes('5-star') || text.includes('five star') || text.includes('luxury')) hotelTier = 'luxury_5star';
    else if (text.includes('boutique') || text.includes('4 star') || text.includes('4-star') || text.includes('four star')) hotelTier = 'boutique_4star';
    else if (text.includes('standard') || text.includes('3 star') || text.includes('3-star') || text.includes('three star')) hotelTier = 'standard_3star';

    // Special requests: only set if explicitly mentioned in transcript
    const reqParts: string[] = [];
    if (text.includes('vegetarian') || text.includes('vegan') || text.includes('halal') || text.includes('kosher')) {
      reqParts.push('Dietary preference noted in call');
    }
    if (text.includes('anniversary') || text.includes('honeymoon') || text.includes('birthday')) {
      reqParts.push('Special celebration amenities requested');
    }
    const specialRequests = reqParts.join(', ');

    // Customer name: only from contactInfo or explicit mention in transcript
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

  const messages = [
    {
      role: 'system',
      content: `You are an elite travel concierge assistant. Extract structured travel inquiry parameters ONLY if they are explicitly mentioned in the customer conversation transcript.
Do NOT invent, guess, or provide default values for any field not mentioned in the transcript. If a parameter is not mentioned, return null for that key.
Return a strictly valid JSON object with the following fields:
- "destination": Destination city/country if mentioned in the transcript, otherwise null
- "departureDate": Target departure date in YYYY-MM-DD format if mentioned in the transcript, otherwise null
- "durationDays": Trip duration in integer days if mentioned in the transcript, otherwise null
- "headcountAdults": Number of adults if mentioned in the transcript, otherwise null
- "headcountChildren": Number of children if mentioned in the transcript, otherwise null
- "headcountInfants": Number of infants if mentioned in the transcript, otherwise null
- "targetBudget": Approximate total budget as a number if explicitly stated in the conversation, otherwise null
- "hotelTier": One of ["luxury_5star", "boutique_4star", "chalet_villa", "standard_3star"] if mentioned in the transcript, otherwise null
- "specialRequests": Any special requests, inclusions, or dietary preferences explicitly mentioned in the transcript, otherwise null
- "customerName": The customer's name if mentioned in the transcript, otherwise null`,
    },
    {
      role: 'user',
      content: `Transcript:
${transcriptText}

Extract only the explicitly mentioned parameters into JSON.`,
    },
  ];

  try {
    const result = await callLlmJson<TripParameters>({
      messages,
      temperature: 0.1,
      timeoutMs: 15000,
      organizationId,
    });

    if (result) {
      return {
        destination: result.destination ? String(result.destination).trim() : '',
        departureDate: result.departureDate ? String(result.departureDate).trim() : '',
        durationDays: result.durationDays != null ? Number(result.durationDays) : undefined,
        headcountAdults: result.headcountAdults != null ? Number(result.headcountAdults) : undefined,
        headcountChildren: result.headcountChildren != null ? Number(result.headcountChildren) : undefined,
        headcountInfants: result.headcountInfants != null ? Number(result.headcountInfants) : undefined,
        targetBudget: result.targetBudget != null ? Number(result.targetBudget) : undefined,
        hotelTier: result.hotelTier ? String(result.hotelTier).trim() : '',
        specialRequests: result.specialRequests ? String(result.specialRequests).trim() : '',
        customerName: cleanContactName || (result.customerName ? String(result.customerName).trim() : ''),
        customerEmail: contactInfo?.email || '',
        customerPhone: contactInfo?.phone || '',
      };
    }
  } catch (err: any) {
    console.warn('Parameter extraction LLM failed, using strict transcript extraction:', err?.message || err);
  }

  return extractStrictlyFromTranscript();
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


