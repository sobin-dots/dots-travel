import { z } from 'zod';
import { contactFields } from '@/lib/contact-fields';

export const ENQUIRY_STATUSES = ['new_inquiry', 'contacted', 'quote_prep', 'quote_sent', 'negotiation', 'confirmed', 'lost'] as const;
export const ENQUIRY_TAGS = ['hot', 'warm', 'cold'] as const;
export type EnquiryStatus = typeof ENQUIRY_STATUSES[number];
export type EnquiryTag = typeof ENQUIRY_TAGS[number];

export const ENQUIRY_STATUS_LABELS: Record<EnquiryStatus, string> = {
  new_inquiry: 'New enquiry',
  contacted: 'Contacted',
  quote_prep: 'Quote in preparation',
  quote_sent: 'Quote sent',
  negotiation: 'Negotiation',
  confirmed: 'Confirmed',
  lost: 'Lost',
};
export const ENQUIRY_TAG_LABELS: Record<EnquiryTag, string> = { hot: 'Hot', warm: 'Warm', cold: 'Cold' };

export const LEAD_SOURCES = [
  'Instagram',
  'Facebook',
  'YouTube',
  'LinkedIn',
  'Google Ads',
  'Website',
  'Referral',
  'Walk-in',
  'manual',
] as const;
export type LeadSource = typeof LEAD_SOURCES[number];
export const LEAD_SOURCE_LABELS: Record<string, string> = {
  Instagram: 'Instagram',
  Facebook: 'Facebook',
  YouTube: 'YouTube',
  LinkedIn: 'LinkedIn',
  'Google Ads': 'Google Ads',
  Website: 'Website',
  Referral: 'Referral',
  'Walk-in': 'Walk-in',
  manual: 'Other / Manual',
};

/** Roles that may own an enquiry. Viewers can never be assigned. */
export const ASSIGNABLE_ROLES = ['owner', 'admin', 'operator', 'sales'] as const;

const tagList = z.array(z.string().trim().min(1, 'Tags cannot be empty').max(50)).max(30, 'Use at most 30 tags');
const workflow = {
  enquiryStatus: z.enum(ENQUIRY_STATUSES),
  enquiryTag: z.enum(ENQUIRY_TAGS),
  tags: tagList,
  assignedToId: z.string().uuid('Choose a valid staff member').nullable(),
};

/** Body used to create an enquiry (a contact with ownership, status and tags). */
export const CreateEnquirySchema = contactFields
  .extend({
    enquiryStatus: workflow.enquiryStatus.default('new_inquiry'),
    enquiryTag: workflow.enquiryTag.default('warm'),
    tags: workflow.tags.default([]),
    assignedToId: workflow.assignedToId.optional(),
  })
  .strict()
  .refine(value => value.phone || value.email, { message: 'Provide a phone number or email address', path: ['phone'] });

/** Body used to edit an enquiry. Every field is optional. */
export const UpdateEnquirySchema = contactFields
  .partial()
  .extend({
    enquiryStatus: workflow.enquiryStatus.optional(),
    enquiryTag: workflow.enquiryTag.optional(),
    tags: workflow.tags.optional(),
    assignedToId: workflow.assignedToId.optional(),
    expectedUpdatedAt: z.string().datetime().optional(),
  })
  .strict();

export type CreateEnquiryInput = z.infer<typeof CreateEnquirySchema>;
export type UpdateEnquiryInput = z.infer<typeof UpdateEnquirySchema>;

export function dedupeTags(tags: string[]) {
  return [...new Set(tags.map(tag => tag.trim()).filter(Boolean))];
}

export function parseTagInput(value: string) {
  return dedupeTags(value.split(',').map(tag => tag.trim()));
}
