import { getTenantIntegration } from '@/lib/integrations/credentials-manager';

export interface WhatsAppSendOptions {
  to: string;
  text?: string;
  documentUrl?: string;
  filename?: string;
  caption?: string;
  templateName?: string;
  organizationId?: string;
}

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  simulated?: boolean;
  error?: string;
  [key: string]: any;
}

/**
 * Meta WhatsApp Cloud API Client
 * Official Graph API integration for sending WhatsApp messages, templates, and PDF proposals.
 */
export async function sendWhatsAppMessage(options: WhatsAppSendOptions): Promise<WhatsAppSendResult> {
  const { to, text, documentUrl, filename, caption, organizationId } = options;

  let phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  let accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  // Resolve tenant's custom BYOK WhatsApp credentials if configured
  if (organizationId) {
    try {
      const tenantInteg = await getTenantIntegration(organizationId, 'whatsapp');
      if (tenantInteg?.credentials?.phoneNumberId && tenantInteg.credentials?.accessToken) {
        phoneNumberId = tenantInteg.credentials.phoneNumberId;
        accessToken = tenantInteg.credentials.accessToken;
      }
    } catch (err) {
      console.warn('Error reading tenant WhatsApp integration:', err);
    }
  }

  // Format recipient phone number to E.164 (without '+' prefix for Meta Cloud API)
  const cleanTo = to.replace(/\D/g, '');

  // Simulation mode when unconfigured or running in test/sandbox
  if (!phoneNumberId || !accessToken || accessToken.startsWith('sim_') || accessToken.startsWith('test_')) {
    const simulatedId = `wamid.sim_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    console.log(`[WhatsApp:Simulator] Sending to +${cleanTo}:`, text || `[Document: ${filename || documentUrl}]`);
    return {
      success: true,
      messageId: simulatedId,
      simulated: true,
    };
  }

  try {
    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

    let payload: Record<string, any>;
    if (documentUrl) {
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'document',
        document: {
          link: documentUrl,
          caption: caption || 'Your Customized Travel Proposal',
          filename: filename || 'Travel_Quotation.pdf',
        },
      };
    } else {
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'text',
        text: {
          preview_url: true,
          body: text || 'Greetings from your Bespoke Travel Concierge!',
        },
      };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      const messageId = data.messages?.[0]?.id;
      return { success: true, messageId };
    }

    const errText = await res.text();
    console.error(`WhatsApp Cloud API error (status ${res.status}):`, errText);
    return { success: false, error: `WhatsApp API error: ${errText.slice(0, 150)}` };
  } catch (err: any) {
    console.error('WhatsApp network dispatch error:', err);
    return { success: false, error: err.message || 'WhatsApp network failure' };
  }
}
