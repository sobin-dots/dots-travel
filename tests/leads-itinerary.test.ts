import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../src/lib/db';
import { generateItineraryFromTranscript, reviseItineraryWithDeepSeek } from '../src/lib/deepseek';
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

  it('synthesizes structured travel itinerary from voice call transcription', async () => {
    const transcriptText = 'Hi there, I would like to book a 4-day romantic vacation in Switzerland for 2 people in December. We want scenic train rides, fondue dinner in Zurich, and luxury chalet accommodation near Zermatt with Matterhorn views. Our budget is around $6000.';
    const result = await generateItineraryFromTranscript(transcriptText, { name: 'Sarah Connor' });

    expect(result.destination).toBeDefined();
    expect(result.title).toBeDefined();
    expect(result.itinerary).toContain('Day 1');
    expect(result.itinerary.length).toBeGreaterThan(100);
  }, 35000);

  it('revises itinerary based on client correction notes', async () => {
    const initialItinerary = 'Day 1: Arrival in Zurich.\nDay 2: City tour.\nDay 3: Scenic train to Zermatt.\nDay 4: Departure.';
    const revision = await reviseItineraryWithDeepSeek(initialItinerary, 'Please upgrade Day 2 to private helicopter tour over the Swiss Alps.');

    expect(revision).toBeDefined();
    expect(revision.length).toBeGreaterThan(50);
  }, 20000);

  it('compiles valid Customer PDF binary without asset bundling errors', async () => {
    const pdfBytes = await generateItineraryPDF({
      title: 'Switzerland Alpine Romance (4 Days / 3 Nights)',
      recipientName: 'Sarah Connor',
      recipientEmail: 'sarah@resistance.test',
      itineraryText: 'DAY 1: ARRIVAL IN ZURICH\nPrivate transfer to luxury hotel.\n\nDAY 2: SCENIC GLACIER EXPRESS\nPanoramic rail journey to Zermatt.',
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
      itineraryText: 'DAY 1: ARRIVAL IN ZURICH\nChalet accommodation.\n\nDAY 2: SCENIC TRAIN\nZermatt transfer.',
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
});
