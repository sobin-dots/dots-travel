import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { computeV3Signature, verifyWebhookSignature } from '../src/lib/telephony/webhook-validator';

async function main() {
  const eventKind = process.argv[2] || 'voice-answer';
  const targetUrl = process.argv[3] || `${process.env.PUBLIC_BASE_URL || 'http://localhost:3000'}/api/v1/webhooks/voice/answer`;
  const authToken = process.env.PLIVO_WEBHOOK_AUTH_TOKEN || process.env.PLIVO_AUTH_TOKEN || 'simulator-auth-token-2026';

  console.log(`[Tool] replay-webhook starting for eventKind: ${eventKind}`);
  console.log(`[Tool] Target webhook URL: ${targetUrl}`);

  // Construct representative payload matching Plivo's real callbacks
  let payload: Record<string, any>;
  switch (eventKind) {
    case 'voice-status':
      payload = {
        CallUUID: `c1${crypto.randomBytes(12).toString('hex')}`,
        From: '+14155552671',
        To: '+14155550199',
        CallStatus: 'completed',
        Direction: 'outbound',
        Duration: '45',
        BillDuration: '60',
        TotalCost: '0.012000',
        HangupCause: '4000',
      };
      break;
    case 'sms-inbound':
      payload = {
        MessageUUID: `m1${crypto.randomBytes(12).toString('hex')}`,
        From: '+14155550199',
        To: '+14155552671',
        Type: 'sms',
        Text: 'Hello from customer inbound SMS!',
      };
      break;
    case 'sms-status':
      payload = {
        MessageUUID: `m1${crypto.randomBytes(12).toString('hex')}`,
        From: '+14155552671',
        To: '+14155550199',
        Status: 'delivered',
        Units: '1',
        TotalRate: '0.007500',
        TotalAmount: '0.007500',
      };
      break;
    case 'recording':
      payload = {
        recording_id: `rec_${crypto.randomBytes(12).toString('hex')}`,
        record_url: 'https://media.plivo.com/recordings/sample.mp3',
        recording_duration: '32',
        call_uuid: `c1${crypto.randomBytes(12).toString('hex')}`,
      };
      break;
    case 'voice-answer':
    default:
      payload = {
        CallUUID: `c1${crypto.randomBytes(12).toString('hex')}`,
        From: '+14155552671',
        To: '+14155550199',
        CallStatus: 'ringing',
        Direction: 'inbound',
      };
      break;
  }

  const nonce = crypto.randomBytes(16).toString('hex');
  const signature = computeV3Signature('POST', targetUrl, nonce, authToken, payload);

  // Validate the signature using the official Plivo SDK
  const sdkValidation = verifyWebhookSignature({
    method: 'POST',
    url: targetUrl,
    nonce,
    authToken,
    signatureHeader: signature,
    params: payload,
  });

  // Attempt real HTTP POST if server is reachable
  let httpStatus: number | null = null;
  let httpResponse: any = null;
  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-plivo-signature-v3': signature,
        'x-plivo-signature-v3-nonce': nonce,
      },
      body: JSON.stringify(payload),
    });
    httpStatus = res.status;
    const rawText = await res.text();
    try {
      httpResponse = JSON.parse(rawText);
    } catch {
      httpResponse = rawText;
    }
  } catch (err: any) {
    httpResponse = `Server connection failed on ${targetUrl}: ${err.code || err.message}`;
  }

  const output = {
    timestamp: new Date().toISOString(),
    eventKind,
    targetUrl,
    nonce,
    signature,
    payload,
    sdkValidationPassed: sdkValidation,
    httpStatus,
    httpResponse,
  };

  console.log('[Tool] Result:', JSON.stringify(output, null, 2));

  const outPath = path.join(process.cwd(), '.tmp', 'replay-webhook-output.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`[Tool] Wrote output evidence to ${outPath}`);

  if (!sdkValidation) {
    console.error('[Tool] SDK validation failed!');
    process.exit(1);
  }
}

main();
