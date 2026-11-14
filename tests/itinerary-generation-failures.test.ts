import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: { itineraryRule: { findMany: vi.fn().mockResolvedValue([]) } } }));
vi.mock('@/lib/integrations/credentials-manager', () => ({ getTenantIntegration: vi.fn() }));
import { getTenantIntegration } from '@/lib/integrations/credentials-manager';
import { generateItineraryFromTranscript, reviseItineraryWithDeepSeek, extractTripParametersFromTranscript } from '@/lib/deepseek';

const programme = 'Morning: Explore the heritage district with time to visit the museum and pause for lunch at a restaurant of your choice. Afternoon: Continue on foot through the waterfront, allowing time for photographs and a relaxed return. Evening: Free time near your accommodation; all arrangements remain proposed until confirmed.';
const itinerary = Array.from({ length: 5 }, (_, index) => `### Day ${index + 1}: Proposed programme\n${programme}`).join('\n\n');
const params = { destination: 'Malaysia and Singapore', durationDays: 5, headcountAdults: 2, headcountChildren: 1 };
const complete = { title: '5-Day Malaysia and Singapore', destination: params.destination, itinerary };
const completion = (value: unknown, finish_reason = 'stop') => new Response(JSON.stringify({ choices: [{ finish_reason, message: { content: typeof value === 'string' ? value : JSON.stringify(value) } }] }), { status: 200 });
const fetchMock = vi.fn();
const generate = () => generateItineraryFromTranscript('', undefined, 'org-a', params);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('DEEPSEEK_API_KEY', '');
  vi.stubEnv('OPENAI_API_KEY', '');
  vi.mocked(getTenantIntegration).mockImplementation(async (_org, provider) => provider === 'deepseek' ? { credentials: { apiKey: 'test-key' }, metadata: {} } as any : null);
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Itinerary generation failures and recovery', () => {
  it.each([
    ['28 December 2026, Singapore for 4 days', '2026-12-28'],
    ['28 டிசம்பர் 2026 சிங்கப்பூர் 4 டேஸ்', '2026-12-28'],
    ['December 28, 2026, Singapore for 4 days', '2026-12-28'],
    ['Singapore in December', ''],
    ['Singapore during Pongal', ''],
    ['Singapore, then take decisions about travel', ''],
  ])('extracts only supported dates from %s', async (transcript, expected) => {
    vi.mocked(getTenantIntegration).mockResolvedValue(null);
    const extracted = await extractTripParametersFromTranscript(transcript, { referenceDate: '2026-10-31' }, 'org-a');
    expect(extracted.departureDate).toBe(expected);
  });

  it('keeps combined destinations and leaves ambiguous duration and guest names unfilled', async () => {
    vi.mocked(getTenantIntegration).mockResolvedValue(null);
    const extracted = await extractTripParametersFromTranscript('Malaysia and Singapore, five flights, a family of 4. Email alex123@example.com.', undefined, 'org-a');
    expect(extracted.destination).toBe('Malaysia and Singapore');
    expect(extracted.durationDays).toBeUndefined();
    expect(extracted.headcountAdults).toBeUndefined();
    expect(extracted.headcountChildren).toBeUndefined();
    expect(extracted.customerName).toBe('');
    expect(extracted.customerEmail).toBe('alex123@example.com');
  });

  it('reports missing provider configuration', async () => {
    vi.mocked(getTenantIntegration).mockResolvedValue(null);
    await expect(generate()).rejects.toMatchObject({ status: 503, code: 'ai_not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires destination and duration instead of inventing defaults', async () => {
    await expect(generateItineraryFromTranscript('', undefined, 'org-a', {})).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 403, 429, 500, 503])('fails explicitly on provider HTTP %i', async status => {
    fetchMock.mockImplementation(async () => new Response('failure', { status }));
    await expect(generate()).rejects.toMatchObject({ code: 'itinerary_generation_failed', status: 502 });
    expect(fetchMock).toHaveBeenCalledTimes(status >= 429 ? 2 : 1);
  });

  it.each([
    ['malformed JSON', '{broken'], ['empty itinerary', { itinerary: '' }],
    ['wrong type', { itinerary: [] }], ['no days', { itinerary: '# Proposal\nSummary only' }],
    ['missing days', { itinerary: `Day 1: Arrival\n${programme}` }],
    ['sparse programme', { itinerary: Array.from({ length: 5 }, (_, i) => `Day ${i + 1}: Trip\nVisit the museum.`).join('\n') }],
  ])('rejects %s instead of returning an empty success', async (_label, response) => {
    fetchMock.mockImplementation(async () => completion(response));
    await expect(generate()).rejects.toMatchObject({ status: 502 });
  });

  it('rejects truncated completions even when their JSON is valid', async () => {
    fetchMock.mockImplementation(async () => completion(complete, 'length'));
    await expect(generate()).rejects.toMatchObject({ status: 502 });
  });

  it('reports repeated timeouts and network errors', async () => {
    fetchMock.mockRejectedValue(new DOMException('Timed out', 'TimeoutError'));
    await expect(generate()).rejects.toMatchObject({ status: 502 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a transient provider failure and preserves confirmed parameters', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(completion({ ...complete, title: '99-Day Journey' }));
    const result = await generate();
    expect(result.itinerary).toBe(itinerary);
    expect(result.durationDays).toBe(5);
    expect(result.destination).toBe(params.destination);
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.messages[0].content).toContain('100-180 words');
    expect(body.messages[0].content).toContain('Never invent confirmed');
  });

  it('uses the tenant secondary provider and its custom base URL after failure', async () => {
    vi.mocked(getTenantIntegration).mockImplementation(async (_org, provider) => ({ credentials: { apiKey: `${provider}-key` }, metadata: provider === 'openai' ? { baseUrl: 'https://tenant-ai.example/v1', model: 'gpt-4o-transcribe' } : {} }) as any);
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 })).mockResolvedValueOnce(completion(complete));
    expect((await generate()).itinerary).toBe(itinerary);
    expect(fetchMock.mock.calls[1][0]).toBe('https://tenant-ai.example/v1/chat/completions');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe('gpt-4o-mini');
  });

  it('fails revisions explicitly and never returns unchanged text as a successful revision', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 401 }));
    await expect(reviseItineraryWithDeepSeek(itinerary, 'Change day 2', 'org-a')).rejects.toMatchObject({ status: 502 });
    await expect(reviseItineraryWithDeepSeek('', 'Change day 2', 'org-a')).rejects.toThrow('Generate an itinerary');
  });
});
