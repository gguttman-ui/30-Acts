// Android 11+ package visibility (backlog 71i / 92, 11 Nov 2026).
// Since Android 11 an app can only see or launch other apps it declares in a
// <queries> block. Without these, Text cannot open the texting app directly
// (item 92) and the Instagram / TikTok / X / Facebook buttons may fall back to
// the general share menu. No permissions are added - this only declares
// which apps we may hand a share to.
const { withAndroidManifest } = require('expo/config-plugins');

const PACKAGES = [
  'com.instagram.android',
  'com.zhiliaoapp.musically',   // TikTok
  'com.ss.android.ugc.trill',   // TikTok (some regions)
  'com.twitter.android',        // X
  'com.facebook.katana',
];

const INTENTS = [
  { action: 'android.intent.action.SENDTO', scheme: 'smsto' },
  { action: 'android.intent.action.SENDTO', scheme: 'sms' },
  { action: 'android.intent.action.SENDTO', scheme: 'mailto' },
  { action: 'android.intent.action.SEND', mimeType: 'image/*' },
  { action: 'android.intent.action.SEND', mimeType: 'text/plain' },
];

function addQueries(manifest) {
  const root = manifest.manifest;
  root.queries = root.queries || [{}];
  const q = root.queries[0];
  q.package = q.package || [];
  q.intent = q.intent || [];
  for (const name of PACKAGES) {
    if (!q.package.some((p) => p.$ && p.$['android:name'] === name)) {
      q.package.push({ $: { 'android:name': name } });
    }
  }
  for (const it of INTENTS) {
    const data = it.scheme ? { 'android:scheme': it.scheme } : { 'android:mimeType': it.mimeType };
    const key = JSON.stringify([it.action, data]);
    const exists = q.intent.some(
      (x) => JSON.stringify([x.action?.[0]?.$?.['android:name'], x.data?.[0]?.$]) === key
    );
    if (!exists) {
      q.intent.push({ action: [{ $: { 'android:name': it.action } }], data: [{ $: data }] });
    }
  }
  return manifest;
}

const withAndroidQueries = (config) =>
  withAndroidManifest(config, (cfg) => {
    cfg.modResults = addQueries(cfg.modResults);
    return cfg;
  });

module.exports = withAndroidQueries;
module.exports.addQueries = addQueries;
module.exports.PACKAGES = PACKAGES;
