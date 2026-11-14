import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';

vi.mock('@/lib/deepseek', () => ({ generateItineraryFromTranscript: vi.fn(), reviseItineraryWithDeepSeek: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendCustomerItineraryEmail: vi.fn().mockResolvedValue({ success: true, id: 'test-email' }), sendSupplierRfqEmail: vi.fn() }));
import { db } from '@/lib/db';
import { signAccessToken } from '@/lib/auth-tokens';
import { ItineraryError } from '@/lib/itinerary-content';
import { generateItineraryFromTranscript, reviseItineraryWithDeepSeek } from '@/lib/deepseek';
import { POST as generate } from '@/app/api/v1/leads/generate/route';
import { PATCH as patch } from '@/app/api/v1/leads/[id]/route';
import { POST as revise } from '@/app/api/v1/leads/[id]/revise/route';
import { GET as pdf } from '@/app/api/v1/leads/[id]/pdf/route';

// The validation runner opts in using a disposable PostgreSQL schema.
describe.skipIf(!process.env.ITINERARY_TEST_DATABASE)('Itinerary persistence with PostgreSQL and real API authentication', () => {
  let organizationId: string;
  let userId: string;
  let callId: string;
  let leadId: string;
  let token: string;
  const programme = 'Morning: Explore the proposed heritage route with time for photographs and a museum visit. Afternoon: Continue to the waterfront before returning at a relaxed pace. Evening: Independent dining near the accommodation; all proposed services require confirmation.';
  const itinerary = Array.from({ length: 5 }, (_, i) => `Day ${i + 1}: Proposed Malaysia and Singapore programme\n${programme}`).join('\n');
  const request = (path: string, body?: object, method = 'POST') => new NextRequest(`http://localhost:3000/api/v1/leads/${path}`, {
    method: body ? method : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const context = () => ({ params: Promise.resolve({ id: leadId }) });
  beforeAll(async () => {
    const suffix = randomUUID();
    organizationId = (await db.organization.create({ data: { name: 'Itinerary regression test', slug: `itinerary-${suffix}` } })).id;
    const user = await db.user.create({ data: { name: 'Test agent', email: `${suffix}@example.test`, passwordHash: 'unused-test-hash' } });
    userId = user.id;
    await db.membership.create({ data: { organizationId, userId, role: 'operator' } });
    token = await signAccessToken({ userId, organizationId, email: user.email, role: 'operator' });
    callId = (await db.call.create({ data: { organizationId, plivoCallUuid: suffix, direction: 'outbound', from: '+10000000000', to: '+10000000001', status: 'completed' } })).id;
    await db.transcription.create({ data: { organizationId, callId, status: 'completed', text: 'Malaysia and Singapore for five days, two adults and one child.' } });
    vi.mocked(generateItineraryFromTranscript).mockResolvedValue({ title: '5-Day Malaysia and Singapore', destination: 'Malaysia and Singapore', itinerary, durationDays: 5 });
  });
  afterAll(async () => {
    if (organizationId) await db.organization.delete({ where: { id: organizationId } });
    if (userId) await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  });

  it('persists complete generation, returns it to the dashboard and creates a real PDF from the same content', async () => {
    const response = await generate(request('generate', { callId, destination: 'Malaysia and Singapore', durationDays: 5, departureDate: '2027-02-20', returnDate: '2027-02-24', headcountAdults: 2, headcountChildren: 1 }));
    expect(response.status).toBe(201);
    const body = await response.json();
    leadId = body.lead.id;
    expect(body.lead.itinerary).toBe(itinerary);
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).itinerary).toBe(itinerary);
    const downloaded = await pdf(request(`${leadId}/pdf`), context());
    expect(downloaded.status).toBe(200);
    expect((await PDFDocument.load(await downloaded.arrayBuffer())).getPageCount()).toBeGreaterThanOrEqual(6);
  });

  it('blocks a stale PDF after parameter changes and preserves data on failed regeneration', async () => {
    expect((await patch(request(leadId, { destination: 'Dubai' }, 'PATCH'), context())).status).toBe(200);
    expect((await pdf(request(`${leadId}/pdf`), context())).status).toBe(422);
    const before = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
    vi.mocked(generateItineraryFromTranscript).mockRejectedValueOnce(new ItineraryError('Provider unavailable', 502));
    const response = await patch(request(leadId, { destination: 'Paris', regenerateItinerary: true }, 'PATCH'), context());
    expect(response.status).toBe(502);
    expect(await db.lead.findUniqueOrThrow({ where: { id: leadId } })).toEqual(before);
  });

  it('recovers the existing lead through regeneration and preserves successful content after a failed revision', async () => {
    const regenerated = await patch(request(leadId, { destination: 'Malaysia and Singapore', regenerateItinerary: true }, 'PATCH'), context());
    expect(regenerated.status).toBe(200);
    expect((await pdf(request(`${leadId}/pdf`), context())).status).toBe(200);
    const before = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
    vi.mocked(reviseItineraryWithDeepSeek).mockRejectedValueOnce(new ItineraryError('Provider unavailable', 502));
    expect((await revise(request(`${leadId}/revise`, { revisionNotes: 'Change day two' }), context())).status).toBe(502);
    expect(await db.lead.findUniqueOrThrow({ where: { id: leadId } })).toEqual(before);
  });
});
