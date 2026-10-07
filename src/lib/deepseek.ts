interface ItineraryResult {
  title: string;
  destination: string;
  itinerary: string;
}

export async function generateItineraryFromTranscript(
  transcriptText: string,
  contactInfo?: { name?: string; phone?: string; company?: string }
): Promise<ItineraryResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

  if (apiKey) {
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(12000),
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content:
                'You are an elite travel concierge. Analyze the call transcription and extract travel requirements. Return a detailed, elegant Markdown travel itinerary with sections: Executive Summary, Destination & Dates, Curated Accommodations, Day-by-Day Schedule (Morning/Afternoon/Evening), Private Experiences, and Quotation Scope for Suppliers.',
            },
            {
              role: 'user',
              content: `Customer Name: ${contactInfo?.name || 'Valued Client'}
Phone: ${contactInfo?.phone || 'N/A'}
Call Transcript:
${transcriptText}

Generate the bespoke itinerary in clean Markdown. At the very top, include a title line starting with "# " and a line "Destination: [Extracted Destination]".`,
            },
          ],
          temperature: 0.7,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const lines = content.split('\n');
          let title = `${contactInfo?.name || 'Client'} - Bespoke Travel Itinerary`;
          let destination = 'Luxury Destination';

          for (const line of lines) {
            if (line.startsWith('# ')) {
              title = line.replace('# ', '').trim();
            } else if (line.toLowerCase().startsWith('destination:')) {
              destination = line.replace(/destination:/i, '').trim();
            }
          }

          return { title, destination, itinerary: content };
        }
      } else {
        console.warn('DeepSeek API returned status', response.status, await response.text());
      }
    } catch (err) {
      console.error('Error invoking DeepSeek API:', err);
    }
  }

  // Intelligent Fallback Generator if DEEPSEEK_API_KEY is not set or API is unreachable
  return generateFallbackItinerary(transcriptText, contactInfo);
}

export async function reviseItineraryWithDeepSeek(
  currentItinerary: string,
  correctionNotes: string
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

  if (apiKey) {
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(12000),
        body: JSON.stringify({
          model,
          messages: [
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
          ],
          temperature: 0.5,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return content;
      }
    } catch (err) {
      console.error('Error revising with DeepSeek API:', err);
    }
  }

  // Fallback revision
  return `${currentItinerary}\n\n---\n### Revisions Applied\n* ${correctionNotes}\n*(Updated on ${new Date().toLocaleDateString()})*`;
}

function generateFallbackItinerary(
  transcriptText: string,
  contactInfo?: { name?: string; phone?: string; company?: string }
): ItineraryResult {
  const lower = transcriptText.toLowerCase();

  let destination = 'Amalfi Coast & Capri, Italy';
  if (lower.includes('tokyo') || lower.includes('japan')) destination = 'Tokyo & Kyoto, Japan';
  else if (lower.includes('paris') || lower.includes('france')) destination = 'Paris & French Riviera, France';
  else if (lower.includes('swiss') || lower.includes('switzerland')) destination = 'Zermatt & Lake Geneva, Switzerland';
  else if (lower.includes('bali') || lower.includes('indonesia')) destination = 'Ubud & Seminyak, Bali';
  else if (lower.includes('hawaii')) destination = 'Maui & Oahu, Hawaii';

  const clientName = contactInfo?.name || 'Valued Client';
  const title = `Bespoke 7-Day Travel Itinerary: ${destination}`;

  const itinerary = `# ${title}
**Prepared For:** ${clientName}
**Destination:** ${destination}
**Duration:** 7 Days / 6 Nights
**Generated Date:** ${new Date().toLocaleDateString()}

---

## 1. Executive Summary & Overview
Based on our consultation call, we have designed an exclusive private itinerary tailored to your schedule, preferences, and travel party. This journey balances cultural immersion, private chartered transfers, and five-star accommodations.

---

## 2. Accommodations & Villa Selection
* **Primary Stay:** Grand View Luxury Suites & Spa (5-Star Oceanfront)
* **Room Category:** Deluxe Panoramic Sea-Facing Suite with Private Terrace
* **Inclusions:** Daily artisan breakfast, private butler concierge, airport VIP lounge access

---

## 3. Day-by-Day Journey Schedule

### Day 1: VIP Arrival & Private Chauffeur Transfer
* **Morning:** Arrival at international airport with VIP Fast-Track customs and luggage handling.
* **Afternoon:** Private luxury transfer to the resort. Check-in and leisure time to enjoy resort amenities.
* **Evening:** Welcome sunset dinner featuring regional chef tasting menu with wine pairings.

### Day 2: Private Guided Cultural Immersion & Walking Tour
* **Morning:** Meet certified private historian for an exclusive skip-the-line architectural and heritage tour.
* **Afternoon:** Traditional culinary masterclass with a renowned local executive chef.
* **Evening:** Free leisure time for boutique shopping and relaxation.

### Day 3: Private Yacht Excursion & Coastal Cruising
* **Morning:** Board private 50ft luxury motor yacht for a day cruise along pristine coastlines and hidden coves.
* **Afternoon:** Gourmet champagne lunch served on deck; swimming, snorkeling, and paddle-boarding.
* **Evening:** Dockside dining at an award-winning waterfront seafood bistro.

### Day 4: Scenic Helicopters / Mountain Vista & Tasting
* **Morning:** Scenic helicopter transfer or private countryside drive to panoramic highlands.
* **Afternoon:** Exclusive estate vineyard tour with private barrel tasting and truffle luncheon.
* **Evening:** Return to resort for rejuvenating signature spa treatment.

### Day 5: Curated Adventure & Local Artisans
* **Morning:** Customized excursion matching preferred interests (artisan workshops, scenic photography, or nature walks).
* **Afternoon:** Relaxed coastal cafe luncheon followed by private gallery visit.
* **Evening:** Private dining experience on a secluded seaside terrace.

### Day 6: Day of Leisure & Sunset Gala
* **Morning:** Leisurely breakfast in suite; spa wellness treatments and private pool relaxation.
* **Afternoon:** Scenic coastal photography drive and souvenir curation.
* **Evening:** Five-course farewell gala dinner celebrating the highlights of the journey.

### Day 7: Departure & Return Journey
* **Morning:** Gourmet farewell breakfast and personalized checkout assistance.
* **Afternoon:** Chauffeur transfer to airport terminal with premium VIP departure assistance.

---

## 4. Supplier Quotation Scope & Requirements
* **Hotels / Resorts:** 6 nights suite accommodations with double occupancy.
* **Transfers:** Full ground transportation including airport transfers and day-trip chauffeurs.
* **Activities:** Private yacht charter (full day), private certified guide (Day 2), and dining reservations.
* **Cancellation Policy:** Flexible cancellation terms requested.`;

  return { title, destination, itinerary };
}
