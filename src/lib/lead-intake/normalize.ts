import { z } from 'zod';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ContactTravelFieldsSchema } from '@/lib/contact-fields';
import { normalizeAndValidatePhone } from '@/lib/phone-validation';

export const providers = ['meta', 'google_ads', 'google_forms', 'website', 'hosted_form', 'generic'] as const;
export type LeadProvider = typeof providers[number];
export const enquirySchema = z.object({
  submissionId: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(150),
  phone: z.string().superRefine((val, ctx) => {
    if (!val) return;
    const res = normalizeAndValidatePhone(val);
    if (!res.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: res.error || 'Invalid phone number format with country code',
      });
    }
  }).transform(v => {
    if (!v) return undefined;
    const res = normalizeAndValidatePhone(v);
    return res.valid ? res.phone : undefined;
  }).optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  notes: z.string().max(10000).optional(),
  answers: z.record(z.string().max(200), z.string().max(10000)).refine(v => Object.keys(v).length <= 100, 'Maximum 100 form answers').optional(),
  formId: z.string().trim().min(1).max(200),
  formName: z.string().trim().min(1).max(200),
  temperature: z.enum(['hot', 'warm', 'cold']).default('warm'),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).default([]),
  campaignId: z.string().max(200).optional(), campaignName: z.string().max(200).optional(),
  adId: z.string().max(200).optional(), adName: z.string().max(200).optional(),
  adGroupId: z.string().max(200).optional(), clickId: z.string().max(500).optional(),
  utmSource: z.string().max(200).optional(), utmMedium: z.string().max(200).optional(), utmCampaign: z.string().max(200).optional(),
  ...ContactTravelFieldsSchema.shape,
}).refine(v => v.phone || v.email, { message: 'A phone number or email is required' });
export type Enquiry = z.infer<typeof enquirySchema>;

export function equalSecret(a: string, b: string) {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function validMetaSignature(body: string, signature: string, secret: string) {
  return equalSecret(signature, `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`);
}

// Provider IDs may exceed JavaScript's safe integer range. Require lossless strings in that case.
export function providerId(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  throw new Error('Missing or unsafe provider identifier; send identifiers as strings');
}

// Google sends int64 identifiers as JSON numbers. Preserve their original digits
// before JSON.parse can round them; never rewrite numbers inside quoted answers.
export function parseWebhookJson(raw: string) {
  const parts: string[] = [];
  for (let i = 0; i < raw.length;) {
    const start = i;
    if (raw[i] === '"') {
      i++;
      while (i < raw.length) {
        if (raw[i] === '\\') { i += 2; continue; }
        if (raw[i++] === '"') break;
      }
      parts.push(raw.slice(start, i));
    } else if (/[0-9-]/.test(raw[i])) {
      while (i < raw.length && /[0-9eE+.\-]/.test(raw[i])) i++;
      const token = raw.slice(start, i);
      parts.push(/^-?(0|[1-9]\d{15,})$/.test(token) && (BigInt(token) > BigInt(Number.MAX_SAFE_INTEGER) || BigInt(token) < BigInt(Number.MIN_SAFE_INTEGER)) ? JSON.stringify(token) : token);
    } else parts.push(raw[i++]);
  }
  return JSON.parse(parts.join(''));
}

export function normalizeGoogle(payload: Record<string, unknown>, formNames: Record<string, string>): Enquiry {
  const fields = Object.fromEntries((Array.isArray(payload.user_column_data) ? payload.user_column_data : []).map((f: { column_id: string; string_value: string }) => [f.column_id, f.string_value]));
  const formId = providerId(payload.form_id);
  return enquirySchema.parse({
    submissionId: providerId(payload.lead_id), formId, formName: formNames[formId],
    name: fields.FULL_NAME || [fields.FIRST_NAME, fields.LAST_NAME].filter(Boolean).join(' ') || 'New enquiry',
    phone: fields.PHONE_NUMBER || undefined, email: fields.EMAIL || undefined,
    answers: fields,
    campaignId: payload.campaign_id == null ? undefined : providerId(payload.campaign_id),
    adGroupId: payload.adgroup_id == null ? undefined : providerId(payload.adgroup_id),
    adId: payload.creative_id == null ? undefined : providerId(payload.creative_id),
    clickId: payload.gcl_id,
  });
}

export function normalizeMeta(payload: Record<string, unknown>, formName: string): Enquiry {
  const fields = Object.fromEntries((Array.isArray(payload.field_data) ? payload.field_data : []).map((f: { name: string; values: string[] }) => [f.name, f.values?.join('; ') || '']));
  return enquirySchema.parse({
    submissionId: providerId(payload.id), formId: providerId(payload.form_id), formName,
    name: fields.full_name || [fields.first_name, fields.last_name].filter(Boolean).join(' ') || 'New enquiry',
    phone: fields.phone_number || undefined, email: fields.email || undefined,
    answers: fields,
    campaignId: payload.campaign_id, campaignName: payload.campaign_name,
    adId: payload.ad_id, adName: payload.ad_name, adGroupId: payload.adset_id,
  });
}
