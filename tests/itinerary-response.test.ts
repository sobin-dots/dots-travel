import { describe, expect, it } from 'vitest';
import { readItineraryResponse } from '@/lib/itinerary-response';

describe('Itinerary response handling', () => {
  it('reads a successful saved lead', async () => {
    const data = { lead: { id: 'lead-a', itinerary: 'Saved content' } };
    expect(await readItineraryResponse(Response.json(data))).toEqual(data);
  });

  it('preserves the API validation error', async () => {
    await expect(readItineraryResponse(Response.json({ error: 'Day 3 has no complete programme.' }, { status: 422 })))
      .rejects.toThrow('Day 3 has no complete programme.');
  });

  it.each([408, 504, 524])('explains an HTML timeout (%s) without leaking the page', async status => {
    await expect(readItineraryResponse(new Response('<html><h1>Gateway timeout</h1></html>', { status })))
      .rejects.toThrow('Check Leads & Itineraries before retrying');
  });

  it('handles HTML server errors and malformed success responses', async () => {
    await expect(readItineraryResponse(new Response('<html>Bad gateway</html>', { status: 502 })))
      .rejects.toThrow('unexpected response (HTTP 502)');
    await expect(readItineraryResponse(new Response(''))).rejects.toThrow('unexpected response');
    await expect(readItineraryResponse(Response.json(null))).rejects.toThrow('invalid response');
    await expect(readItineraryResponse(Response.json([]))).rejects.toThrow('invalid response');
  });

  it('explains authorization failures even when the server sends HTML', async () => {
    await expect(readItineraryResponse(new Response('<html>Unauthorized</html>', { status: 401 })))
      .rejects.toThrow('Sign in again');
  });
});
