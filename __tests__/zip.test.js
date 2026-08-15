import { lookupZip } from '../src/lib/zip';

// lookupZip calls the free Zippopotam.us API via global fetch. We mock fetch so
// the test is fast and offline.
describe('lookupZip', () => {
  afterEach(() => { delete global.fetch; });

  test('rejects non-5-digit input without hitting the network', async () => {
    global.fetch = jest.fn();
    expect(await lookupZip('123')).toBeNull();
    expect(await lookupZip('abcde')).toBeNull();
    expect(await lookupZip('')).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('returns city / state for a valid ZIP', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        'post code': '43215',
        places: [{ 'place name': 'Columbus', 'state abbreviation': 'OH' }],
      }),
    });
    const r = await lookupZip('43215');
    expect(r).toMatchObject({ zip: '43215', state: 'OH', city: 'Columbus' });
  });

  test('returns null when the API responds not-ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    expect(await lookupZip('00000')).toBeNull();
  });

  test('returns null when the network throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    expect(await lookupZip('43215')).toBeNull();
  });
});
