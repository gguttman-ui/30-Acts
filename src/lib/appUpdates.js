// appUpdates.js -- backlog 78. Background update check + the shared gate.
// See updateGate.js for when a downloaded update is actually switched to.
import * as Updates from 'expo-updates';
import { createUpdateGate } from './updateGate';

export const updateGate = createUpdateGate(() => Updates.reloadAsync());

let checking = false;

/**
 * Check for, and download, a new update. Never throws and never blocks:
 * a failed or offline check just tries again next time the app is opened.
 */
export async function checkForUpdateInBackground() {
  if (__DEV__ || !Updates.isEnabled || checking) return;
  checking = true;
  try {
    const result = await Updates.checkForUpdateAsync();
    if (result && result.isAvailable) {
      const fetched = await Updates.fetchUpdateAsync();
      if (fetched && fetched.isNew) updateGate.markReady();
    }
  } catch (e) {
    console.warn('Update check failed:', e && e.message);
  } finally {
    checking = false;
  }
}
