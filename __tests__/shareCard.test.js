// Hosting the act card so it renders inside an email instead of arriving as an
// attachment. These guard the pure pieces: byte conversion, storage paths,
// escaping, and the HTML body — plus the upload's failure behaviour.
import {
  base64ToBytes,
  buildCardFileName,
  buildShareEmailHtml,
  escapeHtml,
  uploadShareCard,
  SHARE_CARD_BUCKET,
  SHARE_CARD_PREFIX,
} from '../src/lib/shareCard';

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const asString = (bytes) => Buffer.from(bytes).toString('utf8');

describe('base64ToBytes', () => {
  test('round-trips text of every padding length', () => {
    for (const s of ['a', 'ab', 'abc', 'abcd', 'hello world', '30 Acts']) {
      expect(asString(base64ToBytes(b64(s)))).toBe(s);
    }
  });

  test('round-trips binary bytes', () => {
    const raw = Uint8Array.from([0, 1, 127, 128, 200, 255, 42]);
    const encoded = Buffer.from(raw).toString('base64');
    expect(Array.from(base64ToBytes(encoded))).toEqual(Array.from(raw));
  });

  test('tolerates whitespace and newlines in the input', () => {
    const withBreaks = b64('hello world').replace(/(.{4})/g, '$1\n');
    expect(asString(base64ToBytes(withBreaks))).toBe('hello world');
  });

  test('empty and nullish inputs give an empty array, not a crash', () => {
    for (const v of ['', null, undefined]) {
      expect(base64ToBytes(v).byteLength).toBe(0);
    }
  });

  test('byte length is exact — a wrong length corrupts the JPEG', () => {
    expect(base64ToBytes(b64('abc')).byteLength).toBe(3);
    expect(base64ToBytes(b64('ab')).byteLength).toBe(2);
    expect(base64ToBytes(b64('a')).byteLength).toBe(1);
  });
});

describe('buildCardFileName', () => {
  test('lands under the share-cards prefix, not loose in the bucket', () => {
    expect(buildCardFileName({ dayNumber: 7 })).toMatch(
      new RegExp(`^${SHARE_CARD_PREFIX}/`),
    );
  });

  test('carries the day number and ends in .jpg', () => {
    const n = buildCardFileName({ dayNumber: 12, now: 1000, salt: 'abc' });
    expect(n).toBe(`${SHARE_CARD_PREFIX}/day12-1000-abc.jpg`);
  });

  test('two cards in the same millisecond do not collide', () => {
    const a = buildCardFileName({ dayNumber: 1, now: 1000 });
    const b = buildCardFileName({ dayNumber: 1, now: 1000 });
    expect(a).not.toBe(b);
  });

  test('missing day number does not produce "dayundefined"', () => {
    expect(buildCardFileName({})).toMatch(/day0-/);
  });
});

describe('escapeHtml', () => {
  test('neutralises markup', () => {
    expect(escapeHtml('<script>x</script>')).toBe(
      '&lt;script&gt;x&lt;/script&gt;',
    );
  });
  test('escapes quotes so an attribute cannot be broken out of', () => {
    expect(escapeHtml('a"b\'c')).toBe('a&quot;b&#39;c');
  });
  test('nullish becomes empty, never "null"', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('buildShareEmailHtml', () => {
  const imageUrl = 'https://example.supabase.co/storage/v1/object/public/act-media/share-cards/day7-1.jpg';
  const inviteUrl = 'https://alrpa.app.link/abc123';

  test('embeds the picture as an img tag — this is the whole point', () => {
    const html = buildShareEmailHtml({ imageUrl, inviteUrl });
    expect(html).toContain('<img');
    expect(html).toContain(imageUrl);
  });

  test('includes a tappable link for readers who cannot scan the QR', () => {
    const html = buildShareEmailHtml({ imageUrl, inviteUrl });
    expect(html).toContain(`href="${inviteUrl}"`);
  });

  test('works without an invite url', () => {
    const html = buildShareEmailHtml({ imageUrl });
    expect(html).toContain('<img');
    expect(html).not.toContain('href=');
  });

  test('returns empty when there is no image — never a broken img tag', () => {
    expect(buildShareEmailHtml({ imageUrl: '', inviteUrl })).toBe('');
    expect(buildShareEmailHtml({})).toBe('');
  });

  test('never emits a data: URI — email clients strip those', () => {
    const html = buildShareEmailHtml({ imageUrl, inviteUrl });
    expect(html).not.toContain('data:image');
  });

  test('has alt text', () => {
    expect(buildShareEmailHtml({ imageUrl })).toContain('alt=');
  });
});

describe('uploadShareCard', () => {
  const makeSupabase = (overrides = {}) => ({
    storage: {
      from: jest.fn(() => ({
        upload: overrides.upload || jest.fn().mockResolvedValue({ error: null }),
        getPublicUrl: overrides.getPublicUrl
          || jest.fn(() => ({ data: { publicUrl: 'https://cdn/x.jpg' } })),
      })),
    },
  });

  test('uploads to the act-media bucket and returns the public url', async () => {
    const supabase = makeSupabase();
    const url = await uploadShareCard({
      supabase,
      readBase64: async () => b64('jpeg-bytes'),
      uri: 'file:///card.jpg',
      dayNumber: 7,
    });
    expect(url).toBe('https://cdn/x.jpg');
    expect(supabase.storage.from).toHaveBeenCalledWith(SHARE_CARD_BUCKET);
  });

  test('sends image/jpeg content type', async () => {
    const upload = jest.fn().mockResolvedValue({ error: null });
    await uploadShareCard({
      supabase: makeSupabase({ upload }),
      readBase64: async () => b64('x'),
      uri: 'file:///card.jpg',
    });
    expect(upload.mock.calls[0][2]).toMatchObject({ contentType: 'image/jpeg' });
  });

  test('an upload error returns null rather than throwing', async () => {
    const upload = jest.fn().mockResolvedValue({ error: new Error('nope') });
    const url = await uploadShareCard({
      supabase: makeSupabase({ upload }),
      readBase64: async () => b64('x'),
      uri: 'file:///card.jpg',
    });
    expect(url).toBeNull();
  });

  test('a read failure returns null rather than throwing', async () => {
    const url = await uploadShareCard({
      supabase: makeSupabase(),
      readBase64: async () => { throw new Error('unreadable'); },
      uri: 'file:///card.jpg',
    });
    expect(url).toBeNull();
  });

  test('an empty file returns null instead of uploading zero bytes', async () => {
    const upload = jest.fn();
    const url = await uploadShareCard({
      supabase: makeSupabase({ upload }),
      readBase64: async () => '',
      uri: 'file:///card.jpg',
    });
    expect(url).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });

  test('missing arguments return null', async () => {
    expect(await uploadShareCard({})).toBeNull();
    expect(await uploadShareCard({ supabase: makeSupabase(), uri: 'x' })).toBeNull();
  });
});
