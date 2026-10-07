interface ItineraryResult {
  title: string;
  destination: string;
  itinerary: string;
}

/**
 * Common LLM completion invoker returning parsed JSON.
 * Primary: OpenAI (gpt-4o-mini).
 * Fallback: DeepSeek (deepseek-chat / deepseek-v4-flash).
 */
async function callLlmJson<T>({
  messages,
  temperature = 0.7,
  timeoutMs = 35000,
}: {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  timeoutMs?: number;
}): Promise<T | null> {
  // 1. Primary: OpenAI API (gpt-4o-mini)
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          model,
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
        console.warn(`OpenAI (${model}) returned status`, response.status, await response.text());
      }
    } catch (err: any) {
      console.warn('OpenAI error or timeout, falling back to DeepSeek:', err?.message || err);
    }
  }

  // 2. Fallback: DeepSeek API
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (deepseekKey) {
    try {
      const baseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
      const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
      console.log('Using DeepSeek fallback for itinerary generation...');

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deepseekKey}`,
        },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          model,
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
        console.warn('DeepSeek fallback returned status', response.status, await response.text());
      }
    } catch (err: any) {
      console.warn('DeepSeek fallback error:', err?.message || err);
    }
  }

  return null;
}

/**
 * Common LLM completion invoker returning plain text / markdown.
 * Primary: OpenAI (gpt-4o-mini).
 * Fallback: DeepSeek.
 */
async function callLlmText({
  messages,
  temperature = 0.5,
  timeoutMs = 35000,
}: {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  timeoutMs?: number;
}): Promise<string | null> {
  // 1. Primary: OpenAI API
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          model,
          messages,
          temperature,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return content;
      }
    } catch (err: any) {
      console.warn('OpenAI text completion error, trying DeepSeek:', err?.message || err);
    }
  }

  // 2. Fallback: DeepSeek API
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (deepseekKey) {
    try {
      const baseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
      const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deepseekKey}`,
        },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          model,
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

  return null;
}

export async function generateItineraryFromTranscript(
  transcriptText: string,
  contactInfo?: { name?: string; phone?: string; company?: string }
): Promise<ItineraryResult> {
  const messages = [
    {
      role: 'system',
      content:
        'You are an elite bespoke travel concierge. Analyze the customer conversation transcript, determine the requested travel destination and preferences, and generate a comprehensive travel plan.\n\nReturn a strictly valid JSON object with the following keys:\n- "title": A compelling title for the itinerary (e.g. "Bespoke 5-Day Romantic Escape to Florence" or "Luxury Family Journey in Dubai")\n- "destination": The destination decided by you from the conversation (e.g. "Dubai, United Arab Emirates", "Tokyo, Japan", "Swiss Alps", "Kerala, India", etc.). If no specific location is mentioned, infer an inspiring luxury destination suitable for the customer.\n- "itinerary": The complete, elegant Markdown travel itinerary with sections: Executive Summary, Destination & Dates, Curated Accommodations, Day-by-Day Journey Schedule (Morning / Afternoon / Evening), Private Experiences & Inclusions, and Quotation Scope for Suppliers.',
    },
    {
      role: 'user',
      content: `Customer Name: ${contactInfo?.name || 'Valued Client'}
Phone: ${contactInfo?.phone || 'N/A'}
Call Transcript:
${transcriptText}

Synthesize the travel plan and return the JSON object with "title", "destination", and "itinerary".`,
    },
  ];

  const result = await callLlmJson<{ title?: string; destination?: string; itinerary?: string }>({
    messages,
    temperature: 0.7,
    timeoutMs: 35000,
  });

  if (result?.itinerary) {
    return {
      title: result.title || `${contactInfo?.name || 'Client'} - Bespoke Travel Itinerary`,
      destination: result.destination || 'Curated Destination',
      itinerary: result.itinerary,
    };
  }

  // Emergency offline fallback if both AI providers are unreachable
  return generateOfflineFallback(contactInfo);
}

export async function reviseItineraryWithDeepSeek(
  currentItinerary: string,
  correctionNotes: string
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

  const content = await callLlmText({ messages, temperature: 0.5, timeoutMs: 35000 });
  if (content) return content;

  // Fallback revision if offline
  return `${currentItinerary}\n\n---\n### Revisions Applied\n* ${correctionNotes}\n*(Updated on ${new Date().toLocaleDateString()})*`;
}

function generateOfflineFallback(
  contactInfo?: { name?: string; phone?: string; company?: string }
): ItineraryResult {
  const clientName = contactInfo?.name || 'Valued Client';
  const title = `Bespoke Travel Consultation Itinerary`;
  const destination = 'Curated Luxury Destination';

  const itinerary = `# ${title}
**Prepared For:** ${clientName}
**Destination:** ${destination}
**Generated Date:** ${new Date().toLocaleDateString()}

---

## 1. Executive Summary & Overview
Based on our consultation call, we are designing an exclusive private itinerary tailored to your schedule, preferences, and travel party.

---

## 2. Next Steps
Our travel specialist will reach out shortly to review accommodation options, excursion preferences, and supplier quotes.`;

  return { title, destination, itinerary };
}
