import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const openapiSpec = {
    openapi: '3.1.0',
    info: {
      title: 'Plivo Communications Platform API',
      version: '1.0.0',
      description:
        'Production-grade, multi-tenant telephony API for voice, messaging, number management, recordings, and transcriptions.',
      contact: {
        name: 'API Support',
        url: 'https://example.com',
      },
    },
    servers: [
      {
        url: '/api/v1',
        description: 'V1 API Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Obtain via POST /auth/token using email + password credentials.',
        },
      },
      schemas: {
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
            totpCode: { type: 'string' },
          },
        },
        TokenResponse: {
          type: 'object',
          properties: {
            api_id: { type: 'string' },
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
            tokenType: { type: 'string', example: 'Bearer' },
            expiresIn: { type: 'integer', example: 900 },
          },
        },
        CreateCallRequest: {
          type: 'object',
          required: ['phoneNumberId', 'to'],
          properties: {
            phoneNumberId: { type: 'string', format: 'uuid' },
            to: { type: 'string', example: '+14155550199' },
            mode: { type: 'string', enum: ['xml', 'forward', 'url', 'voicemail'], default: 'xml' },
            forwardTo: { type: 'string' },
            url: { type: 'string', format: 'uri' },
            record: { type: 'boolean', default: false },
            transcribe: { type: 'boolean', default: false },
            transcriptionLanguage: { type: 'string', default: 'en-US' },
            machineDetection: { type: 'boolean', default: false },
            timeLimit: { type: 'integer', default: 14400 },
          },
        },
        SendMessageRequest: {
          type: 'object',
          required: ['phoneNumberId', 'to', 'text'],
          properties: {
            phoneNumberId: { type: 'string', format: 'uuid' },
            to: { type: 'array', items: { type: 'string' }, example: ['+14155550199'] },
            text: { type: 'string' },
            mediaIds: { type: 'array', items: { type: 'string' } },
            statusCallbackUrl: { type: 'string', format: 'uri' },
          },
        },
        BuyNumberRequest: {
          type: 'object',
          required: ['countryIso', 'e164'],
          properties: {
            countryIso: { type: 'string', example: 'US' },
            e164: { type: 'string', example: '+14155552671' },
            applicationId: { type: 'string', format: 'uuid' },
            cnam: { type: 'string', enum: ['enabled', 'disabled'] },
            complianceApplicationId: { type: 'string' },
          },
        },
        StandardError: {
          type: 'object',
          properties: {
            api_id: { type: 'string' },
            error: { type: 'string' },
          },
        },
        TenantIntegrationItem: {
          type: 'object',
          properties: {
            provider: { type: 'string', example: 'openai' },
            category: { type: 'string', enum: ['transcription', 'intelligence', 'telephony'] },
            status: { type: 'string', enum: ['unverified', 'verified', 'failed'] },
            maskedDetails: { type: 'object' },
            lastVerifiedAt: { type: 'string', format: 'date-time', nullable: true },
            lastVerifyError: { type: 'string', nullable: true },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        SaveIntegrationRequest: {
          type: 'object',
          required: ['provider', 'credentials'],
          properties: {
            provider: { type: 'string', enum: ['openai', 'deepseek', 'plivo', 'msg91'] },
            credentials: {
              type: 'object',
              description: 'Provider-specific API keys and secrets. Stored encrypted with AES-256-GCM.',
            },
            skipTest: { type: 'boolean', default: false },
          },
        },
        CreateOrganizationRequest: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', example: 'Starlight Travel Group' },
            slug: { type: 'string', example: 'starlight-travel' },
            primaryTelephonyProvider: { type: 'string', enum: ['plivo', 'msg91'], default: 'plivo' },
          },
        },
        SwitchOrganizationRequest: {
          type: 'object',
          required: ['organizationId'],
          properties: {
            organizationId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
    paths: {
      '/auth/token': {
        post: {
          summary: 'Obtain JWT Access Token and Refresh Token',
          security: [],
          requestBody: {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } },
          },
          responses: {
            200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenResponse' } } } },
            401: { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardError' } } } },
          },
        },
      },
      '/auth/refresh': {
        post: {
          summary: 'Rotate Refresh Token',
          security: [],
          responses: {
            200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenResponse' } } } },
          },
        },
      },
      '/auth/me': {
        get: {
          summary: 'Get Current Authenticated User & Tenant Profile',
          responses: { 200: { description: 'User Profile' } },
        },
      },
      '/organizations': {
        get: {
          summary: 'List Tenant Organizations Accessible to Current User',
          responses: { 200: { description: 'List of tenant organizations with roles and primary providers' } },
        },
        post: {
          summary: 'Create New Tenant Organization',
          requestBody: {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateOrganizationRequest' } } },
          },
          responses: { 201: { description: 'Organization created successfully' } },
        },
      },
      '/organizations/switch': {
        post: {
          summary: 'Switch Active Tenant Organization Context',
          requestBody: {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SwitchOrganizationRequest' } } },
          },
          responses: {
            200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenResponse' } } } },
          },
        },
      },
      '/settings/integrations': {
        get: {
          summary: 'List Tenant BYOK 3rd-Party Integrations (Masked)',
          responses: { 200: { description: 'List of configured BYOK integrations and statuses' } },
        },
        post: {
          summary: 'Configure / Update BYOK 3rd-Party Integration Credentials',
          requestBody: {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SaveIntegrationRequest' } } },
          },
          responses: { 200: { description: 'Integration verified and saved with AES-256-GCM' } },
        },
      },
      '/settings/integrations/test': {
        post: {
          summary: 'Test BYOK Integration Credentials Live Without Saving',
          requestBody: {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SaveIntegrationRequest' } } },
          },
          responses: { 200: { description: 'Live test outcome' } },
        },
      },
      '/settings/integrations/{provider}': {
        delete: {
          summary: 'Remove BYOK Integration Credentials',
          parameters: [{ name: 'provider', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Integration removed' } },
        },
      },
      '/settings/primary-provider': {
        patch: {
          summary: 'Update Organization Primary Telephony Provider',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['provider'],
                  properties: { provider: { type: 'string', enum: ['plivo', 'msg91'] } },
                },
              },
            },
          },
          responses: { 200: { description: 'Primary telephony provider updated' } },
        },
      },
      '/numbers': {
        get: {
          summary: 'List Owned Phone Numbers',
          responses: { 200: { description: 'List of owned numbers' } },
        },
      },
      '/numbers/search': {
        get: {
          summary: 'Search Available Phone Numbers Inventory',
          parameters: [
            { name: 'country_iso', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'type', in: 'query', schema: { type: 'string' } },
            { name: 'prefix', in: 'query', schema: { type: 'string' } },
          ],
          responses: { 200: { description: 'Available numbers' } },
        },
      },
      '/numbers/buy': {
        post: {
          summary: 'Purchase Phone Number',
          requestBody: {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/BuyNumberRequest' } } },
          },
          responses: { 201: { description: 'Purchased number' } },
        },
      },
      '/calls': {
        get: {
          summary: 'List Call Logs',
          responses: { 200: { description: 'Call history list' } },
        },
        post: {
          summary: 'Make an Outbound Call',
          requestBody: {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateCallRequest' } } },
          },
          responses: { 201: { description: 'Call placed' } },
        },
      },
      '/calls/{id}': {
        get: {
          summary: 'Get Call Detail & Timeline',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Call detail' } },
        },
      },
      '/calls/{id}/live': {
        delete: {
          summary: 'Hang Up Live Call',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Call terminated' } },
        },
      },
      '/messages/send': {
        post: {
          summary: 'Send SMS / MMS',
          requestBody: {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SendMessageRequest' } } },
          },
          responses: { 201: { description: 'Message queued' } },
        },
      },
      '/messages/threads': {
        get: {
          summary: 'List Threaded Conversations',
          responses: { 200: { description: 'List of conversation threads' } },
        },
      },
      '/recordings': {
        get: {
          summary: 'List Audio Recordings',
          responses: { 200: { description: 'Recordings list with signed stream URLs' } },
        },
      },
      '/transcriptions': {
        get: {
          summary: 'List and Search Transcriptions',
          responses: { 200: { description: 'Transcripts list' } },
        },
      },
      '/settings': {
        get: { summary: 'Get Organization Settings' },
        patch: { summary: 'Update Organization Settings & Credentials' },
      },
      '/health': {
        get: { summary: 'Liveness Probe', security: [] },
      },
      '/ready': {
        get: { summary: 'Readiness Probe', security: [] },
      },
    },
  };

  return NextResponse.json(openapiSpec);
}
