import { z } from 'zod';

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  totpCode: z.string().optional(),
});

export const RefreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(10),
});

export const CreateCallRequestSchema = z.object({
  phoneNumberId: z.string().uuid(),
  to: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Destination must be a valid E.164 phone number'),
  mode: z.enum(['xml', 'forward', 'url', 'voicemail', 'bridge']).default('bridge'),
  xml: z.string().optional(),
  forwardTo: z.string().optional(),
  url: z.string().url().optional(),
  record: z.boolean().default(false),
  transcribe: z.boolean().default(false),
  transcriptionLanguage: z.string().default('en-US'),
  machineDetection: z.boolean().default(false),
  timeLimit: z.number().int().min(1).max(14400).default(14400),
});

export const SendMessageRequestSchema = z.object({
  phoneNumberId: z.string().uuid(),
  to: z.array(z.string().regex(/^\+[1-9]\d{1,14}$/, 'Must be E.164 number')).min(1).max(50),
  text: z.string().min(1).max(1600),
  mediaIds: z.array(z.string()).max(10).optional(),
  statusCallbackUrl: z.string().url().optional(),
});

export const BuyNumberRequestSchema = z.object({
  countryIso: z.string().length(2).toUpperCase(),
  e164: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Must be E.164 number'),
  applicationId: z.string().uuid().optional(),
  cnam: z.enum(['enabled', 'disabled']).optional(),
  complianceApplicationId: z.string().optional(),
});

export const UpdatePhoneNumberSchema = z.object({
  friendlyName: z.string().optional(),
  recordCalls: z.boolean().optional(),
  recordChannelType: z.enum(['mono', 'stereo']).optional(),
  transcribeEnabled: z.boolean().optional(),
  transcriptionLanguage: z.string().optional(),
  voicemailEnabled: z.boolean().optional(),
  forwardTo: z.string().nullable().optional(),
  machineDetection: z.boolean().optional(),
});

export const UpdateSettingsSchema = z.object({
  organizationName: z.string().min(2, 'Organization name must be at least 2 characters').max(100).optional(),
  name: z.string().min(2).max(100).optional(),
  address: z.string().max(1000).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  website: z.string().max(200).nullable().optional(),
  logoUrl: z.string().max(5000000).nullable().optional(),
  letterheadUrl: z.string().max(5000000).nullable().optional(),
  letterheadText: z.string().max(1000).nullable().optional(),
  brandColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Invalid hex color code (e.g. #ed1b24)').nullable().optional(),
  transcriptionDefaultEnabled: z.boolean().optional(),
  transcriptionLanguage: z.string().optional(),
  recordingRetentionDays: z.number().int().nullable().optional(),
  notificationEmail: z.string().email().nullable().optional(),
  redactMessageContent: z.boolean().optional(),
  plivoAuthId: z.string().optional(),
  plivoAuthToken: z.string().optional(),
});

export const SignupRequestSchema = z.object({
  organizationName: z.string().min(2, 'Organization name must be at least 2 characters').max(100),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const CreateUserRequestSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['admin', 'operator', 'viewer']).default('operator'),
});

export const CreateContactRequestSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Phone must be a valid E.164 number (e.g. +14155550199)'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  company: z.string().max(100).optional().or(z.literal('')),
  notes: z.string().max(500).optional().or(z.literal('')),
});

export const CreateItineraryRuleSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters').max(150),
  description: z.string().max(1000).optional().nullable(),
  category: z.enum([
    'general',
    'pacing',
    'accommodation',
    'activities',
    'dining',
    'pricing',
    'transportation',
    'compliance',
  ]).default('general'),
  rulePrompt: z.string().min(5, 'Rule instruction must be at least 5 characters').max(10000),
  condition: z.string().max(200).optional().nullable(),
  priority: z.number().int().min(1).max(5).default(1),
  isActive: z.boolean().default(true),
});

export const UpdateItineraryRuleSchema = z.object({
  title: z.string().min(2).max(150).optional(),
  description: z.string().max(1000).optional().nullable(),
  category: z.enum([
    'general',
    'pacing',
    'accommodation',
    'activities',
    'dining',
    'pricing',
    'transportation',
    'compliance',
  ]).optional(),
  rulePrompt: z.string().min(5).max(10000).optional(),
  condition: z.string().max(200).optional().nullable(),
  priority: z.number().int().min(1).max(5).optional(),
  isActive: z.boolean().optional(),
});

export const GenerateItineraryRulesSchema = z.object({
  text: z.string().min(10, 'Please provide input text of at least 10 characters to generate rules').max(100000),
  autoSave: z.boolean().default(false),
  replaceExisting: z.boolean().default(false),
});

export const BatchCreateItineraryRulesSchema = z.object({
  rules: z.array(CreateItineraryRuleSchema).min(1, 'At least one rule is required'),
  replaceExisting: z.boolean().default(false),
});



