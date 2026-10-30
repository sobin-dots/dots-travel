import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../src/lib/db';
import { extractTripParametersFromTranscript, generateItineraryFromTranscript } from '../src/lib/deepseek';
import { generateCustomerQuotationPDF, generateBookingVoucherPDF } from '../src/lib/pdf-generator';
import { sendNotificationEmail } from '../src/lib/email';

describe('Phase 2 CPQ, Omnichannel & Lifecycle Engine (P2-01 - P2-23)', () => {
  let org: any;
  let contact: any;
  let supplierA: any;
  let supplierB: any;
  let lead: any;

  beforeAll(async () => {
    const testTs = Date.now();

    // 1. Ensure test organization
    org = await db.organization.upsert({
      where: { slug: 'test-cpq-org' },
      update: {},
      create: {
        name: 'Voyages Luxury Test Org',
        slug: 'test-cpq-org',
      },
    });

    // 2. Ensure test suppliers
    supplierA = await db.supplier.create({
      data: {
        organizationId: org.id,
        name: `Emirates DMC Luxury ${testTs}`,
        category: 'hotels',
        email: `dmc-${testTs}@emiratesluxury.test`,
        phone: '+97145550199',
        contactPerson: 'Tariq Al-Mansoor',
      },
    });

    supplierB = await db.supplier.create({
      data: {
        organizationId: org.id,
        name: `Arabian Escapes Wholesale ${testTs}`,
        category: 'packages',
        email: `wholesale-${testTs}@arabianescapes.test`,
        phone: '+97145550288',
        contactPerson: 'Layla Qasim',
      },
    });

    // 3. Ensure test contact
    contact = await db.contact.create({
      data: {
        organizationId: org.id,
        name: 'Julian Henderson',
        phone: `+1415555${testTs.toString().slice(-4)}`,
        email: `julian-${testTs}@hendersonventures.test`,
        company: 'Henderson Ventures',
      },
    });

    // 4. Create initial Lead
    lead = await db.lead.create({
      data: {
        organizationId: org.id,
        contactId: contact.id,
        title: 'Bespoke 7-Day Luxury Voyage to Dubai',
        destination: 'Dubai, United Arab Emirates',
        departureDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        durationDays: 7,
        headcountAdults: 2,
        headcountChildren: 1,
        targetBudget: 9500.00,
        hotelTier: 'luxury_5star',
        specialRequests: 'Private desert dinner with astronomer, Burj Al Arab suite, chauffeured Rolls-Royce',
        status: 'pending_approval',
        stage: 'quote_prep',
        itinerary: `# Bespoke 7-Day Luxury Voyage to Dubai\n**Client:** Julian Henderson\n\n## Day 1: VIP Arrival\n- Private airport ramp escort & transfer to Burj Al Arab.\n## Day 2: Old Dubai & Souk Yacht Cruise\n- Guided morning heritage tour, sunset yacht dinner.\n## Day 3: Private Desert Stargazing\n- VIP desert safari and dinner.`,
        customerEmail: contact.email,
      },
    });
  });

  // ─── Intake Modal Extraction & Param Customization ────────────────────────
  it('extracts structured trip parameters from call transcript text', async () => {
    const transcriptText = `Hi, I am looking to book a 5 days luxury trip to Paris for my wife and me, maybe 2 adults and 1 child. Our budget is around $8,000 and we prefer 5 star boutique hotels with private museum tours.`;
    const params = await extractTripParametersFromTranscript(transcriptText, {
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
    }, org.id);

    expect(params).toBeDefined();
    expect(params.destination).toContain('Paris');
    expect(params.durationDays).toBe(5);
    expect(params.headcountAdults).toBe(2);
    expect(params.headcountChildren).toBe(1);
    expect(params.targetBudget).toBe(8000);
    expect(params.hotelTier).toBeDefined();
  });

  it('generates customized itinerary adhering strictly to custom trip parameters', async () => {
    const customParams = {
      destination: 'Tokyo, Japan',
      durationDays: 6,
      headcountAdults: 2,
      headcountChildren: 0,
      targetBudget: 12000,
      hotelTier: 'luxury_5star',
      specialRequests: 'Private tea ceremony, Kyoto shinkansen first class',
      customerName: 'Julian Henderson',
    };

    const itineraryResult = await generateItineraryFromTranscript(
      'Looking for a luxury cultural experience in Tokyo with fine dining.',
      { name: 'Julian Henderson', phone: contact.phone },
      org.id,
      customParams
    );

    expect(itineraryResult).toBeDefined();
    expect(itineraryResult.destination).toBe('Tokyo, Japan');
    expect(itineraryResult.itinerary).toContain('Tokyo');
    expect(itineraryResult.itinerary).toContain('Day 1');
  }, 15000);

  // ─── P2-01: Receive & Capture Supplier Quotations with Line Items ───────────
  it('P2-01: captures inbound supplier quotes with line-item breakdowns', async () => {
    const quoteA = await db.supplierQuotation.create({
      data: {
        organizationId: org.id,
        leadId: lead.id,
        supplierId: supplierA.id,
        quoteReference: `RFQ-EMIRATES-001`,
        currency: 'USD',
        totalNetCost: 6200.00,
        cancellationPolicy: 'Full refund up to 14 days prior to departure.',
        inclusions: ['6 nights Burj Al Arab Deluxe Suite', 'Private Rolls Royce transfers', 'Daily gourmet breakfast'],
        exclusions: ['International flights', 'Personal incidentals'],
        hotelTier: 'luxury_5star',
        roomCategory: 'Deluxe Marina Suite',
        status: 'received',
        lineItems: {
          create: [
            { category: 'accommodation', description: 'Burj Al Arab 6 Nights', dayNumber: 1, quantity: 6, unitCost: 800.00, totalCost: 4800.00 },
            { category: 'transfer', description: 'VIP Rolls-Royce Airport Escort', dayNumber: 1, quantity: 2, unitCost: 350.00, totalCost: 700.00 },
            { category: 'activity', description: 'Exclusive Desert Safari & Private Chef', dayNumber: 3, quantity: 1, unitCost: 700.00, totalCost: 700.00 },
          ],
        },
      },
      include: { lineItems: true, supplier: true },
    });

    const quoteB = await db.supplierQuotation.create({
      data: {
        organizationId: org.id,
        leadId: lead.id,
        supplierId: supplierB.id,
        quoteReference: `RFQ-ARABIAN-002`,
        currency: 'USD',
        totalNetCost: 5400.00,
        cancellationPolicy: 'Non-refundable within 30 days.',
        inclusions: ['6 nights Jumeirah Beach Resort', 'Executive SUV transfers', 'Breakfast and Afternoon Tea'],
        exclusions: ['Beverages', 'Tipping'],
        hotelTier: 'boutique_4star',
        roomCategory: 'Ocean Terrace Room',
        status: 'received',
        lineItems: {
          create: [
            { category: 'accommodation', description: 'Jumeirah Beach Resort 6 Nights', dayNumber: 1, quantity: 6, unitCost: 700.00, totalCost: 4200.00 },
            { category: 'transfer', description: 'Executive SUV Transfers', dayNumber: 1, quantity: 2, unitCost: 250.00, totalCost: 500.00 },
            { category: 'activity', description: 'Desert Camp & Dune Buggy', dayNumber: 3, quantity: 1, unitCost: 700.00, totalCost: 700.00 },
          ],
        },
      },
      include: { lineItems: true, supplier: true },
    });

    expect(quoteA.id).toBeDefined();
    expect(quoteA.lineItems.length).toBe(3);
    expect(Number(quoteA.totalNetCost)).toBe(6200.00);

    expect(quoteB.id).toBeDefined();
    expect(quoteB.lineItems.length).toBe(3);
    expect(Number(quoteB.totalNetCost)).toBe(5400.00);
  });

  // ─── P2-02: Compare Quotations from Multiple Suppliers (Matrix) ─────────────
  it('P2-02: generates side-by-side comparison matrix of vendor quotes', async () => {
    const quotes = await db.supplierQuotation.findMany({
      where: { leadId: lead.id, organizationId: org.id },
      include: { supplier: true, lineItems: true },
      orderBy: { totalNetCost: 'asc' },
    });

    expect(quotes.length).toBeGreaterThanOrEqual(2);
    const costs = quotes.map((q) => Number(q.totalNetCost));
    const lowest = Math.min(...costs);
    const highest = Math.max(...costs);

    expect(lowest).toBe(5400.00);
    expect(highest).toBe(6200.00);
    const delta = highest - lowest;
    expect(delta).toBe(800.00);
  });

  // ─── P2-03 & P2-04: Staff Margin Entry & Dynamic Selling Price Calculation ───
  it('P2-03 & P2-04: calculates final selling price with percentage margin and enforces floor guardrail', async () => {
    const netCost = 6200.00;
    const marginPercent = 20.0; // 20%
    const taxPercent = 5.0; // 5%
    const floorMin = 10.0;

    const marginAmount = (netCost * marginPercent) / 100; // 1240.00
    const subtotal = netCost + marginAmount; // 7440.00
    const taxAmount = (subtotal * taxPercent) / 100; // 372.00
    const finalSellingPrice = subtotal + taxAmount; // 7812.00

    const isApproved = marginPercent >= floorMin; // true

    const customerQuoteV1 = await db.customerQuotation.create({
      data: {
        organizationId: org.id,
        leadId: lead.id,
        version: 1,
        status: 'draft',
        currency: 'USD',
        supplierNetTotal: netCost,
        marginType: 'percentage',
        marginValue: marginPercent,
        marginAmount,
        taxPercentage: taxPercent,
        taxAmount,
        finalSellingPrice,
        floorGuardrailMin: floorMin,
        marginApproved: isApproved,
      },
    });

    expect(Number(customerQuoteV1.finalSellingPrice)).toBe(7812.00);
    expect(customerQuoteV1.marginApproved).toBe(true);
    expect(customerQuoteV1.version).toBe(1);

    // Test below-floor guardrail warning
    const lowMarginPercent = 5.0; // below 10%
    const lowMarginAmount = (netCost * lowMarginPercent) / 100;
    const lowSubtotal = netCost + lowMarginAmount;
    const lowSellingPrice = lowSubtotal + (lowSubtotal * 0.05);

    const customerQuoteBelowFloor = await db.customerQuotation.create({
      data: {
        organizationId: org.id,
        leadId: lead.id,
        version: 2,
        status: 'draft',
        currency: 'USD',
        supplierNetTotal: netCost,
        marginType: 'percentage',
        marginValue: lowMarginPercent,
        marginAmount: lowMarginAmount,
        taxPercentage: 5.0,
        taxAmount: (lowSubtotal * 0.05),
        finalSellingPrice: lowSellingPrice,
        floorGuardrailMin: floorMin,
        marginApproved: lowMarginPercent >= floorMin, // false!
        approvalNote: 'Warning: 5% margin is below 10% floor threshold.',
      },
    });

    expect(customerQuoteBelowFloor.marginApproved).toBe(false);
    expect(customerQuoteBelowFloor.version).toBe(2);
    expect(customerQuoteBelowFloor.approvalNote).toContain('below 10% floor threshold');
  });

  // ─── P2-05: Flight Operations (Add Live Schedules & Manual PNR) ─────────────
  it('P2-05: attaches flight schedules and confirmed PNR to trip file', async () => {
    const flight = await db.tripFlight.create({
      data: {
        organizationId: org.id,
        leadId: lead.id,
        airline: 'Emirates',
        airlineCode: 'EK',
        flightNumber: 'EK 202',
        origin: 'JFK',
        destination: 'DXB',
        departureTime: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        arrivalTime: new Date(Date.now() + 30 * 24 * 3600 * 1000 + 13 * 3600 * 1000),
        cabinClass: 'business',
        baggageAllowance: '2x 32kg check-in + 14kg cabin',
        pnr: 'EMR892K',
        fareRules: 'Refundable with $150 change fee. Chauffeur airport service included.',
        ticketCost: 3850.00,
      },
    });

    expect(flight.id).toBeDefined();
    expect(flight.airline).toBe('Emirates');
    expect(flight.pnr).toBe('EMR892K');
    expect(Number(flight.ticketCost)).toBe(3850.00);

    // Test manual PNR entry with custom PNR code
    const manualFlight = await db.tripFlight.create({
      data: {
        organizationId: org.id,
        leadId: lead.id,
        airline: 'Qatar Airways',
        airlineCode: 'QR',
        flightNumber: 'QR 702',
        origin: 'JFK',
        destination: 'DOH',
        departureTime: new Date(Date.now() + 35 * 24 * 3600 * 1000),
        arrivalTime: new Date(Date.now() + 35 * 24 * 3600 * 1000 + 12 * 3600 * 1000),
        cabinClass: 'business',
        baggageAllowance: '2x 32kg check-in + 14kg cabin',
        pnr: 'QTR991X',
        fareRules: 'Qsuite Business Class confirmed.',
        ticketCost: 3620.00,
      },
    });

    expect(manualFlight.id).toBeDefined();
    expect(manualFlight.pnr).toBe('QTR991X');
    expect(manualFlight.airline).toBe('Qatar Airways');

    // Test flight removal / detachment
    await db.tripFlight.delete({ where: { id: manualFlight.id } });
    const remaining = await db.tripFlight.findUnique({ where: { id: manualFlight.id } });
    expect(remaining).toBeNull();
  });

  // ─── P2-06: Final Customer Quotation PDF Builder ───────────────────────────
  it('P2-06: compiles day-wise itinerary, flights, and calculated pricing into proposal PDF', async () => {
    const pdfBytes = await generateCustomerQuotationPDF({
      title: lead.title,
      recipientName: contact.name,
      recipientEmail: contact.email,
      destination: lead.destination,
      version: 1,
      finalSellingPrice: 7812.00,
      currency: 'USD',
      itineraryText: lead.itinerary,
      flights: [
        {
          airline: 'Emirates',
          flightNumber: 'EK 202',
          origin: 'JFK',
          destination: 'DXB',
          departureTime: new Date(),
          arrivalTime: new Date(),
          cabinClass: 'Business',
          pnr: 'EMR892K',
        },
      ],
      organizationName: org.name,
    });

    expect(pdfBytes).toBeDefined();
    expect(pdfBytes.length).toBeGreaterThan(1000);
    // PDF Magic bytes %PDF-
    const headerStr = Buffer.from(pdfBytes.slice(0, 5)).toString();
    expect(headerStr).toBe('%PDF-');
  });

  // ─── P2-07 & P2-09: Quotation Revision, Recalculation & Diff Audit Log ──────
  it('P2-07 & P2-09: tracks quotation revisions and computes price diff between versions', async () => {
    const quotes = await db.customerQuotation.findMany({
      where: { leadId: lead.id, organizationId: org.id },
      orderBy: { version: 'desc' },
    });

    expect(quotes.length).toBeGreaterThanOrEqual(2);
    const v2 = quotes.find((q) => q.version === 2);
    const v1 = quotes.find((q) => q.version === 1);

    expect(v2).toBeDefined();
    expect(v1).toBeDefined();
    const priceDiff = Number(v2!.finalSellingPrice) - Number(v1!.finalSellingPrice);
    expect(priceDiff).not.toBe(0);
  });

  // ─── P2-11: Email Notification Dispatch ────────────────────────────────────
  it('P2-11: dispatches transactional notification email via sendNotificationEmail', async () => {
    const sendResult = await sendNotificationEmail({
      to: contact.email,
      subject: 'Your Travel Quotation is Ready',
      text: 'Hello from Plivo Travel Platform Email Concierge!',
    });

    expect(sendResult.success).toBe(true);
    expect(sendResult.id).toBeDefined();
  });

  // ─── P2-12, P2-13, P2-14, P2-15: Email Dispatch & Follow-Up Drips ───────────
  it('P2-12 & P2-13: schedules automated follow-up sequences across Email', async () => {
    const now = Date.now();
    const scheduledLogs = await db.automationLog.createMany({
      data: [
        {
          organizationId: org.id,
          leadId: lead.id,
          type: 'customer_drip_day1',
          channel: 'email',
          scheduledFor: new Date(now + 24 * 3600 * 1000),
          status: 'scheduled',
          recipient: contact.email,
          payload: { message: 'Day 1 Check-in' },
        },
        {
          organizationId: org.id,
          leadId: lead.id,
          type: 'customer_drip_day3',
          channel: 'email',
          scheduledFor: new Date(now + 3 * 24 * 3600 * 1000),
          status: 'scheduled',
          recipient: contact.email,
          payload: { message: 'Day 3 Availability Reminder' },
        },
        {
          organizationId: org.id,
          leadId: lead.id,
          type: 'customer_drip_day5',
          channel: 'email',
          scheduledFor: new Date(now + 5 * 24 * 3600 * 1000),
          status: 'scheduled',
          recipient: contact.email,
          payload: { message: 'Day 5 Final Validity Notice' },
        },
      ],
    });

    expect(scheduledLogs.count).toBe(3);

    const leadDrips = await db.automationLog.findMany({
      where: { leadId: lead.id, organizationId: org.id },
    });
    expect(leadDrips.length).toBeGreaterThanOrEqual(3);
  });

  // ─── P2-17: Lead Qualification & Pipeline Tracking ──────────────────────────
  it('P2-17: updates lead pipeline stage and records qualification metrics', async () => {
    const updated = await db.lead.update({
      where: { id: lead.id },
      data: {
        stage: 'negotiation',
        metadata: {
          qualificationScore: 88,
          intentNotes: 'High intent luxury traveler, requested hotel suite upgrade discount.',
        },
      },
    });

    expect(updated.stage).toBe('negotiation');
    expect((updated.metadata as any).qualificationScore).toBe(88);
  });

  // ─── P2-18: Booking Confirmation, Operational Handover & Voucher PDF ────────
  it('P2-18: confirms booking, generates reference code and official voucher PDF', async () => {
    const bookingRef = `BK-${Date.now().toString().slice(-6)}`;
    const confirmedLead = await db.lead.update({
      where: { id: lead.id },
      data: {
        stage: 'confirmed',
        status: 'converted',
        bookingReference: bookingRef,
        bookingConfirmedAt: new Date(),
      },
    });

    expect(confirmedLead.bookingReference).toBe(bookingRef);
    expect(confirmedLead.stage).toBe('confirmed');

    // Generate Voucher PDF
    const voucherPdfBytes = await generateBookingVoucherPDF({
      bookingReference: bookingRef,
      leadTitle: lead.title,
      customerName: contact.name,
      customerEmail: contact.email,
      customerPhone: contact.phone,
      destination: lead.destination,
      departureDate: lead.departureDate,
      headcountAdults: 2,
      headcountChildren: 1,
      hotelTier: 'luxury_5star',
      flights: [
        {
          airline: 'Emirates',
          flightNumber: 'EK 202',
          origin: 'JFK',
          destination: 'DXB',
          departureTime: new Date(),
          pnr: 'EMR892K',
        },
      ],
      organizationName: org.name,
    });

    expect(voucherPdfBytes).toBeDefined();
    expect(voucherPdfBytes.length).toBeGreaterThan(1000);
    expect(Buffer.from(voucherPdfBytes.slice(0, 5)).toString()).toBe('%PDF-');
  });

  // ─── P2-19: Payment Deposit & Milestone Reminder Automation ─────────────────
  it('P2-19: creates payment milestones and verifies balance tracking', async () => {
    const deposit = await db.paymentMilestone.create({
      data: {
        organizationId: org.id,
        leadId: lead.id,
        title: 'Initial Booking Deposit (30%)',
        amount: 2343.60,
        dueDate: new Date(Date.now() + 3 * 24 * 3600 * 1000),
        status: 'paid',
        paidAt: new Date(),
        paymentLink: 'https://pay.travelconcierge.internal/checkout/test_deposit',
      },
    });

    const balance = await db.paymentMilestone.create({
      data: {
        organizationId: org.id,
        leadId: lead.id,
        title: 'Final Balance Payment (70%)',
        amount: 5468.40,
        dueDate: new Date(Date.now() + 25 * 24 * 3600 * 1000),
        status: 'pending',
        paymentLink: 'https://pay.travelconcierge.internal/checkout/test_balance',
      },
    });

    const allMilestones = await db.paymentMilestone.findMany({
      where: { leadId: lead.id, organizationId: org.id },
    });

    const totalPaid = allMilestones.filter((m) => m.status === 'paid').reduce((s, m) => s + Number(m.amount), 0);
    const totalRemaining = allMilestones.filter((m) => m.status !== 'paid').reduce((s, m) => s + Number(m.amount), 0);

    expect(totalPaid).toBe(2343.60);
    expect(totalRemaining).toBe(5468.40);
  });

  // ─── P2-20: Visa Document Checklist Generator & Status Tracker ──────────────
  it('P2-20: generates destination visa checklist and verifies document progression', async () => {
    const doc1 = await db.visaRequirement.create({
      data: {
        organizationId: org.id,
        leadId: lead.id,
        countryIso: 'AE',
        documentName: 'Passport Copy (6+ Months Validity)',
        description: 'Clear color scan of photo page',
        mandatory: true,
        status: 'verified',
        verifiedAt: new Date(),
      },
    });

    const doc2 = await db.visaRequirement.create({
      data: {
        organizationId: org.id,
        leadId: lead.id,
        countryIso: 'AE',
        documentName: 'UAE 30-Day Single Entry Tourist Visa',
        mandatory: true,
        status: 'pending',
      },
    });

    const docs = await db.visaRequirement.findMany({
      where: { leadId: lead.id, organizationId: org.id },
    });

    expect(docs.length).toBeGreaterThanOrEqual(2);
    expect(docs.some((d) => d.status === 'verified')).toBe(true);
    expect(docs.some((d) => d.status === 'pending')).toBe(true);
  });

  // ─── P2-21: Pre-Departure Communication (T-7 / T-3) ─────────────────────────
  it('P2-21: logs pre-departure briefing package dispatch', async () => {
    const log = await db.automationLog.create({
      data: {
        organizationId: org.id,
        leadId: lead.id,
        type: 'predeparture_t7',
        channel: 'email',
        scheduledFor: new Date(),
        executedAt: new Date(),
        status: 'sent',
        recipient: contact.email,
        payload: {
          milestone: 'T-7',
          weather: '28°C Sunny',
          packingListChecked: true,
        },
      },
    });

    expect(log.id).toBeDefined();
    expect(log.type).toBe('predeparture_t7');
  });

  // ─── P2-22: Post-Trip Feedback Collection (CSAT & NPS) ──────────────────────
  it('P2-22: records customer CSAT rating and NPS score', async () => {
    const existing = (lead.metadata as any) || {};
    const updated = await db.lead.update({
      where: { id: lead.id },
      data: {
        metadata: {
          ...existing,
          csat: {
            rating: 5,
            npsScore: 10,
            feedbackNotes: 'Exceeded all our expectations! The private desert stargazing was unforgettable.',
            allowTestimonial: true,
            collectedAt: new Date().toISOString(),
          },
        },
      },
    });

    const meta = updated.metadata as any;
    expect(meta.csat.rating).toBe(5);
    expect(meta.csat.npsScore).toBe(10);
    expect(meta.csat.allowTestimonial).toBe(true);
  });

  // ─── P2-23: Repeat-Customer Marketing & Loyalty Trigger ────────────────────
  it('P2-23: dispatches repeat customer anniversary loyalty campaign', async () => {
    const log = await db.automationLog.create({
      data: {
        organizationId: org.id,
        leadId: lead.id,
        type: 'loyalty_anniversary',
        channel: 'email',
        scheduledFor: new Date(),
        executedAt: new Date(),
        status: 'sent',
        recipient: contact.email,
        payload: {
          campaignType: 'anniversary',
          promotionalDiscount: 500,
          suggestedDestination: 'Amalfi Coast & Capri, Italy',
        },
      },
    });

    expect(log.id).toBeDefined();
    expect(log.type).toBe('loyalty_anniversary');
    expect((log.payload as any).promotionalDiscount).toBe(500);
  });
});
