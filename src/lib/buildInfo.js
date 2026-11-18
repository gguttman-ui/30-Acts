// buildInfo.js -- the one version label people see, and the developer details
// behind it (David's UX review Q3, 17 Nov 2026).
//
// The Me page used to show "v1.0.0 · production · update xxxx · db · production".
// Now Help shows only "Version 1.0.0 (98)". The details are still there for us:
// always on the staging app, and on any app after five quick taps on the
// version line (which also sends the Sentry test message, item 43).

// Native build numbers. UPDATE THESE WITH EACH NATIVE BUILD (they cannot be read
// without expo-application, which needs a native build to add).
export const NATIVE_BUILD = { ios: '98', android: '2' };

export function versionLabel(appVersion, platform) {
  const build = NATIVE_BUILD[platform];
  return `Version ${appVersion || '1.0.0'}${build ? ` (${build})` : ''}`;
}

export function buildDetails({ runtimeVersion, channel, updateId, db }) {
  return `v${runtimeVersion || '1.0.0'} · ${channel || 'dev'} · update ${updateId ? updateId.slice(0, 8) : 'embedded'} · db ${db}`;
}
