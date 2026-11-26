import { z } from 'zod';
import { normalizeAndValidatePhone } from './phone-validation';

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional().transform(value => value === '' ? null : value);
const normalizeMonth = (val: string | null | undefined) => {
  if (!val || val === '') return null;
  const trimmed = val.trim();
  if (/^(0[1-9]|1[0-2])\/[1-9]\d{3}$/.test(trimmed)) {
    const [mm, yyyy] = trimmed.split('/');
    return `${yyyy}-${mm}`;
  }
  return trimmed;
};

export const ContactTravelFieldsSchema = z.object({
  destination: optionalText(150),
  preferredTravelMonth: z.string().trim().nullable().optional()
    .transform(normalizeMonth)
    .refine(val => val === null || val === undefined || /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(val), {
      message: 'Preferred travel month must use MM/YYYY (e.g. 12/2026) or YYYY-MM',
    }),
  tourType: optionalText(100),
  numberOfAdults: z.number().int('Number of adults must be a whole number').min(0).max(1000).nullable().optional(),
  numberOfChildren: z.number().int('Number of children must be a whole number').min(0).max(1000).nullable().optional(),
  specialRequirements: optionalText(5000),
  city: optionalText(100),
});
export const contactFields = z.object({
  name: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100),
  phone: z.string().trim().superRefine((val, ctx) => {
    const cleaned = val.replace(/[\s().-]/g, '');
    if (!cleaned) return;
    const res = normalizeAndValidatePhone(cleaned);
    if (!res.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: res.error || 'Invalid phone number format with country code',
      });
    }
  }).transform(value => {
    const cleaned = value.replace(/[\s().-]/g, '');
    if (!cleaned) return null;
    const res = normalizeAndValidatePhone(cleaned);
    return res.valid ? res.phone : null;
  }).nullable().optional(),
  email: z.string().trim().toLowerCase().email('Invalid email address').or(z.literal('')).nullable().optional().transform(value => value === '' ? null : value),
  company: optionalText(100), notes: optionalText(500), ...ContactTravelFieldsSchema.shape,
});
export const CreateContactSchema = contactFields.strict().refine(value => value.phone || value.email, { message: 'Provide a phone number or email address', path: ['phone'] });
export const UpdateContactSchema = contactFields.partial().extend({ expectedUpdatedAt: z.string().datetime().optional() }).strict();
export type ContactTravelFields = z.infer<typeof ContactTravelFieldsSchema>;

export function contactValuesFromForm(form: FormData) {
  const adults = String(form.get('numberOfAdults') ?? '').trim();
  const children = String(form.get('numberOfChildren') ?? '').trim();
  let rawMonth = String(form.get('preferredTravelMonth') ?? '').trim();
  if (/^(0[1-9]|1[0-2])\/[1-9]\d{3}$/.test(rawMonth)) {
    const [mm, yyyy] = rawMonth.split('/');
    rawMonth = `${yyyy}-${mm}`;
  }
  return {
    name: String(form.get('name') ?? ''),
    phone: String(form.get('phone') ?? ''),
    email: String(form.get('email') ?? ''),
    destination: String(form.get('destination') ?? ''),
    preferredTravelMonth: rawMonth,
    tourType: String(form.get('tourType') ?? ''),
    numberOfAdults: adults === '' ? null : Number(adults),
    numberOfChildren: children === '' ? null : Number(children),
    specialRequirements: String(form.get('specialRequirements') ?? ''),
    city: String(form.get('city') ?? ''),
    company: String(form.get('company') ?? ''),
    notes: String(form.get('notes') ?? ''),
  };
}
export function formatTravelMonth(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}-01T00:00:00Z`));
}

export function formatMonthYearInput(value?: string | null): string {
  if (!value) return '';
  const match = value.match(/^([1-9]\d{3})-(0[1-9]|1[0-2])$/);
  if (match) {
    return `${match[2]}/${match[1]}`;
  }
  return value;
}

export function getUpcomingTravelMonths(count: number = 24, existingValue?: string | null): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [];
  const now = new Date();
  let currentYear = now.getFullYear();
  let currentMonth = now.getMonth() + 1; // 1-12

  const seen = new Set<string>();

  if (existingValue && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(existingValue)) {
    options.push({ value: existingValue, label: formatTravelMonth(existingValue) });
    seen.add(existingValue);
  }

  for (let i = 0; i < count; i++) {
    const ym = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    if (!seen.has(ym)) {
      options.push({
        value: ym,
        label: formatTravelMonth(ym),
      });
      seen.add(ym);
    }
    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
  }

  return options.sort((a, b) => a.value.localeCompare(b.value));
}
