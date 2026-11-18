// "Report a problem" opens an email to support with the app version, device
// and account filled in. Used by Me (fix 6, 18 Nov 2026) and by Help.
import { Alert, Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import { NATIVE_BUILD } from './buildInfo';
import { extractPhone } from './streak';

export const SUPPORT_EMAIL = 'info@30actsofkindness.org';

export function problemReportUrl({ user, appVersion, build, os, osVersion }) {
  const acct = extractPhone(user?.email) || user?.phone || 'unknown';
  const body = [
    '',
    '',
    '——————————',
    'Please describe the problem above this line. The details below help us fix it:',
    '',
    `App version: ${appVersion} (build ${build})`,
    `Device: ${os === 'ios' ? 'iOS' : os} ${osVersion}`,
    `Account: ${acct}`,
  ].join('\n');
  return (
    `mailto:${SUPPORT_EMAIL}` +
    `?subject=${encodeURIComponent('30 Acts — Problem Report')}` +
    `&body=${encodeURIComponent(body)}`
  );
}

export function reportProblem(user) {
  const url = problemReportUrl({
    user,
    appVersion: Constants.expoConfig?.version ?? '1.0.0',
    build: NATIVE_BUILD[Platform.OS] || '?',
    os: Platform.OS,
    osVersion: Platform.Version,
  });
  Linking.openURL(url).catch(() =>
    Alert.alert('Email not available', `Please email us at ${SUPPORT_EMAIL} and we'll help.`)
  );
}
