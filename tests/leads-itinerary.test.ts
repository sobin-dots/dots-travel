import { itineraryFixture } from './fixtures/itinerary';
import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../src/lib/db';
import {
  extractTripParametersFromTranscript,
  generateItineraryFromTranscript,
  reviseItineraryWithDeepSeek,
} from '../src/lib/deepseek';
import { generateItineraryPDF } from '../src/lib/pdf-generator';

describe('DeepSeek Concierge Itinerary & Leads Workflow', () => {
  let org: any;
  let contact: any;
  let call: any;
  let supplier: any;

  beforeAll(async () => {
    // Ensure test organization
    org = await db.organization.upsert({
      where: { slug: 'test-org' },
      update: {},
      create: {
        name: 'Test Org',
        slug: 'test-org',
      },
    });

    // Ensure test supplier
    const testTs = Date.now();
    supplier = await db.supplier.create({
      data: {
        organizationId: org.id,
        name: 'Alpine Vista Ski Chalets',
        category: 'hotels',
        email: `reservations-${testTs}@alpinevista.test`,
        phone: '+18005550999',
        contactPerson: 'Klaus Mueller',
        notes: '20% partner discount on winter bookings',
      },
    });

    // Ensure contact
    contact = await db.contact.create({
      data: {
        organizationId: org.id,
        name: 'Sarah Connor',
        phone: `+14155550${testTs.toString().slice(-3)}`,
        email: `sarah-${testTs}@resistance.test`,
        company: 'Cyberdyne Travel Club',
      },
    });

    // Ensure call with recording and transcription
    let phoneId: string;
    const num = await db.phoneNumber.findFirst({
      where: { organizationId: org.id },
    });
    if (num) {
      phoneId = num.id;
    } else {
      let acct = await db.plivoAccount.findFirst({
        where: { organizationId: org.id },
      });
      if (!acct) {
        acct = await db.plivoAccount.create({
          data: {
            organizationId: org.id,
            label: `Test Acct ${testTs}`,
            authIdEncrypted: 'enc_dummy',
            authIdLast4: testTs.toString().slice(-4),
            authTokenEncrypted: 'enc_dummy',
            encIv: 'iv_dummy',
            encAuthTag: 'tag_dummy',
            status: 'verified',
          },
        });
      }
      const createdNum = await db.phoneNumber.create({
        data: {
          organizationId: org.id,
          plivoAccountId: acct.id,
          e164: `+14155550${testTs.toString().slice(-3)}`,
          countryIso: 'US',
          friendlyName: 'Test Line',
        },
      });
      phoneId = createdNum.id;
    }

    call = await db.call.create({
      data: {
        organizationId: org.id,
        phoneNumberId: phoneId,
        plivoCallUuid: `test-call-${Date.now()}`,
        direction: 'inbound',
        from: '+14155550299',
        to: '+14155550100',
        status: 'completed',
        durationSeconds: 185,
        billDurationSeconds: 185,
        recordingEnabled: true,
        transcriptionEnabled: true,
      },
    });

    await db.recording.create({
      data: {
        organizationId: org.id,
        callId: call.id,
        plivoRecordingId: `rec-${Date.now()}`,
        recordingUrl: 'https://media.test/audio.mp3',
        durationSeconds: 185,
      },
    });

    await db.transcription.create({
      data: {
        organizationId: org.id,
        callId: call.id,
        status: 'completed',
        text: 'Hi there, I would like to book a 4-day romantic vacation in Switzerland for 2 people in December. We want scenic train rides, fondue dinner in Zurich, and luxury chalet accommodation near Zermatt with Matterhorn views. Our budget is around $6000.',
        language: 'en-US',
        wordCount: 45,
      },
    });
  });

  it('reports unavailable AI instead of returning an empty generated itinerary', async () => {
    await expect(generateItineraryFromTranscript('', undefined, undefined, { destination: 'Switzerland', durationDays: 4 })).rejects.toThrow('No itinerary AI provider');
  });

  it('reports failed revision instead of returning unchanged text as success', async () => {
    await expect(reviseItineraryWithDeepSeek(itineraryFixture(4, 'Switzerland'), 'Upgrade Day 2')).rejects.toThrow('No itinerary AI provider');
  });

  it('compiles valid Customer PDF binary without asset bundling errors', async () => {
    const pdfBytes = await generateItineraryPDF({
      title: 'Switzerland Alpine Romance (4 Days / 3 Nights)',
      recipientName: 'Sarah Connor',
      recipientEmail: 'sarah@resistance.test',
      itineraryText: itineraryFixture(4, 'Switzerland'),
      recipientType: 'customer',
      organizationName: 'Plivo Global Travel Concierge',
    });

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(1000);
    // PDF Magic Bytes %PDF-
    const header = String.fromCharCode(...pdfBytes.slice(0, 5));
    expect(header).toBe('%PDF-');
  });

  it('compiles valid Supplier RFQ PDF binary with quote request specifications', async () => {
    const pdfBytes = await generateItineraryPDF({
      title: 'Switzerland Alpine Romance (4 Days / 3 Nights)',
      recipientName: 'Alpine Vista Ski Chalets',
      recipientEmail: 'reservations@alpinevista.test',
      itineraryText: itineraryFixture(4, 'Switzerland'),
      recipientType: 'supplier',
      organizationName: 'Plivo Global Travel Concierge',
    });

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(1000);
    const header = String.fromCharCode(...pdfBytes.slice(0, 5));
    expect(header).toBe('%PDF-');
  });

  it('correctly parses markdown into structured visual itinerary sections', async () => {
    const { parseItinerary } = await import('../src/components/VisualItinerary');
    const md = `# Luxury Amalfi Coast Tour
Destination: Amalfi Coast & Capri, Italy
Duration: 5 Days / 4 Nights

## Executive Summary
A magnificent coastal escape along the cliffs of Southern Italy.

## Curated Accommodations
- Belmond Hotel Caruso, Ravello (Deluxe Sea View Suite)
- Capri Palace Jumeirah (Private Pool Suite)

## Day 1: Arrival & Private Helicopter Transfer
**Morning:** Private helicopter arrival from Naples to Ravello.
**Afternoon:** Leisurely stroll through Villa Rufolo gardens.
**Evening:** Candlelit seafood welcome dinner overlooking the cliffside.

## Day 2: Private Yacht Excursion to Capri
**Morning:** Board private 45ft Riva yacht for private Capri cruise.
**Afternoon:** Blue Grotto exploration and lunch at La Fontelina.
**Evening:** Sunset cocktails in Capri town square.

## Quotation Scope
Supplier quote requested for 2 guests, luxury accommodations with daily breakfast.`;

    const parsed = parseItinerary(md);
    expect(parsed.title).toBe('Luxury Amalfi Coast Tour');
    expect(parsed.destination).toBe('Amalfi Coast & Capri, Italy');
    expect(parsed.days.length).toBe(2);
    expect(parsed.days[0].dayNumber).toBe('Day 1');
    expect(parsed.days[0].morning).toContain('helicopter');
    expect(parsed.accommodations.length).toBe(2);
  });

  it('updates lead status seamlessly in database', async () => {
    const testLead = await db.lead.create({
      data: {
        organizationId: org.id,
        contactId: contact.id,
        callId: call.id,
        title: 'Status Transition Test Lead',
        destination: 'Greek Islands',
        status: 'pending_approval',
        itinerary: 'Day 1: Athens arrival.',
      },
    });

    expect(testLead.status).toBe('pending_approval');

    // Update status to contacted
    const updatedLead = await db.lead.update({
      where: { id: testLead.id },
      data: { status: 'contacted' },
    });
    expect(updatedLead.status).toBe('contacted');

    // Update status to converted
    const convertedLead = await db.lead.update({
      where: { id: testLead.id },
      data: { status: 'converted' },
    });
    expect(convertedLead.status).toBe('converted');
  });

  it('extracts and translates Tamil/Tanglish call transcript parameters into English with calculated returnDate', async () => {
    const tamilSingaporeTranscript =
      'சிங்கப்பூர் மட்டும் தான் பாக்குறேன். 28 டிசம்பர் 2026 கிளம்புறோம். நான், வைஃப்பும், அப்புறம் ரெண்டு கிட்ஸ் வாரங்க ஐயா. 4 ஸ்டார்னா பெட்டரா இருக்கும். 3 நைட்ஸ் 4 டேஸ் நாங்க பிளான் பண்டுரோம். பர்சனுக்கு அரோண்டு ஒரு 75 to 1 லாக் வைச்சிருக்கிறோம். தமிழ் டிரைவர் கொடுத்தீங்கன்னா நல்லா இருக்கும்.';

    const params = await extractTripParametersFromTranscript(tamilSingaporeTranscript, {
      name: 'Prince',
      email: 'prince@lgtholidays.com',
      referenceDate: '2026-10-31T17:09:00Z',
    });

    expect(params.destination).toContain('Singapore');
    expect(params.departureDate).toBe('2026-12-28');
    expect(params.durationDays).toBe(4);
    expect(params.returnDate).toBe('2026-12-31');
    expect(params.headcountAdults).toBe(2);
    expect(params.headcountChildren).toBe(2);
    expect(params.hotelTier).toBe('boutique_4star');
    expect(params.customerName).toBe('Prince');
  }, 30000);

  it('correctly extracts New Zealand trip parameters, budget in words, and spoken email address without hallucinating December from decisions', async () => {
    const userTranscript =
      "Hello? Hello. Hi, this is LJD Holidays. Yeah, it's LJD Holidays. We are planning for a trip to New Zealand. And we are planning for five flights. And our budget is one lakh. Can you share any itinerary or more places where we are, the famous places in New Zealand to visit? Sure, ma'am. We will share your email and details to send these details. Can I share here or any other forms I have to fill? I can share it through this call. What? Come again? You can share it through this call. Okay. And you have to note it like gokilakarnan2003 at gmail.com. And all the letters are not in uppercase, just a small case. Any other details you want? I want an itinerary for my plan. Then only I have to take decisions like how it affords my budget. Within two hours, the itinerary details will be shared via email. Okay. Thank you. Please come again.";

    const params = await extractTripParametersFromTranscript(userTranscript, {
      name: 'Suhitha',
      email: 'suhitha@3dots.co',
      phone: '+916381387260',
      referenceDate: '2026-11-10T18:00:00Z',
    });

    expect(params.destination).toBe('New Zealand');
    // Critical: The word "decisions" in "take decisions" must NOT hallucinate December!
    expect(params.departureDate).toBe('');
    expect(params.returnDate).toBe('');
    expect(params.durationDays).toBeUndefined();
    expect(params.targetBudget).toBe(100000);
    expect(params.customerEmail).toBe('gokilakarnan2003@gmail.com');
    expect(params.customerName).toBe('Suhitha');
    expect(params.specialRequests).toBeDefined();
    expect(params.specialRequests!).toContain('New Zealand');
    expect(params.specialRequests!.toLowerCase()).toContain('budget');
  }, 30000);
});
