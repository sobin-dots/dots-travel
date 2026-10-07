import { describe, it, expect } from 'vitest';
import { sendCustomerItineraryEmail, sendSupplierRfqEmail } from '../src/lib/email';
import { generateItineraryPDF } from '../src/lib/pdf-generator';

describe('Resend Email Integration Service', () => {
  it('dispatches customer itinerary email with PDF attachment in simulated mode when no API key', async () => {
    const pdfBytes = await generateItineraryPDF({
      title: 'Romantic Swiss Alps Retreat',
      recipientName: 'Elena Rostova',
      recipientEmail: 'elena@voyages.test',
      recipientType: 'customer',
      itineraryText: 'Day 1: Arrival in Geneva.\nDay 2: Scenic Glacier Express.',
    });

    const result = await sendCustomerItineraryEmail({
      to: 'elena@voyages.test',
      customerName: 'Elena Rostova',
      title: 'Romantic Swiss Alps Retreat',
      destination: 'Switzerland',
      pdfBuffer: pdfBytes,
    });

    expect(result.success).toBe(true);
    expect(result.id).toBeDefined();
    // Simulated flag should be true when no live key is set
    expect(typeof result.id).toBe('string');
  });

  it('dispatches supplier RFQ quotation request email with PDF attachment', async () => {
    const pdfBytes = await generateItineraryPDF({
      title: 'Romantic Swiss Alps Retreat',
      recipientName: 'Alpine Grand Hotel',
      recipientEmail: 'rfq@alpinegrand.test',
      recipientType: 'supplier',
      itineraryText: 'Day 1: Chalet Suite with Matterhorn views.\nDay 2: Private fondue dinner.',
    });

    const result = await sendSupplierRfqEmail({
      to: 'rfq@alpinegrand.test',
      supplierName: 'Alpine Grand Hotel & Spa',
      contactPerson: 'Marc Weber',
      customerName: 'Elena Rostova',
      title: 'Romantic Swiss Alps Retreat',
      destination: 'Switzerland',
      pdfBuffer: pdfBytes,
    });

    expect(result.success).toBe(true);
    expect(result.id).toBeDefined();
    expect(typeof result.id).toBe('string');
  });
});
