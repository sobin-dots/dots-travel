import { describe, it, expect } from 'vitest';
import {
  hexToRgb,
  parseItineraryContent,
  resolveCustomerNameForPdf,
  generateItineraryPDF,
  generateCustomerQuotationPDF,
  generateBookingVoucherPDF,
  wrapText,
} from '@/lib/pdf-generator';
import { StandardFonts, PDFDocument } from 'pdf-lib';

describe('Executive Itinerary PDF & Brand Color Generator', () => {
  it('converts hex colors to normalized RGB values accurately', () => {
    // Crimson Red (#ed1b24)
    const red = hexToRgb('#ed1b24');
    expect(red.r).toBeCloseTo(0.929, 2);
    expect(red.g).toBeCloseTo(0.106, 2);
    expect(red.b).toBeCloseTo(0.141, 2);

    // Royal Indigo (#4f46e5)
    const indigo = hexToRgb('#4f46e5');
    expect(indigo.r).toBeCloseTo(0.31, 2);
    expect(indigo.g).toBeCloseTo(0.27, 2);
    expect(indigo.b).toBeCloseTo(0.898, 2);

    // 3-digit hex (#f00)
    const shortRed = hexToRgb('#f00');
    expect(shortRed.r).toBeCloseTo(1, 2);
    expect(shortRed.g).toBeCloseTo(0, 2);
    expect(shortRed.b).toBeCloseTo(0, 2);

    // Fallback on invalid hex
    const fallback = hexToRgb('invalid');
    expect(fallback.r).toBeCloseTo(0.929, 2);
  });

  it('parses structured itinerary parameters and daily breakdown from markdown', () => {
    const rawItinerary = `
# Bespoke 6-Day Luxury Singapore & Sentosa Voyage
**Client:** Julian Henderson
**Destination:** Singapore & Sentosa Island
**Departure Date:** 14 Oct 2026 – 19 Oct 2026 (6 Days)
**Estimated Investment:** INR 2,48,000

## Day 1: VIP Arrival & Night Safari
- Private airport ramp escort & transfer to Pan Pacific Marina.
Overnight: Singapore — Pan Pacific Marina
Meals: Welcome Dinner at Ulu Court
Transfers: Private executive airport transfer
Included Experience: Night Safari priority tram admission

## Day 2: Gardens by the Bay & Heritage
- Guided morning excursion to Flower Dome & Cloud Forest.
Overnight: Singapore — Pan Pacific Marina
Meals: Buffet Breakfast & Curated Lunch
Transfers: Private air-conditioned coach
Included Experience: Gardens by the Bay admission
`;

    const parsed = parseItineraryContent(rawItinerary, {
      title: 'Singapore FIT Proposal',
      recipientName: 'Julian Henderson',
      recipientType: 'customer',
      itineraryText: rawItinerary,
    });

    expect(parsed.destination).toContain('Singapore');
    expect(parsed.durationDays).toBe(6);
    expect(parsed.durationNights).toBe(5);
    expect(parsed.days.length).toBe(2);
    expect(parsed.days[0].title).toBe('VIP Arrival & Night Safari');
    expect(parsed.days[0].overnight).toContain('Pan Pacific');
    expect(parsed.days[0].meals).toContain('Welcome Dinner');
    expect(parsed.days[0].experience).toContain('Night Safari');
  });

  it('generates an executive 14-part A4 portrait PDF with custom brand color and accurate pagination', async () => {
    const rawItinerary = `
# Bespoke 6-Day Luxury Singapore Voyage
## Day 1: Arrival & Night Safari
Arrive at Changi Airport. Meet chauffeur for hotel transfer.
Overnight: Singapore — Luxury Hotel
Meals: Welcome Dinner
Transfers: Airport Arrival Transfer
Included Experience: Night Safari Tram

## Day 2: Gardens by the Bay
Visit Cloud Forest and Supertree Grove.
Overnight: Singapore — Luxury Hotel
Meals: Buffet Breakfast
Transfers: Private coach
Included Experience: Gardens by the Bay

## Day 3: Sentosa Island Excursion
Ride the Singapore Cable Car and visit Sentosa beaches.
Overnight: Singapore — Luxury Hotel
Meals: Breakfast & Lunch
Transfers: Private vehicle
Included Experience: Cable Car Sky Network

## Day 4: Universal Studios Singapore
Full day VIP admission pass at Universal Studios.
Overnight: Singapore — Luxury Hotel
Meals: Breakfast
Transfers: Private vehicle
Included Experience: Universal Studios VIP Pass

## Day 5: Marina Bay & Civic Heritage
Historical walking tour and sunset river cruise.
Overnight: Singapore — Luxury Hotel
Meals: Breakfast & Sunset Dining
Transfers: Private coach
Included Experience: River Cruise Ticket

## Day 6: Leisure & Departure
Breakfast at hotel, free time for shopping, executive airport transfer.
Overnight: Not applicable (Departure Day)
Meals: Buffet Breakfast
Transfers: Airport Departure Transfer
Included Experience: Airport Lounge Access
`;

    const customBrand = '#059669'; // Emerald Green
    const pdfBytes = await generateItineraryPDF({
      title: 'Bespoke 6-Day Luxury Singapore Voyage',
      recipientName: 'Julian Henderson & Party',
      recipientEmail: 'julian@example.com',
      recipientType: 'customer',
      itineraryText: rawItinerary,
      organizationName: 'LGT Holidays Private Limited',
      organizationAddress: 'Level 14, Marina One West Tower, Singapore',
      organizationPhone: '+91 98200 12345',
      organizationWebsite: 'https://www.lgtholidays.com',
      organizationLetterheadText: 'Govt. Approved Tour Operator • IATA Accredited • CIN: U63040MH2020PTC345678',
      brandColor: customBrand,
      destination: 'Singapore & Sentosa',
      durationDays: 6,
      travelDates: '14 Oct 2026 – 19 Oct 2026',
      headcountAdults: 2,
      headcountChildren: 0,
      hotelTier: 'luxury_5star',
      targetBudget: 248000,
      currency: 'INR',
      consultantName: 'Benney Robertson',
    });

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(10000);

    // Verify it is a valid PDF
    const loadedDoc = await PDFDocument.load(pdfBytes);
    // 3 intro pages (Cover, Overview, Preferences) + 6 Daily pages + 9 post-daily structural pages (Sample quotation removed) = 18 pages!
    expect(loadedDoc.getPageCount()).toBe(18);

    // Verify A4 dimensions (595.28 x 841.89)
    const firstPage = loadedDoc.getPage(0);
    expect(firstPage.getWidth()).toBeCloseTo(595.28, 1);
    expect(firstPage.getHeight()).toBeCloseTo(841.89, 1);
  });

  it('generates a supplier RFQ PDF with RFQ headings and net rate submission declaration', async () => {
    const rawItinerary = `
Day 1: Arrival in Dubai
Day 2: Desert Safari
Day 3: Departure
`;

    const pdfBytes = await generateItineraryPDF({
      title: 'RFQ: 3-Day Dubai Ground Services',
      recipientName: 'Arabian Adventures DMC',
      recipientEmail: 'reservations@arabianadventures.test',
      recipientType: 'supplier',
      itineraryText: rawItinerary,
      organizationName: 'Acme Luxury Voyages',
      brandColor: '#4f46e5', // Royal Indigo
      destination: 'Dubai, UAE',
      durationDays: 3,
    });

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    const loadedDoc = await PDFDocument.load(pdfBytes);
    expect(loadedDoc.getPageCount()).toBe(15); // 3 + 3 + 9 = 15 pages (Sample quotation removed)
  });

  it('generates customer quotation PDF using the custom brand color', async () => {
    const pdfBytes = await generateCustomerQuotationPDF({
      title: '6-Day Singapore FIT Proposal',
      recipientName: 'Julian Henderson',
      recipientEmail: 'julian@example.com',
      destination: 'Singapore',
      version: 1,
      finalSellingPrice: 2980,
      currency: 'USD',
      itineraryText: 'Day 1: Arrival & Night Safari\nDay 2: Gardens by the Bay',
      brandColor: '#ed1b24',
      organizationName: 'LGT Holidays',
    });

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(1000);
    const loadedDoc = await PDFDocument.load(pdfBytes);
    expect(loadedDoc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('generates 18-page Singapore proposal (without Sample quotation sheet) with customized dates', async () => {
    const pdfBytes = await generateItineraryPDF({
      title: 'Singapore FIT Travel Proposal & Itinerary',
      recipientName: 'Mr. and Mrs. Sample Guest',
      recipientType: 'customer',
      itineraryText: '',
      destination: 'Singapore',
      durationDays: 6,
      travelDates: '12–17 November 2026',
      headcountAdults: 2,
      headcountChildren: 0,
      hotelTier: '4-star hotel in a central Singapore location',
      targetBudget: 248000,
      currency: 'INR',
      organizationName: 'LGT Holidays',
      organizationLetterheadText: 'A brand of LGT Global Hospitality Limited',
      bookingReference: 'LGT/FIT/2026/1042',
      consultantName: 'Benney Robertson',
      consultantPhone: '900 333 7152',
      consultantEmail: 'benney@lgtholidays.com',
    });

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    const loadedDoc = await PDFDocument.load(pdfBytes);
    expect(loadedDoc.getPageCount()).toBe(18);

    // Verify page dimensions (A4 portrait: 595.28 x 841.89)
    for (let p = 0; p < 18; p++) {
      const page = loadedDoc.getPage(p);
      expect(page.getWidth()).toBeCloseTo(595.28, 1);
      expect(page.getHeight()).toBeCloseTo(841.89, 1);
    }
  });

  it('dynamically generates non-Singapore proposals with zero static Singapore content and dynamic dates', async () => {
    const dubaiOptions = {
      title: 'Bespoke 5-Day Journey to Dubai, UAE',
      recipientName: 'Rajesh & Priya Sharma',
      recipientType: 'customer' as const,
      itineraryText: '',
      destination: 'Dubai, UAE',
      durationDays: 5,
      departureDate: '2026-12-10',
      returnDate: '2026-12-14',
      headcountAdults: 2,
      headcountChildren: 1,
      hotelTier: 'luxury_5star',
      specialRequests: 'Vegetarian meals and Burj Khalifa sunset slot',
      targetBudget: 320000,
      currency: 'INR',
      organizationName: 'LGT Holidays',
    };

    const parsed = parseItineraryContent('', dubaiOptions);
    expect(parsed.destination).toBe('Dubai, UAE');
    expect(parsed.durationDays).toBe(5);
    expect(parsed.durationNights).toBe(4);
    expect(parsed.overviewParagraph).toContain('Dubai');
    expect(parsed.overviewParagraph).not.toContain('Singapore');
    expect(parsed.overviewParagraph).not.toContain('Gardens by the Bay');
    expect(parsed.inclusions.join(' ')).not.toContain('Singapore');
    expect(parsed.inclusions.join(' ')).not.toContain('Universal Studios');
    expect(parsed.exclusions.join(' ')).toContain('Dubai, UAE entry visa');
    expect(parsed.exclusions.join(' ')).not.toContain('Singapore');
    expect(parsed.days[0].dateLabel).toBe('Thursday, 10 December');
    expect(parsed.days[4].overnight).toBe(''); // Departure day omits overnight

    const pdfBytes = await generateItineraryPDF(dubaiOptions);
    const loadedDoc = await PDFDocument.load(pdfBytes);
    // 3 intro + 5 days + 9 post-daily (Sample quotation removed) = 17 pages
    expect(loadedDoc.getPageCount()).toBe(17);
  });

  it('applies Settings-configured PDF Header & Theme (logo, letterhead banner, contact bar, tagline, brandColor) across Itinerary, Quotation, and Booking Voucher PDFs', async () => {
    // 1x1 valid transparent PNG data URI for testing logo & letterhead embedding
    const samplePngDataUri =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    const sharedHeaderTheme = {
      organizationName: 'LGT Holidays Private Limited',
      organizationAddress: '24/1, 2nd Floor, Haudin Road, Ulsoor, Bengaluru - 560042',
      organizationPhone: '+91 900 333 7152',
      organizationWebsite: 'https://www.lgtholidays.com',
      organizationLogo: samplePngDataUri,
      organizationLetterhead: samplePngDataUri,
      organizationLetterheadText: 'Govt. Approved Tour Operator • IATA Accredited • GSTIN: 29AAFCL6233F1Z8',
      brandColor: '#7c3aed', // Royal Violet
    };

    // 1. Itinerary Proposal PDF
    const itineraryPdf = await generateItineraryPDF({
      ...sharedHeaderTheme,
      title: 'Bespoke 4-Day Bali Escape',
      recipientName: 'Ananya & Vikram',
      recipientType: 'customer',
      itineraryText: '',
      destination: 'Bali, Indonesia',
      durationDays: 4,
      targetBudget: 185000,
      currency: 'INR',
    });
    const loadedItinerary = await PDFDocument.load(itineraryPdf);
    expect(loadedItinerary.getPageCount()).toBe(16); // 3 + 4 + 9 = 16 pages (Sample quotation removed)

    // 2. Customer Quotation PDF (multi-page with flights & itinerary)
    const quotationPdf = await generateCustomerQuotationPDF({
      ...sharedHeaderTheme,
      title: 'Bespoke 4-Day Bali Escape',
      recipientName: 'Ananya & Vikram',
      recipientEmail: 'ananya@example.com',
      destination: 'Bali, Indonesia',
      version: 2,
      finalSellingPrice: 185000,
      currency: 'INR',
      taxAmount: 8809,
      marginAmount: 22000,
      itineraryText: Array.from({ length: 45 }, (_, i) => `Day ${i + 1}: Curated excursion and private transfer across Bali highlights.`).join('\n'),
      flights: [
        {
          airline: 'Singapore Airlines',
          flightNumber: 'SQ 509',
          origin: 'BLR',
          destination: 'DPS',
          departureTime: '2026-11-12T10:30:00Z',
          arrivalTime: '2026-11-12T21:15:00Z',
          cabinClass: 'Business',
          baggageAllowance: '40kg',
          pnr: 'SQ992K',
        },
      ],
    });
    const loadedQuotation = await PDFDocument.load(quotationPdf);
    expect(loadedQuotation.getPageCount()).toBeGreaterThanOrEqual(2);

    // 3. Booking Confirmation Voucher PDF
    const voucherPdf = await generateBookingVoucherPDF({
      ...sharedHeaderTheme,
      bookingReference: 'BK-BALI42',
      leadTitle: 'Bespoke 4-Day Bali Escape',
      customerName: 'Ananya & Vikram',
      customerEmail: 'ananya@example.com',
      customerPhone: '+91 98450 11223',
      destination: 'Bali, Indonesia',
      departureDate: new Date('2026-11-12T00:00:00Z'),
      returnDate: new Date('2026-11-15T00:00:00Z'),
      headcountAdults: 2,
      headcountChildren: 0,
      hotelTier: '5-Star Luxury Resort',
      flights: [
        {
          airline: 'Singapore Airlines',
          flightNumber: 'SQ 509',
          origin: 'BLR',
          destination: 'DPS',
          departureTime: new Date('2026-11-12T10:30:00Z'),
          pnr: 'SQ992K',
        },
      ],
      totalSellingPrice: 185000,
      currency: 'INR',
    });
    const loadedVoucher = await PDFDocument.load(voucherPdf);
    expect(loadedVoucher.getPageCount()).toBe(1);
  });

  it('resolves customer name for Prepared for (falling back to Guest only when none found) and cleans pipe tables in Trip overview and Before travel', () => {
    const sampleMaldivesMarkdown = `# LGT HOLIDAYS — TRAVEL PROPOSAL
**Guest:** Arun
**Travel Dates:** Friday, 20 November 2026 – Tuesday, 24 November 2026

## 1. Trip Overview (Executive Summary)
This proposal is prepared for Arun as a solo traveller seeking a short, high-comfort Maldives escape from Bengaluru. | Item | Details | |---|---| | Travellers | 1 adult (single occupancy) | | Duration | 5 days / 4 nights | | Accommodation | 1 Overwater Pool Villa, 1 room, single occupancy - 4 nights | | Meal plan | Daily breakfast; one curated sunset dinner included | | Transport | Return economy airfare Bengaluru-Malé; return resort speedboat transfers; airport meet-and-greet | | Flight scope | Round-trip economy class, 1 adult, airline taxes and fees included; specific flights to be selected at booking | | Pace | Relaxed; one structured experience day, remaining time at leisure |

## 10. Before Travel — Outstanding Items
| Item | Status |
|---|---|
| Guest approval of revised budget (USD 6,500 – 8,000) | Pending |
| Confirmation of villa availability for the additional night (20 – 24 November 2026) | Pending |
| Final room category selection | Pending |
| Traveller declaration and entry formalities | To be completed closer to departure |
`;

    // 1. Customer name found in itinerary text when recipientName is 'Guest'
    const nameFromItinerary = resolveCustomerNameForPdf(
      {
        title: 'Maldives Proposal',
        recipientName: 'Guest',
        recipientType: 'customer',
        itineraryText: sampleMaldivesMarkdown,
      },
      sampleMaldivesMarkdown
    );
    expect(nameFromItinerary).toBe('Arun');

    // 2. Customer name falls back to 'Guest' only when no customer name is found anywhere
    const fallbackGuest = resolveCustomerNameForPdf(
      {
        title: 'Maldives Proposal',
        recipientName: '',
        recipientType: 'customer',
        itineraryText: 'Day 1: Arrive in Maldives',
      },
      'Day 1: Arrive in Maldives'
    );
    expect(fallbackGuest).toBe('Guest');

    // 3. Trip overview paragraph has no pipe table artifacts and table rows are populated
    const parsed = parseItineraryContent(sampleMaldivesMarkdown, {
      title: 'Maldives Proposal',
      recipientName: nameFromItinerary,
      recipientType: 'customer',
      itineraryText: sampleMaldivesMarkdown,
      destination: 'Maldives',
      durationDays: 5,
      headcountAdults: 1,
    });

    expect(parsed.overviewParagraph).not.toContain('|');
    expect(parsed.overviewParagraph).toContain('This proposal is prepared for Arun as a solo traveller');

    const hotelPlanRow = parsed.overviewTableRows.find((r) => r[0] === 'Hotel plan');
    expect(hotelPlanRow?.[1]).toContain('1 Overwater Pool Villa');

    const flightsRow = parsed.overviewTableRows.find((r) => r[0] === 'Flights');
    expect(flightsRow?.[1]).toContain('Round-trip economy class');

    // 4. Before travel items have no '| Item | Status |', no '|---|---|', no pipes, and no USD budget line
    expect(parsed.beforeTravelItems.some((item) => item.includes('|'))).toBe(false);
    expect(parsed.beforeTravelItems.some((item) => item.includes('---'))).toBe(false);
    expect(parsed.beforeTravelItems.some((item) => item.toLowerCase().includes('usd'))).toBe(false);
    expect(parsed.beforeTravelItems).toContain('Final room category selection');
    expect(parsed.beforeTravelItems).toContain(
      'Traveller declaration and entry formalities (to be completed closer to departure)'
    );
  });
});
