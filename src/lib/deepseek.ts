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
  const defaultDeparture = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  // Heuristic extractor for fallback
  const fallbackExtract = (): TripParameters => {
    const text = transcriptText.toLowerCase();
    
    // Destination heuristic
    let destination = 'Dubai, United Arab Emirates';
    if (text.includes('singapore') || text.includes('sentosa')) destination = 'Singapore';
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

    // Duration heuristic
    let durationDays = 5;
    const durMatch = text.match(/(\d+)\s*(days?|nights?)/i);
    if (durMatch) {
      durationDays = Math.max(2, Math.min(30, parseInt(durMatch[1], 10)));
    } else if (text.includes('week') || text.includes('7 days')) {
      durationDays = 7;
    } else if (text.includes('weekend') || text.includes('3 days')) {
      durationDays = 3;
    }

    // Headcount heuristic
    let headcountAdults = 2;
    let headcountChildren = 0;
    if (text.includes('solo') || text.includes('single') || text.includes('just me') || text.includes('myself')) {
      headcountAdults = 1;
    } else if (text.includes('family of 4') || text.includes('four of us')) {
      headcountAdults = 2;
      headcountChildren = 2;
    } else if (text.includes('family of 3') || text.includes('three of us')) {
      headcountAdults = 2;
      headcountChildren = 1;
    } else {
      const adultMatch = text.match(/(\d+)\s*(adults?|guests?|passengers?|people|persons?)/i);
      if (adultMatch) {
        headcountAdults = Math.max(1, Math.min(20, parseInt(adultMatch[1], 10)));
      }
      const childMatch = text.match(/(\d+)\s*(kids?|children)/i);
      if (childMatch) {
        headcountChildren = Math.max(0, Math.min(10, parseInt(childMatch[1], 10)));
      }
    }

    // Budget heuristic (only set if explicitly mentioned in transcript)
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

    // Hotel tier heuristic
    let hotelTier = 'luxury_5star';
    if (text.includes('chalet') || text.includes('villa')) hotelTier = 'chalet_villa';
    else if (text.includes('boutique') || text.includes('4 star') || text.includes('4-star')) hotelTier = 'boutique_4star';
    else if (text.includes('standard') || text.includes('3 star') || text.includes('3-star') || text.includes('budget')) hotelTier = 'standard_3star';

    // Special requests
    let specialRequests = 'Private airport transfer, panoramic suite view, customized excursion schedule';
    if (text.includes('vegetarian') || text.includes('vegan') || text.includes('halal') || text.includes('kosher')) {
      specialRequests += ', dietary preference noted';
    }
    if (text.includes('anniversary') || text.includes('honeymoon') || text.includes('birthday')) {
      specialRequests += ', special celebration amenities';
    }

    // Customer name heuristic from transcript if not in contactInfo
    let extractedName = contactInfo?.name;
    if (!extractedName || extractedName.toLowerCase() === 'valued client' || extractedName.toLowerCase() === 'customer') {
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
      departureDate: defaultDeparture,
      durationDays,
      headcountAdults,
      headcountChildren,
      headcountInfants: 0,
      targetBudget,
      hotelTier,
      specialRequests,
      customerName: extractedName || 'Guest',
      customerEmail: contactInfo?.email || '',
      customerPhone: contactInfo?.phone || '',
    };
  };

  const messages = [
    {
      role: 'system',
      content: `You are an elite travel concierge assistant. Extract structured travel inquiry parameters from a customer conversation transcript.
Return a strictly valid JSON object with the following fields:
- "destination": Destination city and country (e.g. "Paris, France" or "Dubai, UAE")
- "departureDate": Target departure date in YYYY-MM-DD format (use "${defaultDeparture}" if not mentioned)
- "durationDays": Trip duration in integer days (default 5 if not mentioned)
- "headcountAdults": Number of adults (default 2)
- "headcountChildren": Number of children (default 0)
- "headcountInfants": Number of infants (default 0)
- "targetBudget": Approximate total budget as a number if explicitly stated in the conversation, otherwise null
- "hotelTier": One of ["luxury_5star", "boutique_4star", "chalet_villa", "standard_3star"]
- "specialRequests": Any special requests, inclusions, or dietary preferences mentioned
- "customerName": The customer's name if mentioned in the transcript, otherwise null`,
    },
    {
      role: 'user',
      content: `Transcript:
${transcriptText}

Extract the parameters into JSON.`,
    },
  ];

  try {
    const result = await callLlmJson<TripParameters>({
      messages,
      temperature: 0.2,
      timeoutMs: 15000,
      organizationId,
    });

    if (result && (result.destination || result.durationDays)) {
      return {
        destination: result.destination || 'Dubai, United Arab Emirates',
        departureDate: result.departureDate || defaultDeparture,
        durationDays: result.durationDays ? Number(result.durationDays) : 5,
        headcountAdults: result.headcountAdults ? Number(result.headcountAdults) : 2,
        headcountChildren: result.headcountChildren ? Number(result.headcountChildren) : 0,
        headcountInfants: result.headcountInfants ? Number(result.headcountInfants) : 0,
        targetBudget: result.targetBudget ? Number(result.targetBudget) : undefined,
        hotelTier: result.hotelTier || 'luxury_5star',
        specialRequests: result.specialRequests || 'Private airport transfer, city excursions',
        customerName: contactInfo?.name || result.customerName || 'Guest',
        customerEmail: contactInfo?.email || '',
        customerPhone: contactInfo?.phone || '',
      };
    }
  } catch (err: any) {
    console.warn('Parameter extraction LLM failed, using heuristic extraction:', err?.message || err);
  }

  return fallbackExtract();
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
  // If customParams aren't fully specified, extract from transcript first so destination/duration/budget are never static
  const extracted = await extractTripParametersFromTranscript(transcriptText, contactInfo, organizationId);
  const destination = customParams?.destination || extracted.destination || 'Curated Destination';
  const duration = customParams?.durationDays || extracted.durationDays || 5;
  const adults = customParams?.headcountAdults ?? extracted.headcountAdults ?? 2;
  const children = customParams?.headcountChildren ?? extracted.headcountChildren ?? 0;
  const budgetVal = customParams?.targetBudget ?? extracted.targetBudget;
  const budget = budgetVal ? `₹${Number(budgetVal).toLocaleString('en-IN')}` : 'To be confirmed';
  const hotelTier = customParams?.hotelTier || extracted.hotelTier || 'boutique_4star';
  const departureDate = customParams?.departureDate || extracted.departureDate || new Date().toISOString().split('T')[0];
  const specialRequests = customParams?.specialRequests || extracted.specialRequests || 'Private airport transfers and curated sightseeing';

  // 1. Fetch organization's active itinerary preparation rules from Settings
  const rulesContext = await getActiveItineraryRulesForOrg(organizationId, {
    ...extracted,
    ...customParams,
    destination,
    durationDays: duration,
    headcountAdults: adults,
    headcountChildren: children,
    hotelTier,
  });

  const messages = [
    {
      role: 'system',
      content:
        `You are an elite FIT travel proposal specialist. Analyze the customer conversation transcript, confirmed travel parameters, and the travel agency's strict itinerary preparation rules, and generate a comprehensive, destination-specific FIT travel proposal.${
          rulesContext.ruleCount > 0 ? `\n\n${rulesContext.promptText}` : ''
        }\n\nIMPORTANT: Do NOT use static sample content from other destinations. Every section, day programme, inclusion, exclusion, and preference must be dynamically tailored to the guest's actual destination (${destination}), duration (${duration} days), and transcript. Do NOT use USD currency or include estimated budget disclaimers before supplier quotation; always use INR (₹) if currency is referenced, and use clean bullet points (- ...) instead of pipe tables (| ... |) for lists.\n\nReturn a strictly valid JSON object with the following keys:\n- "title": A compelling title for the itinerary (e.g. "Bespoke ${duration}-Day Journey to ${destination}")\n- "destination": The target destination (e.g. "${destination}")\n- "itinerary": The complete Markdown travel proposal following this exact structure:\n  1. "# <Title>" with Guest, Destination, Duration, Travel Dates, Party Size, Accommodation Category\n  2. "## 1. Executive Summary" (Overview paragraph summarizing the ${duration}-day ${destination} holiday + structured Trip Overview bullets: Destination, Duration, Hotel plan, Meal plan, Transfers, Flights, Pace)\n  3. "## 2. Guest Preferences" with "### Recorded requirements" (5 numbered requirements from the conversation) and "### To confirm before booking" (items to confirm)\n  4. "## 3. Day-by-Day Journey Itinerary" with "### Day 1: <Title>" through "### Day ${duration}: <Title>". Each day MUST include 1-2 concise programme paragraphs followed by:\n     Overnight: <City> (omit on final departure day)\n     Meals: <Included meals>\n     Transfers: <Transfer type>\n     Included experience: <Specific attraction/tour included>\n     Notes: <Operational note>\n  5. "## 4. Curated Accommodations" (Hotel category, Stay, Room, Meal plan, Hotel name)\n  6. "## 5. Package Includes" (numbered list of exact included services matching the daily itinerary)\n  7. "## 6. Package Excludes" (numbered list of excluded items for ${destination})\n  8. "## 7. Before Travel" (clean bullet list of items to provide or confirm before travel — never a pipe table)\n  (Do NOT include a Sample Quotation section in the itinerary before supplier quotation)`,
    },
    {
      role: 'user',
      content: `Customer Name: ${contactInfo?.name || customParams?.customerName || 'Guest'}
Phone: ${contactInfo?.phone || customParams?.customerPhone || 'N/A'}
Email: ${contactInfo?.email || customParams?.customerEmail || 'N/A'}

Confirmed Trip Parameters:
- Target Destination: ${destination}
- Duration: ${duration} Days / ${Math.max(1, duration - 1)} Nights
- Departure Date: ${departureDate}
- Party Size: ${adults} Adults, ${children} Children
- Target Budget: ${budget}
- Preferred Hotel Tier: ${hotelTier}
- Special Requests & Inclusions: ${specialRequests}
${rulesContext.promptText ? `\nEnforced Agency Preparation Rules (${rulesContext.ruleCount} active):\n${rulesContext.promptText}\n` : ''}
Verbatim Call Transcript:
${transcriptText}

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
    const resolvedTitle =
      result.title || `${contactInfo?.name || 'Guest'} - Bespoke ${duration}-Day ${destination} Itinerary`;
    const titleDayMatch = resolvedTitle.match(/\b(\d+)-Day\b/i);
    const effectiveDuration = titleDayMatch ? parseInt(titleDayMatch[1], 10) : duration;

    return {
      title: resolvedTitle,
      destination: result.destination || destination,
      itinerary: finalItinerary,
      durationDays: effectiveDuration,
      departureDate,
      headcountAdults: adults,
      headcountChildren: children,
      headcountInfants: customParams?.headcountInfants ?? extracted.headcountInfants ?? 0,
      hotelTier,
      specialRequests,
      customerName: customParams?.customerName || contactInfo?.name || extracted.customerName,
      customerEmail: customParams?.customerEmail || contactInfo?.email || extracted.customerEmail,
    };
  }

  // Dynamic destination-aware fallback if AI provider is offline or times out
  const fallbackResult = generateOfflineFallback(
    contactInfo,
    {
      ...extracted,
      ...customParams,
      destination,
      durationDays: duration,
      headcountAdults: adults,
      headcountChildren: children,
      hotelTier,
      departureDate,
      specialRequests,
    },
    rulesContext
  );
  return {
    ...fallbackResult,
    durationDays: duration,
    departureDate,
    headcountAdults: adults,
    headcountChildren: children,
    headcountInfants: customParams?.headcountInfants ?? extracted.headcountInfants ?? 0,
    hotelTier,
    specialRequests,
    customerName: customParams?.customerName || contactInfo?.name || extracted.customerName,
    customerEmail: customParams?.customerEmail || contactInfo?.email || extracted.customerEmail,
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

  // Fallback revision if offline
  return `${currentItinerary}\n\n---\n### Revisions Applied\n* ${correctionNotes}\n*(Updated on ${new Date().toLocaleDateString()})*`;
}

function getDestinationExperiences(destination: string): Array<{
  title: string;
  narrative: string[];
  transfers: string;
  experience: string;
  notes?: string;
}> {
  const lower = destination.toLowerCase();
  if (lower.includes('singapore')) {
    return [
      {
        title: 'Singapore city highlights',
        narrative: [
          'After breakfast, meet the driver and guide for a half-day city tour. Visit selected city landmarks, with photo stops at Merlion Park and Marina Bay. Continue through key civic and cultural districts, subject to traffic and operating conditions.',
          'Return to the hotel. Afternoon at leisure.',
        ],
        transfers: 'Hotel pick-up and drop-off for the city tour',
        experience: 'Half-day guided city tour',
      },
      {
        title: 'Gardens by the Bay',
        narrative: [
          'After breakfast, travel to Gardens by the Bay. Visit the Flower Dome and Cloud Forest. Allow time to explore the outdoor gardens independently.',
          'Return to the hotel at a pre-arranged time.',
        ],
        transfers: 'Private transfer to and from Gardens by the Bay',
        experience: 'Flower Dome and Cloud Forest admission',
      },
      {
        title: 'Universal Studios Singapore',
        narrative: [
          'After breakfast, travel to Resorts World Sentosa for a full day at Universal Studios Singapore. Explore the park at your own pace and return to the hotel by private transfer in the evening.',
        ],
        transfers: 'Private hotel-to-Sentosa and return transfer',
        experience: 'One-day standard admission ticket',
        notes: 'Ride access and operating hours are determined by the attraction.',
      },
    ];
  }
  if (lower.includes('dubai') || lower.includes('uae')) {
    return [
      {
        title: 'Dubai city highlights & Burj Khalifa',
        narrative: [
          'After breakfast, depart for a guided half-day tour across Old and Modern Dubai, visiting Dubai Creek, Jumeirah Mosque photo stop, and Dubai Mall.',
          'Ascend to the observation deck at Burj Khalifa for panoramic city views before returning to the hotel.',
        ],
        transfers: 'Private vehicle for city tour and Burj Khalifa visit',
        experience: 'Half-day guided Dubai tour and Burj Khalifa At The Top admission',
      },
      {
        title: 'Desert Safari & Arabian Evening',
        narrative: [
          'Morning at leisure to enjoy hotel facilities. In the afternoon, depart by 4x4 vehicle into the desert dunes for a sunset safari.',
          'Enjoy cultural performances and a traditional barbecue dinner at a desert camp before returning to the hotel.',
        ],
        transfers: '4x4 desert transfer from and to the hotel',
        experience: 'Desert dune drive and evening camp dinner experience',
      },
      {
        title: 'Dubai Marina & Palm Jumeirah',
        narrative: [
          'After breakfast, explore Palm Jumeirah and the Marina promenade. In the evening, board a traditional dhow cruise along Dubai Marina.',
        ],
        transfers: 'Private hotel transfers to Palm Jumeirah and Dubai Marina',
        experience: 'Evening Marina cruise with dinner',
      },
    ];
  }
  if (lower.includes('paris') || lower.includes('france')) {
    return [
      {
        title: 'Historic Paris & Eiffel Tower Quarter',
        narrative: [
          'After breakfast, meet your driver-guide for a curated tour of central Paris landmarks including Champs-Elysees, Arc de Triomphe, and the Eiffel Tower district.',
          'Enjoy a scenic Seine River cruise before returning to the hotel.',
        ],
        transfers: 'Private vehicle for half-day city tour',
        experience: 'Guided Paris city tour and Seine River cruise ticket',
      },
      {
        title: 'Louvre Museum & Montmartre',
        narrative: [
          'After breakfast, visit the Louvre Museum with timed-entry admission to view world-renowned masterpieces.',
          'Continue to the artistic hilltop neighbourhood of Montmartre and Sacre-Coeur Basilica.',
        ],
        transfers: 'Private transfer to the Louvre and Montmartre',
        experience: 'Louvre Museum timed-entry admission and guided walk',
      },
      {
        title: 'Palace of Versailles Excursion',
        narrative: [
          'After breakfast, travel to the Palace of Versailles to explore the Hall of Mirrors, Royal State Apartments, and landscaped gardens.',
        ],
        transfers: 'Private round-trip transfer to Versailles',
        experience: 'Palace and Gardens of Versailles admission',
      },
    ];
  }
  if (lower.includes('swiss') || lower.includes('switzerland') || lower.includes('alps') || lower.includes('zurich') || lower.includes('zermatt')) {
    return [
      {
        title: 'Alpine Panorama & Scenic Rail Journey',
        narrative: [
          'After breakfast, board the panoramic alpine train through mountain valleys, glaciers, and historic viaducts.',
          'Arrive at your alpine resort town with time to stroll the car-free village streets.',
        ],
        transfers: 'Station transfers and reserved panoramic rail seats',
        experience: 'Scenic Alpine Rail pass and mountain excursion',
      },
      {
        title: 'High Alpine Peak Excursion',
        narrative: [
          'After breakfast, ascend by cableway or cogwheel railway to the high alpine viewing platform for views of surrounding snow-capped peaks.',
          'Afternoon at leisure to enjoy local cafés or alpine walking trails.',
        ],
        transfers: 'Local resort transfers and mountain cableway',
        experience: 'Mountain peak excursion ticket',
      },
    ];
  }

  return [
    {
      title: `${destination} city & cultural highlights`,
      narrative: [
        `After breakfast, meet your driver and guide for a half-day discovery tour of ${destination}'s primary landmarks, historic quarters, and scenic viewpoints, subject to local traffic and operating conditions.`,
        'Return to the hotel with the remainder of the afternoon at leisure.',
      ],
      transfers: `Private hotel pick-up and drop-off for the ${destination} tour`,
      experience: `Half-day guided ${destination} highlights tour`,
    },
    {
      title: `Signature ${destination} landmarks & gardens`,
      narrative: [
        `After breakfast, proceed by private transfer to explore ${destination}'s celebrated cultural and natural attractions with pre-arranged admission.`,
        'Return to the hotel at a pre-arranged time.',
      ],
      transfers: 'Private round-trip sightseeing transfer',
      experience: `Featured ${destination} attraction admission`,
    },
    {
      title: `Full-day ${destination} excursion`,
      narrative: [
        `After breakfast, set out on a full-day excursion showcasing the premier leisure and scenic experiences of ${destination}. Explore at a comfortable pace before returning to the hotel in the evening.`,
      ],
      transfers: 'Private round-trip excursion transfer',
      experience: 'Full-day curated excursion admission',
      notes: 'Operating hours and access are subject to attraction schedules.',
    },
  ];
}

function generateOfflineFallback(
  contactInfo?: { name?: string; phone?: string; company?: string; email?: string },
  customParams?: TripParameters,
  rulesContext?: FormattedRulesContext
): ItineraryResult {
  const clientName = contactInfo?.name || customParams?.customerName || 'Guest';
  const destination = customParams?.destination || 'Curated Destination';
  const duration = Math.max(2, customParams?.durationDays || 5);
  const nights = Math.max(1, duration - 1);
  const adults = customParams?.headcountAdults ?? 2;
  const children = customParams?.headcountChildren ?? 0;
  const budgetVal = customParams?.targetBudget;
  const budget = budgetVal ? `₹${Number(budgetVal).toLocaleString('en-IN')}` : 'Package price: To be confirmed';
  const departureDate = customParams?.departureDate || new Date().toISOString().split('T')[0];
  const hotelTierRaw = customParams?.hotelTier || 'boutique_4star';
  const hotelTierLabel =
    hotelTierRaw === 'luxury_5star'
      ? `5-star luxury hotel in a central ${destination} location`
      : hotelTierRaw === 'boutique_4star'
      ? `4-star hotel in a central ${destination} location`
      : hotelTierRaw === 'chalet_villa'
      ? `Private chalet / villa in ${destination}`
      : hotelTierRaw === 'standard_3star'
      ? `3-star hotel in ${destination}`
      : hotelTierRaw;
  const specialReq = customParams?.specialRequests || 'Private airport transfers and curated sightseeing';

  const title = `Bespoke ${duration}-Day Journey to ${destination}`;
  const experiencesPool = getDestinationExperiences(destination);

  let daysMarkdown = '';
  const includedHighlights: string[] = [];

  for (let d = 1; d <= duration; d++) {
    if (d === 1) {
      daysMarkdown += `\n### Day 1: Arrive in ${destination}
Arrive at ${destination} Airport. Meet the transfer representative at the designated arrival point and proceed by private vehicle to the hotel.
After check-in, the remainder of the day is at leisure.
Overnight: ${destination}
Meals: None
Transfers: Private airport-to-hotel transfer
Notes: Hotel check-in is subject to the property's standard check-in time.\n`;
    } else if (d === duration) {
      daysMarkdown += `\n### Day ${d}: Departure from ${destination}
After breakfast, check out and meet the driver for a private transfer to ${destination} Airport for your onward flight.
Meals: Breakfast
Transfers: Private hotel-to-airport transfer
Notes: Departure transfer timing will be confirmed against the flight schedule.\n`;
    } else if (d === duration - 1 && duration >= 5) {
      daysMarkdown += `\n### Day ${d}: Leisure day in ${destination}
Enjoy breakfast at the hotel. The day is free for shopping, dining or independent sightseeing in ${destination}.
Optional experiences can be arranged on request, subject to availability and additional cost.
Overnight: ${destination}
Meals: Breakfast
Transfers: Not included\n`;
    } else {
      const expItem = experiencesPool[(d - 2) % experiencesPool.length];
      includedHighlights.push(expItem.experience);
      daysMarkdown += `\n### Day ${d}: ${expItem.title}
${expItem.narrative.join('\n')}
Overnight: ${destination}
Meals: Breakfast
Transfers: ${expItem.transfers}
Included experience: ${expItem.experience}${expItem.notes ? `\nNotes: ${expItem.notes}` : ''}\n`;
    }
  }

  const appliedRulesSection =
    rulesContext && rulesContext.rules.length > 0
      ? `\n\n> **Applied Agency Guidelines:**\n${rulesContext.rules.map((r) => `> - *${r.title}*: ${r.rulePrompt}`).join('\n')}\n`
      : '';

  const partyDesc =
    children > 0
      ? `${adults} adult${adults > 1 ? 's' : ''} and ${children} child${children > 1 ? 'ren' : ''} travelling together.`
      : `${adults} adult${adults > 1 ? 's' : ''} travelling together.`;

  const inclusionsLines = [
    `${nights} nights' accommodation in ${destination} in the stated room category.`,
    'Daily breakfast at the hotel.',
    `Private arrival and departure airport transfers in ${destination}.`,
    ...includedHighlights.map((h) => `${h} with transfers as specified in the daily itinerary.`),
    'Local assistance from the customer support team during the trip.',
  ];

  const exclusionsLines = [
    'International or domestic airfare and airline-related charges, unless specified.',
    `${destination} entry visa or other travel authorisations, if required.`,
    'Meals and beverages not listed under inclusions.',
    'Optional tours, activities and personal expenses.',
    'Early check-in, late check-out and room upgrades.',
    'Travel insurance.',
    'Tips, porterage and other discretionary payments.',
    'Any service not expressly listed under "Package Includes."',
  ];

  const itinerary = `# ${title}
**Prepared For:** ${clientName}  
**Destination:** ${destination}  
**Duration:** ${duration} Days / ${nights} Nights  
**Departure Date:** ${departureDate} (${duration} Days)  
**Party Size:** ${adults} Adults${children > 0 ? `, ${children} Children` : ''}  
**Estimated Investment:** ${budget}  
**Accommodation Category:** ${hotelTierLabel}  

---

## 1. Executive Summary
A ${duration}-day ${destination} holiday combining curated sightseeing, cultural highlights, private airport transfers and time for independent exploration.${appliedRulesSection}
- **Destination:** ${destination}
- **Duration:** ${duration} days / ${nights} nights
- **Hotel plan:** ${nights} nights in a Standard Double Room (${hotelTierLabel})
- **Meal plan:** Daily breakfast
- **Transfers:** Private airport transfers; sightseeing transfers as specified
- **Flights:** Not included in this quotation
- **Pace:** Moderate, with leisure time
> **Special Inclusions & Requests:** ${specialReq}

---

## 2. Guest Preferences
### Recorded requirements
1. ${partyDesc}
2. Interest in ${destination} sightseeing and curated local experiences (${specialReq}).
3. Preference for ${hotelTierLabel} and private airport transfers.
4. Daily breakfast requested.
5. Specific dietary, accessibility or celebration notes: ${specialReq}.

### To confirm before booking
- Preferred airline and baggage allowance
- Hotel room and bed preference
- Dietary or accessibility needs
- Attraction preferences
- Passport details and final travel dates

---

## 3. Day-by-Day Journey Itinerary
${daysMarkdown}

---

## 4. Curated Accommodations
- **Hotel category:** ${hotelTierLabel}
- **Stay:** ${departureDate} (${nights} nights)
- **Room:** Standard Double Room for ${adults} adults${children > 0 ? `, ${children} children` : ''}
- **Meal plan:** Breakfast daily
- **Hotel name:** To be confirmed at booking

---

## 5. Package Includes
${inclusionsLines.map((item, idx) => `${idx + 1}. ${item}`).join('\n')}

---

## 6. Package Excludes
${exclusionsLines.map((item, idx) => `${idx + 1}. ${item}`).join('\n')}`;

  return { title, destination, itinerary };
}


