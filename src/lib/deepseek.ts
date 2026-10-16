import { getTenantIntegration } from './integrations/credentials-manager';

export interface ItineraryResult {
  title: string;
  destination: string;
  itinerary: string;
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
    if (text.includes('paris') || text.includes('france')) destination = 'Paris, France';
    else if (text.includes('tokyo') || text.includes('japan')) destination = 'Tokyo, Japan';
    else if (text.includes('swiss') || text.includes('alps') || text.includes('switzerland')) destination = 'Swiss Alps, Switzerland';
    else if (text.includes('bali') || text.includes('indonesia')) destination = 'Bali, Indonesia';
    else if (text.includes('rome') || text.includes('italy') || text.includes('amalfi')) destination = 'Rome & Amalfi Coast, Italy';
    else if (text.includes('london') || text.includes('uk') || text.includes('england')) destination = 'London, United Kingdom';
    else if (text.includes('maldives')) destination = 'Maldives Private Atolls';
    else if (text.includes('new york') || text.includes('nyc')) destination = 'New York City, USA';

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

    // Budget heuristic
    let targetBudget = 5000;
    const budgetMatch = text.match(/\$?(\d{1,3}(?:,\d{3})+|\d+)\s*(?:dollars?|usd|budget|\$)/i) ||
                        text.match(/(?:budget|around|under|maximum)\s*(?:of\s*)?\$?(\d+)(?:k)?/i);
    if (budgetMatch) {
      let bStr = budgetMatch[1].replace(/,/g, '');
      let bVal = parseInt(bStr, 10);
      if (budgetMatch[0].toLowerCase().includes('k') && bVal < 1000) bVal *= 1000;
      if (bVal >= 500 && bVal <= 500000) targetBudget = bVal;
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
      customerName: contactInfo?.name || 'Valued Client',
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
- "targetBudget": Approximate total budget in USD as a number (default 5000)
- "hotelTier": One of ["luxury_5star", "boutique_4star", "chalet_villa", "standard_3star"]
- "specialRequests": Any special requests, inclusions, or dietary preferences mentioned`,
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
        targetBudget: result.targetBudget ? Number(result.targetBudget) : 5000,
        hotelTier: result.hotelTier || 'luxury_5star',
        specialRequests: result.specialRequests || 'Private airport transfer, city excursions',
        customerName: contactInfo?.name || 'Valued Client',
        customerEmail: contactInfo?.email || '',
        customerPhone: contactInfo?.phone || '',
      };
    }
  } catch (err: any) {
    console.warn('Parameter extraction LLM failed, using heuristic extraction:', err?.message || err);
  }

  return fallbackExtract();
}

export async function generateItineraryFromTranscript(
  transcriptText: string,
  contactInfo?: { name?: string; phone?: string; company?: string; email?: string },
  organizationId?: string,
  customParams?: TripParameters
): Promise<ItineraryResult> {
  const destination = customParams?.destination || 'Curated Destination';
  const duration = customParams?.durationDays || 5;
  const adults = customParams?.headcountAdults ?? 2;
  const children = customParams?.headcountChildren ?? 0;
  const budget = customParams?.targetBudget ? `$${customParams.targetBudget.toLocaleString()}` : '$5,000';
  const hotelTier = customParams?.hotelTier || 'luxury_5star';
  const departureDate = customParams?.departureDate || new Date().toISOString().split('T')[0];
  const specialRequests = customParams?.specialRequests || 'None specified';

  const messages = [
    {
      role: 'system',
      content:
        'You are an elite bespoke travel concierge. Analyze the customer conversation transcript and the confirmed travel parameters, and generate a comprehensive travel plan.\n\nReturn a strictly valid JSON object with the following keys:\n- "title": A compelling title for the itinerary (e.g. "Bespoke 5-Day Luxury Escape to Florence" or "Elite Dubai Family Voyage")\n- "destination": The target destination (e.g. "Dubai, United Arab Emirates")\n- "itinerary": The complete, elegant Markdown travel itinerary with sections: Executive Summary, Destination & Dates, Curated Accommodations, Day-by-Day Journey Schedule (Morning / Afternoon / Evening), Private Experiences & Inclusions, and Quotation Scope for Suppliers.',
    },
    {
      role: 'user',
      content: `Customer Name: ${contactInfo?.name || customParams?.customerName || 'Valued Client'}
Phone: ${contactInfo?.phone || customParams?.customerPhone || 'N/A'}
Email: ${contactInfo?.email || customParams?.customerEmail || 'N/A'}

Confirmed Trip Parameters:
- Target Destination: ${destination}
- Duration: ${duration} Days
- Departure Date: ${departureDate}
- Party Size: ${adults} Adults, ${children} Children
- Target Budget: ${budget}
- Preferred Hotel Tier: ${hotelTier}
- Special Requests & Inclusions: ${specialRequests}

Verbatim Call Transcript:
${transcriptText}

Synthesize the travel plan adhering strictly to the confirmed parameters and return the JSON object with "title", "destination", and "itinerary".`,
    },
  ];

  const result = await callLlmJson<{ title?: string; destination?: string; itinerary?: string }>({
    messages,
    temperature: 0.7,
    timeoutMs: 35000,
    organizationId,
  });

  if (result?.itinerary) {
    return {
      title: result.title || `${contactInfo?.name || 'Client'} - Bespoke ${duration}-Day ${destination} Itinerary`,
      destination: result.destination || destination,
      itinerary: result.itinerary,
    };
  }

  // Emergency offline fallback if no AI providers are configured or reachable
  return generateOfflineFallback(contactInfo, customParams);
}

export async function reviseItineraryWithDeepSeek(
  currentItinerary: string,
  correctionNotes: string,
  organizationId?: string
): Promise<string> {
  const messages = [
    {
      role: 'system',
      content:
        'You are an expert travel concierge. Revise the provided travel itinerary according to the user corrections and requested adjustments. Preserve formatting and output the revised Markdown itinerary.',
    },
    {
      role: 'user',
      content: `Current Itinerary:
${currentItinerary}

Requested Corrections & Changes:
${correctionNotes}

Provide the complete updated and polished itinerary.`,
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

function generateOfflineFallback(
  contactInfo?: { name?: string; phone?: string; company?: string; email?: string },
  customParams?: TripParameters
): ItineraryResult {
  const clientName = contactInfo?.name || customParams?.customerName || 'Valued Client';
  const destination = customParams?.destination || 'Curated Luxury Destination';
  const duration = customParams?.durationDays || 5;
  const adults = customParams?.headcountAdults ?? 2;
  const children = customParams?.headcountChildren ?? 0;
  const budget = customParams?.targetBudget ? `$${customParams.targetBudget.toLocaleString()}` : '$5,000';
  const departureDate = customParams?.departureDate || new Date().toISOString().split('T')[0];
  const hotelTier = customParams?.hotelTier ? customParams.hotelTier.replace('_', ' ').toUpperCase() : '5-STAR LUXURY';
  const specialReq = customParams?.specialRequests || 'Private executive transfers, curated excursions';

  const title = `Bespoke ${duration}-Day Journey to ${destination}`;

  let daysMarkdown = '';
  for (let d = 1; d <= duration; d++) {
    if (d === 1) {
      daysMarkdown += `\n### Day 1: Arrival & Welcome in ${destination}\n- **Morning/Afternoon:** Private airport meet & greet with luxury chauffeur transfer.\n- **Evening:** Check-in to ${hotelTier} accommodation and exclusive welcome dinner.\n`;
    } else if (d === duration) {
      daysMarkdown += `\n### Day ${d}: Leisure & Seamless Departure\n- **Morning:** Gourmet breakfast followed by private artisan shopping or spa relaxation.\n- **Afternoon:** Executive airport transfer and VIP lounge access for return journey.\n`;
    } else {
      daysMarkdown += `\n### Day ${d}: Signature Curated Experiences\n- **Morning:** Private guided excursion tailored to local culture, landscapes, and heritage.\n- **Afternoon:** Leisure time with reservations at distinguished culinary establishments.\n- **Evening:** Sunset private tour and evening relaxation.\n`;
    }
  }

  const itinerary = `# ${title}
**Prepared For:** ${clientName}  
**Destination:** ${destination}  
**Departure Date:** ${departureDate} (${duration} Days)  
**Party Size:** ${adults} Adults${children > 0 ? `, ${children} Children` : ''}  
**Estimated Investment:** ${budget} (Target Budget)  
**Accommodation Category:** ${hotelTier}  

---

## 1. Executive Summary
Designed exclusively for ${clientName}, this bespoke ${duration}-day journey combines private VIP transfers, prestigious ${hotelTier} accommodations, and hand-selected regional experiences.

> **Special Inclusions & Requests:** ${specialReq}

---

## 2. Day-by-Day Journey Itinerary
${daysMarkdown}

---

## 3. Curated Accommodations & Inclusions
* **Hotel Tier:** ${hotelTier} with daily gourmet breakfast
* **Ground Operations:** Private chauffeur transfers in executive vehicles
* **Concierge Support:** Dedicated 24/7 on-ground travel manager
* **Inclusions:** All sightseeing entry admissions, private boat/guide charters, and pre-booked fine dining

---

## 4. Next Steps
Our travel specialist will finalize supplier quotations, lock in live flight options, and deliver your comprehensive customer proposal voucher.`;

  return { title, destination, itinerary };
}

