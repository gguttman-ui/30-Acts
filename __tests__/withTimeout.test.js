// Bounding a promise that might never settle.
//
// The bug: a share handler sets `sharing = true`, awaits a native call, and
// clears the flag in a finally. If that call never settles the finally never
// runs, and every share button on the screen goes dead to taps with nothing on
// screen to explain it. Happened twice before this helper existed.
import {
  withTimeout,
  SHARE_SHEET_TIMEOUT_MS,
  CAPTURE_TIMEOUT_MS,
} from '../src/lib/withTimeout';

jest.useFakeTimers();

const flush = () => Promise.resolve().then(() => {});

describe('withTimeout', () => {
  test('passes through a value that arrives in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });

  test('passes through a rejection that arrives in time', async () => {
    await expect(withTimeout(Promise.reject(new Error('nope')), 1000))
      .rejects.toThrow('nope');
  });

  test('rejects once the limit passes — THE point of the helper', async () => {
    const forever = new Promise(() => {});          // never settles
    const guarded = withTimeout(forever, 1000, 'share sheet timed out');
    const assertion = expect(guarded).rejects.toThrow('share sheet timed out');
    jest.advanceTimersByTime(1000);
    await assertion;
  });

  test('a caller can always recover, so `finally` always runs', async () => {
    // This is the shape every share handler uses. If this test passes, the flag
    // is cleared even when the native call is lost.
    let sharing = true;
    const forever = new Promise(() => {});
    const run = withTimeout(forever, 500, 'gave up')
      .catch(() => null)
      .finally(() => { sharing = false; });
    jest.advanceTimersByTime(500);
    await run;
    expect(sharing).toBe(false);
  });

  test('the label says which step gave up', async () => {
    const guarded = withTimeout(new Promise(() => {}), 10, 'card upload timed out');
    const assertion = expect(guarded).rejects.toThrow('card upload timed out');
    jest.advanceTimersByTime(10);
    await assertion;
  });

  test('a late result after a timeout changes nothing', async () => {
    // The native call finally answers, long after we gave up. It must not
    // resolve an already-rejected promise.
    let settle;
    const slow = new Promise((res) => { settle = res; });
    const guarded = withTimeout(slow, 100, 'too slow');
    const assertion = expect(guarded).rejects.toThrow('too slow');
    jest.advanceTimersByTime(100);
    await assertion;
    settle('late');
    await flush();                                   // no unhandled rejection
  });

  test('a settled promise leaves no pending timer behind', async () => {
    const spy = jest.spyOn(global, 'clearTimeout');
    await withTimeout(Promise.resolve(1), 5000);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  test('accepts a plain value, not only a promise', async () => {
    await expect(withTimeout('bare', 1000)).resolves.toBe('bare');
  });
});

describe('the limits themselves', () => {
  test('the share sheet limit is generous — a person picking a contact is not a hang', () => {
    // Cutting someone off mid-compose would be a worse bug than the one this
    // helper fixes.
    expect(SHARE_SHEET_TIMEOUT_MS).toBeGreaterThanOrEqual(60000);
  });

  test('local work gets a much shorter limit than the share sheet', () => {
    expect(CAPTURE_TIMEOUT_MS).toBeLessThan(SHARE_SHEET_TIMEOUT_MS);
  });
});
