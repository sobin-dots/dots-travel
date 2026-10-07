import { Resend } from 'resend';

let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return null;
  }
  if (!resendClient) {
    resendClient = new Resend(apiKey.trim());
  }
  return resendClient;
}

export interface SendCustomerEmailParams {
  to: string;
  customerName: string;
  title: string;
  destination: string;
  pdfBuffer: Uint8Array;
}

export interface SendSupplierEmailParams {
  to: string;
  supplierName: string;
  contactPerson?: string;
  customerName: string;
  title: string;
  destination: string;
  pdfBuffer: Uint8Array;
}

export interface EmailDispatchResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Dispatches the finalized Customer Travel Itinerary with attached PDF.
 */
export async function sendCustomerItineraryEmail(
  params: SendCustomerEmailParams
): Promise<EmailDispatchResult> {
  const { to, customerName, title, destination, pdfBuffer } = params;
  const resend = getResendClient();
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  const cleanFilename = `${destination.replace(/[^a-zA-Z0-9]/g, '_')}_Itinerary.pdf`;

  if (!resend) {
    return {
      success: false,
      error: 'RESEND_API_KEY is not configured for live email delivery.',
    };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: fromEmail.includes('<') ? fromEmail : `Luxury Travel Concierge <${fromEmail}>`,
      to: [to],
      subject: `Your Bespoke Travel Itinerary: ${title}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #fafafa; border-radius: 12px; color: #18181b;">
          <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 32px 24px; border-radius: 8px 8px 0 0; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">Bespoke Travel Concierge</h1>
            <p style="margin: 6px 0 0 0; font-size: 14px; opacity: 0.9;">Curated Private Itinerary</p>
          </div>
          
          <div style="background-color: white; padding: 32px 24px; border: 1px solid #e4e4e7; border-top: none; border-radius: 0 0 8px 8px;">
            <p style="font-size: 16px; line-height: 24px; margin-top: 0;">Dear <strong>${customerName}</strong>,</p>
            
            <p style="font-size: 15px; line-height: 24px; color: #3f3f46;">
              We are delighted to present your customized travel itinerary for <strong>${destination}</strong>. Based on your recent consultation, our concierge team has synthesized an exclusive journey designed around your preferences.
            </p>
            
            <div style="background-color: #f4f4f5; border-left: 4px solid #4f46e5; padding: 16px; margin: 24px 0; border-radius: 4px;">
              <h3 style="margin: 0 0 4px 0; font-size: 15px; color: #18181b;">${title}</h3>
              <p style="margin: 0; font-size: 13px; color: #71717a;">Destination: ${destination} • Official PDF Document Attached</p>
            </div>

            <p style="font-size: 14px; line-height: 22px; color: #3f3f46;">
              📎 <strong>Attached Document:</strong> Please review the attached PDF file <code>${cleanFilename}</code> for your comprehensive day-by-day timeline, curated accommodations, and included private experiences.
            </p>
            
            <p style="font-size: 14px; line-height: 22px; color: #3f3f46; margin-bottom: 0;">
              If you have any questions or wish to adjust any part of your itinerary, please reply directly to this email.
            </p>
            
            <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e4e4e7; font-size: 12px; color: #a1a1aa; text-align: center;">
              Sent via Plivo Unified Telephony & Travel Concierge Platform
            </div>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: cleanFilename,
          content: Buffer.from(pdfBuffer),
        },
      ],
    });

    if (error) {
      console.error('[Email:Resend] Error sending customer email:', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error('[Email:Resend] Exception sending customer email:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Dispatches the Request for Quotation (RFQ) to a Partner Supplier with attached PDF.
 */
export async function sendSupplierRfqEmail(
  params: SendSupplierEmailParams
): Promise<EmailDispatchResult> {
  const { to, supplierName, contactPerson, customerName, title, destination, pdfBuffer } = params;
  const resend = getResendClient();
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  const cleanFilename = `RFQ_${destination.replace(/[^a-zA-Z0-9]/g, '_')}_Quotation.pdf`;

  if (!resend) {
    return {
      success: false,
      error: 'RESEND_API_KEY is not configured for live email delivery.',
    };
  }

  try {
    const greeting = contactPerson ? `Dear ${contactPerson}` : `Dear Team at ${supplierName}`;

    const { data, error } = await resend.emails.send({
      from: fromEmail.includes('<') ? fromEmail : `Concierge Operations <${fromEmail}>`,
      to: [to],
      subject: `[RFQ] Quotation Request: ${destination} (${supplierName}) - ${title}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #fafafa; border-radius: 12px; color: #18181b;">
          <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px 24px; border-radius: 8px 8px 0 0; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">B2B Request for Quotation (RFQ)</h1>
            <p style="margin: 6px 0 0 0; font-size: 13px; color: #94a3b8;">Partner Supplier Quotation Request</p>
          </div>
          
          <div style="background-color: white; padding: 32px 24px; border: 1px solid #e4e4e7; border-top: none; border-radius: 0 0 8px 8px;">
            <p style="font-size: 15px; line-height: 24px; margin-top: 0;">${greeting},</p>
            
            <p style="font-size: 14px; line-height: 22px; color: #3f3f46;">
              Please review the following Request for Quotation (RFQ) for our private client <strong>${customerName}</strong> traveling to <strong>${destination}</strong>.
            </p>
            
            <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; padding: 16px; margin: 20px 0; border-radius: 6px;">
              <table style="width: 100%; font-size: 13px; color: #334155; line-height: 20px;">
                <tr>
                  <td style="font-weight: 600; width: 35%;">Project / Trip:</td>
                  <td>${title}</td>
                </tr>
                <tr>
                  <td style="font-weight: 600;">Destination:</td>
                  <td>${destination}</td>
                </tr>
                <tr>
                  <td style="font-weight: 600;">Partner Supplier:</td>
                  <td>${supplierName}</td>
                </tr>
              </table>
            </div>

            <p style="font-size: 14px; line-height: 22px; color: #3f3f46;">
              📎 <strong>RFQ Specification Document:</strong> Please review the attached PDF <code>${cleanFilename}</code> for the itemized itinerary requirements, accommodation scope, and requested service dates.
            </p>
            
            <p style="font-size: 14px; line-height: 22px; color: #3f3f46; margin-bottom: 0;">
              Kindly respond to this email with your net B2B quotation, availability status, and booking terms at your earliest convenience.
            </p>
            
            <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e4e4e7; font-size: 12px; color: #a1a1aa; text-align: center;">
              Procurement & Partner Operations • Plivo Travel Concierge
            </div>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: cleanFilename,
          content: Buffer.from(pdfBuffer),
        },
      ],
    });

    if (error) {
      console.error('[Email:Resend] Error sending supplier RFQ email:', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error('[Email:Resend] Exception sending supplier RFQ email:', err);
    return { success: false, error: err.message };
  }
}
