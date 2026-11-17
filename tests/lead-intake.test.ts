import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { enquirySchema, normalizeGoogle, normalizeMeta, parseWebhookJson, providerId, validMetaSignature } from '@/lib/lead-intake/normalize';

describe('Lead provider normalization and authentication', () => {
  it('normalizes contact details without guessing a country code', () => {
    const result = enquirySchema.parse({ submissionId: 'a', formId: 'f', formName: 'Summer trips', name: ' Jane ', email: 'JANE@Example.com', phone: '+91 (98765) 43210' });
    expect(result).toMatchObject({ name: 'Jane', email: 'jane@example.com', phone: '+919876543210', temperature: 'warm' });
    expect(enquirySchema.safeParse({ ...result, phone: '9876543210' }).success).toBe(false);
  });
  it('accepts email-only enquiries and rejects enquiries with no contact route', () => {
    const input = { submissionId: 'a', formId: 'f', formName: 'Summer trips', name: 'Jane', email: 'jane@example.com' };
    expect(enquirySchema.safeParse(input).success).toBe(true);
    expect(enquirySchema.safeParse({ ...input, email: undefined }).success).toBe(false);
  });
  it('validates the raw Meta signature and rejects tampered bodies and malformed signatures', () => {
    const body = '{"entry":[]}'; const secret = 'test-secret';
    const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(validMetaSignature(body, signature, secret)).toBe(true);
    expect(validMetaSignature(`${body} `, signature, secret)).toBe(false);
    expect(validMetaSignature(body, 'sha256=invalid', secret)).toBe(false);
  });
  it('preserves long string identifiers and refuses already rounded numeric identifiers', () => {
    expect(providerId('999999999999999999')).toBe('999999999999999999');
    expect(() => providerId(999999999999999999)).toThrow('unsafe');
  });
  it('preserves numeric int64 provider IDs before parsing without altering quoted answers', () => {
    expect(parseWebhookJson('{"form_id":999999999999999999,"name":"Form 999999999999999999 \\"holiday\\"","small":42,"price":12.5}')).toEqual({ form_id: '999999999999999999', name: 'Form 999999999999999999 "holiday"', small: 42, price: 12.5 });
    expect(() => parseWebhookJson('{"invalid":01}')).toThrow();
  });
  it('records exact Google form names and supplied campaign details', () => {
    const input = { lead_id: 'lead-1', form_id: 12, campaign_id: 34, creative_id: 56, adgroup_id: 78, gcl_id: 'click-1', user_column_data: [{ column_id: 'FULL_NAME', string_value: 'Jane' }, { column_id: 'EMAIL', string_value: 'jane@example.com' }] };
    expect(normalizeGoogle(input, { '12': 'Exact Google form name' })).toMatchObject({ formId: '12', formName: 'Exact Google form name', campaignId: '34', adId: '56', adGroupId: '78', clickId: 'click-1' });
    expect(() => normalizeGoogle(input, {})).toThrow();
  });
  it('maps Meta names and retains attribution', () => {
    expect(normalizeMeta({ id: '123', form_id: '456', ad_id: '789', field_data: [{ name: 'first_name', values: ['Jane'] }, { name: 'last_name', values: ['Doe'] }, { name: 'email', values: ['jane@example.com'] }] }, 'Exact Meta form')).toMatchObject({ name: 'Jane Doe', formName: 'Exact Meta form', adId: '789' });
  });
});
