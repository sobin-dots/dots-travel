import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ db: {
  lead: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  call: { findFirst: vi.fn() }, contact: { findFirst: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() }, customerQuotation: { findFirst: vi.fn() },
} }));
vi.mock('@/lib/api-auth', () => ({ authenticateRequest: vi.fn().mockResolvedValue({ auth: { organizationId: 'org-a', userId: 'user-a', role: 'operator' } }), logAuditEvent: vi.fn() }));
vi.mock('@/lib/deepseek', () => ({ generateItineraryFromTranscript: vi.fn(), reviseItineraryWithDeepSeek: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendCustomerItineraryEmail: vi.fn(), sendSupplierRfqEmail: vi.fn() }));

import { db } from '@/lib/db';
import { generateItineraryFromTranscript, reviseItineraryWithDeepSeek } from '@/lib/deepseek';
import { sendCustomerItineraryEmail, sendSupplierRfqEmail } from '@/lib/email';
import { ItineraryError } from '@/lib/itinerary-content';
import { POST as generate } from '@/app/api/v1/leads/generate/route';
import { PATCH as update } from '@/app/api/v1/leads/[id]/route';
import { POST as revise } from '@/app/api/v1/leads/[id]/revise/route';
import { GET as pdf } from '@/app/api/v1/leads/[id]/pdf/route';
import { POST as send } from '@/app/api/v1/leads/[id]/send/route';
import { GET as quotePdf } from '@/app/api/v1/leads/[id]/quotation-pdf/route';
import { POST as sendQuote } from '@/app/api/v1/leads/[id]/send-quotation/route';

const programme = 'Morning: Explore the proposed heritage route at a relaxed pace with time for the museum. Afternoon: Continue to the waterfront and pause for photographs before returning to the accommodation. Evening: Free time for independent dining; services remain subject to confirmation.';
const itinerary = Array.from({ length: 5 }, (_, i) => `Day ${i + 1}: Proposed programme\n${programme}`).join('\n');
const result = { title: 'Malaysia and Singapore', destination: 'Malaysia and Singapore', itinerary, durationDays: 5 };
const call = { id: 'call-a', direction: 'outbound', to: '+910000000000', transcriptions: [{ status: 'completed', text: 'Malaysia and Singapore for 5 days', createdAt: new Date() }] };
const lead = { id: 'lead-a', organizationId: 'org-a', callId: 'call-a', title: result.title, destination: result.destination, itinerary, durationDays: 5, metadata: { currency: 'INR', custom: 'retained' }, headcountAdults: 2, headcountChildren: 1, headcountInfants: 0, departureDate: new Date('2027-02-20'), returnDate: new Date('2027-02-24'), organization: { name: 'Agency' } };
const context = { params: Promise.resolve({ id: lead.id }) };
const req = (path: string, body?: object, method = 'POST') => new NextRequest(`http://localhost:3000/api/v1/leads/${path}`, { method: body ? method : 'GET', ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.lead.findFirst).mockResolvedValue(lead as any);
  vi.mocked(db.lead.update).mockImplementation((({ data }: any) => Promise.resolve({ ...lead, ...data })) as any);
  vi.mocked(db.lead.create).mockImplementation((({ data }: any) => Promise.resolve({ id: 'lead-new', ...data })) as any);
  vi.mocked(db.call.findFirst).mockResolvedValue(call as any);
  vi.mocked(db.contact.findFirst).mockResolvedValue(null);
  vi.mocked(db.user.findUnique).mockResolvedValue({ name: 'Agent' } as any);
  vi.mocked(generateItineraryFromTranscript).mockResolvedValue(result);
  vi.mocked(reviseItineraryWithDeepSeek).mockResolvedValue(itinerary);
});

