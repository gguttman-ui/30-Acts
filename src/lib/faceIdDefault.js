// faceIdDefault.js -- David's UX review fix 1 (18 Nov 2026): the Face ID lock is
// OFF by default, for new AND existing users. People who want it turn it on in
// Me (Settings). This one-time reset switches it off once for everyone who had
// it on before this change; after that the person's own choice is kept.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const FACEID_KEY = 'biometric_enabled';
export const FACEID_RESET_KEY = 'faceid_default_off_v1';

/** True only if the person has turned the Face ID lock on (since the reset). */
export async function faceIdLockOn() {
  try {
    const done = await AsyncStorage.getItem(FACEID_RESET_KEY);
    if (!done) {
      await AsyncStorage.removeItem(FACEID_KEY);
      await AsyncStorage.setItem(FACEID_RESET_KEY, '1');
      return false;
    }
    return (await AsyncStorage.getItem(FACEID_KEY)) === 'true';
  } catch (e) {
    return false;
  }
}
