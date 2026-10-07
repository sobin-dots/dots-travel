import { describe, it, expect } from 'vitest';
import { computeV3Signature, verifyWebhookSignature } from '../src/lib/telephony/webhook-validator';

describe('Webhook V3 Signature Validation (Plivo SDK)', () => {
  const url = 'http://localhost:3000/api/v1/webhooks/voice/answer';
  const nonce = 'testnonce999888';
  const token = 'sim-secret-auth-token-123';
  const params = {
    CallUUID: 'c1abc1234567890',
    From: '+14155552671',
    To: '+14155550199',
    CallStatus: 'ringing',
  };

  it('validates authentic signatures computed via the official algorithm', () => {
    const signature = computeV3Signature('POST', url, nonce, token, params);
    const isValid = verifyWebhookSignature({
      method: 'POST',
      url,
      nonce,
      authToken: token,
      signatureHeader: signature,
      params,
    });

    expect(isValid).toBe(true);
  });

  it('rejects tampered URL', () => {
    const signature = computeV3Signature('POST', url, nonce, token, params);
    const tamperedUrl = 'http://localhost:3000/api/v1/webhooks/voice/different';

    const isValid = verifyWebhookSignature({
      method: 'POST',
      url: tamperedUrl,
      nonce,
      authToken: token,
      signatureHeader: signature,
      params,
    });

    expect(isValid).toBe(false);
  });

  it('rejects tampered parameters', () => {
    const signature = computeV3Signature('POST', url, nonce, token, params);
    const tamperedParams = { ...params, To: '+19999999999' };

    const isValid = verifyWebhookSignature({
      method: 'POST',
      url,
      nonce,
      authToken: token,
      signatureHeader: signature,
      params: tamperedParams,
    });

    expect(isValid).toBe(false);
  });

  it('rejects tampered nonce', () => {
    const signature = computeV3Signature('POST', url, nonce, token, params);
    const isValid = verifyWebhookSignature({
      method: 'POST',
      url,
      nonce: 'wrongnonce111',
      authToken: token,
      signatureHeader: signature,
      params,
    });

    expect(isValid).toBe(false);
  });

  it('accepts comma-separated multi-token signatures if any token matches', () => {
    const correctSig = computeV3Signature('POST', url, nonce, token, params);
    const commaSeparated = `dummySig123, ${correctSig}, anotherDummy`;

    const isValid = verifyWebhookSignature({
      method: 'POST',
      url,
      nonce,
      authToken: token,
      signatureHeader: commaSeparated,
      params,
    });

    expect(isValid).toBe(true);
  });
});
