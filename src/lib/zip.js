import { STATE_IANA_TZ } from '../constants';

/**
 * Look up state (2-letter code) and city for a given US ZIP code using
 * the free, no-key Zippopotam.us API. Returns null if the ZIP isn't found
 * or the request fails.
 *
 * Response shape from API:
 *   { "post code": "43215", "country": "United States",
 *     "places": [{ "place name": "Columbus", "state abbreviation": "OH", ... }] }
 */
export async function lookupZip(zip) {
  const clean = (zip || '').trim();
  if (!/^\d{5}$/.test(clean)) return null;

  try {
    const res = await fetch(`https://api.zippopotam.us/us/${clean}`);
    if (!res.ok) return null;
    const data = await res.json();
    const place = data?.places?.[0];
    if (!place) return null;
    const stateCode = place['state abbreviation'];
    const city      = place['place name'];
    const timezone  = STATE_IANA_TZ[stateCode] || null;
    return { zip: clean, state: stateCode, city, timezone };
  } catch (e) {
    console.warn('ZIP lookup failed:', e.message);
    return null;
  }
}