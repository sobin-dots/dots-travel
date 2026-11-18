import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional().transform(value => value === '' ? null : value);
export const ContactTravelFieldsSchema = z.object({
  preferredTravelMonth: z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/, 'Preferred travel month must use YYYY-MM').or(z.literal('')).nullable().optional().transform(value => value === '' ? null : value),
  tourType: optionalText(100),
  numberOfChildren: z.number().int('Number of children must be a whole number').min(0).max(1000).nullable().optional(),
  specialRequirements: optionalText(5000),
  city: optionalText(100),
});
export const contactFields = z.object({
  name: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100),
  phone: z.string().trim().transform(value => value.replace(/[\s().-]/g, '')).pipe(z.string().regex(/^\+[1-9]\d{6,14}$/, 'Phone number must include a country code, for example +919876543210').or(z.literal(''))).nullable().optional().transform(value => value === '' ? null : value),
  email: z.string().trim().toLowerCase().email('Invalid email address').or(z.literal('')).nullable().optional().transform(value => value === '' ? null : value),
  company: optionalText(100), notes: optionalText(500), ...ContactTravelFieldsSchema.shape,
});
export const CreateContactSchema = contactFields.strict().refine(value => value.phone || value.email, { message: 'Provide a phone number or email address', path: ['phone'] });
export const UpdateContactSchema = contactFields.partial().extend({ expectedUpdatedAt: z.string().datetime().optional() }).strict();
export type ContactTravelFields = z.infer<typeof ContactTravelFieldsSchema>;

export function contactValuesFromForm(form: FormData) {
  const children = String(form.get('numberOfChildren') ?? '').trim();
  return { name: String(form.get('name') ?? ''), phone: String(form.get('phone') ?? ''), email: String(form.get('email') ?? ''),
    preferredTravelMonth: String(form.get('preferredTravelMonth') ?? ''), tourType: String(form.get('tourType') ?? ''),
    numberOfChildren: children === '' ? null : Number(children), specialRequirements: String(form.get('specialRequirements') ?? ''), city: String(form.get('city') ?? ''),
    company: String(form.get('company') ?? ''), notes: String(form.get('notes') ?? '') };
}
export function formatTravelMonth(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}-01T00:00:00Z`));
}