describe('Itinerary API persistence and dispatch', () => {
  it('returns the generation error without creating or overwriting a lead', async () => {
    vi.mocked(generateItineraryFromTranscript).mockRejectedValue(new ItineraryError('AI unavailable', 502));
    const response = await generate(req('generate', { callId: call.id, destination: result.destination, durationDays: 5 }));
    expect(response.status).toBe(502);
    expect(db.lead.create).not.toHaveBeenCalled();
    expect(db.lead.update).not.toHaveBeenCalled();
  });

  it('defensively rejects empty generation output before persistence', async () => {
    vi.mocked(generateItineraryFromTranscript).mockResolvedValue({ ...result, itinerary: '' });
    expect((await generate(req('generate', { callId: call.id }))).status).toBe(422);
    expect(db.lead.update).not.toHaveBeenCalled();
    expect(db.lead.create).not.toHaveBeenCalled();
  });

  it('saves a complete itinerary against the authenticated organization and returns its exact content', async () => {
    const response = await generate(req('generate', { callId: call.id }));
    expect(response.status).toBe(201);
    expect((await response.json()).lead.itinerary).toBe(itinerary);
    expect(db.call.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: call.id, organizationId: 'org-a' } }));
    expect(db.lead.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ itinerary }) }));
  });

  it('coalesces concurrent identical requests before the call lookup finishes', async () => {
    let release!: (value: any) => void;
    vi.mocked(db.call.findFirst).mockReturnValueOnce(new Promise(resolve => { release = resolve; }) as any);
    const first = generate(req('generate', { callId: call.id }));
    await vi.waitFor(() => expect(db.call.findFirst).toHaveBeenCalledTimes(1));
    const second = generate(req('generate', { callId: call.id }));
    const conflict = await generate(req('generate', { callId: call.id, destination: 'Dubai', durationDays: 5 }));
    expect(conflict.status).toBe(409);
    release(call);
    const responses = await Promise.all([first, second]);
    expect(responses.map(response => response.status)).toEqual([201, 201]);
    expect(generateItineraryFromTranscript).toHaveBeenCalledTimes(1);
    expect(db.lead.update).toHaveBeenCalledTimes(1);
  });

  it('marks changed parameters stale when they are saved without regeneration', async () => {
    const response = await update(req(lead.id, { destination: 'Dubai' }, 'PATCH'), context);
    expect(response.status).toBe(200);
    expect((await response.json()).lead.metadata).toMatchObject({ itineraryNeedsRegeneration: true, custom: 'retained' });
  });

  it('regenerates existing empty itineraries and saves content and parameters together', async () => {
    vi.mocked(db.lead.findFirst).mockResolvedValue({ ...lead, itinerary: '' } as any);
    const response = await update(req(lead.id, { destination: lead.destination, durationDays: 5, regenerateItinerary: true }, 'PATCH'), context);
    expect(response.status).toBe(200);
    expect((await response.json()).lead).toMatchObject({ itinerary, metadata: { itineraryNeedsRegeneration: false, custom: 'retained' } });
    expect(generateItineraryFromTranscript).toHaveBeenCalledWith(call.transcriptions[0].text, expect.any(Object), 'org-a', expect.objectContaining({ durationDays: 5, destination: lead.destination }));
  });

  it('preserves both saved parameters and programme if regeneration fails', async () => {
    vi.mocked(generateItineraryFromTranscript).mockRejectedValue(new ItineraryError('AI unavailable', 502));
    const response = await update(req(lead.id, { destination: 'Dubai', regenerateItinerary: true }, 'PATCH'), context);
    expect(response.status).toBe(502);
    expect(db.lead.update).not.toHaveBeenCalled();
  });

  it('preserves the saved programme and notes if revision fails', async () => {
    vi.mocked(reviseItineraryWithDeepSeek).mockRejectedValue(new ItineraryError('AI unavailable', 502));
    expect((await revise(req(`${lead.id}/revise`, { revisionNotes: 'Change day 2' }), context)).status).toBe(502);
    expect(db.lead.update).not.toHaveBeenCalled();
  });

  it('synchronizes duration and return date after a plain-heading single-day revision', async () => {
    vi.mocked(reviseItineraryWithDeepSeek).mockResolvedValue(`Day 1: Proposed programme\n${programme}`);
    const response = await revise(req(`${lead.id}/revise`, { revisionNotes: 'Reduce to a single day' }), context);
    expect(response.status).toBe(200);
    expect((await response.json()).lead).toMatchObject({ durationDays: 1, returnDate: '2027-02-20T00:00:00.000Z' });
  });

  it('rejects stale AI results when another update wins during generation', async () => {
    vi.mocked(db.lead.update).mockRejectedValueOnce({ code: 'P2025' });
    const response = await update(req(lead.id, { regenerateItinerary: true }, 'PATCH'), context);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('Reload');
  });

  it('never creates a quotation PDF from a target budget when no customer quote exists', async () => {
    vi.mocked(db.customerQuotation.findFirst).mockResolvedValue(null);
    const responses = await Promise.all([quotePdf(req(`${lead.id}/quotation-pdf`), context), sendQuote(req(`${lead.id}/send-quotation`, {}), context)]);
    expect(responses.map(response => response.status)).toEqual([422, 422]);
    expect(sendCustomerItineraryEmail).not.toHaveBeenCalled();
  });

  it.each(['empty', 'incomplete', 'stale'])('blocks every itinerary PDF and email path for %s data before side effects', async state => {
    vi.mocked(db.lead.findFirst).mockResolvedValue({ ...lead, itinerary: state === 'empty' ? '' : state === 'incomplete' ? `Day 1: Programme\n${programme}` : itinerary, metadata: { itineraryNeedsRegeneration: state === 'stale' } } as any);
    const responses = await Promise.all([
      pdf(req(`${lead.id}/pdf`), context),
      send(req(`${lead.id}/send`, { target: 'customer', customerEmail: 'client@example.com' }), context),
      quotePdf(req(`${lead.id}/quotation-pdf`), context),
      sendQuote(req(`${lead.id}/send-quotation`, {}), context),
    ]);
    expect(responses.map(response => response.status)).toEqual([422, 422, 422, 422]);
    expect(sendCustomerItineraryEmail).not.toHaveBeenCalled();
    expect(sendSupplierRfqEmail).not.toHaveBeenCalled();
    expect(db.lead.update).not.toHaveBeenCalled();
  });
});
