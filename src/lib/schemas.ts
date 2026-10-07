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


