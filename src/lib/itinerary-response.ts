/** Read API responses without exposing a proxy's HTML page to the operator. */
export async function readItineraryResponse<T extends object = Record<string, unknown>>(response: Response): Promise<T> {
  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    if ([408, 504, 524].includes(response.status)) {
      throw new Error('The itinerary request timed out. Your inputs are still here. Check Leads & Itineraries before retrying; generation may still finish on the server.');
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error('Your session could not be authorized. Sign in again before retrying.');
    }
    throw new Error(`The itinerary service returned an unexpected response (HTTP ${response.status}). Your changes have not been confirmed. Please try again shortly.`);
  }
  if (!response.ok) {
    const error = data && typeof data === 'object' && 'error' in data ? data.error : undefined;
    throw new Error(typeof error === 'string' ? error : `The itinerary request failed (HTTP ${response.status}). Please try again.`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('The itinerary service returned an invalid response. Your changes have not been confirmed.');
  }
  return data as T;
}
