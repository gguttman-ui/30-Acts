// app.config.js — build variants
//
// WHY THIS FILE EXISTS
// Staging and production used to share one bundle identifier, so iOS treated
// them as the same app and only one could be installed at a time. Every switch
// between environments meant deleting the app and reinstalling from a QR code.
// That is backlog item 26.
//
// HOW IT WORKS, AND THE ONE RULE
// app.json is still the single description of the PRODUCTION app. Expo reads it
// first and hands it to this function as `config`. When APP_VARIANT is anything
// other than "staging" — which is every production build, every `eas update`,
// and every local command — this function returns that object UNCHANGED.
// Production cannot drift, because nothing on the production path touches it.
//
// Do NOT "tidy" this by moving production values into this file. The moment a
// production value is computed here rather than read from app.json, a mistake
// in this file can change the app's identity, and an App Store build with the
// wrong bundle identifier is a different app to Apple.
//
// VERIFY BEFORE ANY BUILD OR SUBMISSION
//   npx expo config --type public | Out-File -Encoding utf8 config-check.json
//   Compare-Object (Get-Content config-baseline.json) (Get-Content config-check.json)
// No output means production is byte-identical to the baseline captured on
// 18 Sep 2026, before this file existed. Any output means stop.
//
// To see the staging variant instead:
//   $env:APP_VARIANT="staging"; npx expo config --type public
//   $env:APP_VARIANT=""        <- clear it afterwards, or later commands lie to you

module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== 'staging') {
    return config;                       // production — untouched, deliberately
  }

  return {
    ...config,

    // Home-screen name, and the icon carrying a red STAGING band. Between these
    // two and the "db - staging" line in Settings, there are three independent
    // signals of which app is open.
    name: '30 Acts (Staging)',
    icon: './assets/icon-staging.png',

    // A distinct URL scheme so a thirtyacts:// link cannot land in the wrong app.
    scheme: 'thirtyactsstg',

    ios: {
      ...config.ios,
      bundleIdentifier: 'org.30actsofkindness.app.staging',
      icon: './assets/icon-staging.png',

      // DELIBERATELY EMPTY. Production claims applinks:alrpa.app.link for Branch.
      // If staging claimed them too, iOS would choose between the two apps
      // unpredictably when an invite link was tapped, and referral attribution
      // would become untrustworthy on the app that actually matters.
      //
      // The cost: tapping a Branch invite link never opens staging. That is
      // acceptable — the referral chain needs a real App Store install to test
      // deferred deep linking (Part D), which staging could never do anyway.
      associatedDomains: [],

      infoPlist: {
        ...config.ios?.infoPlist,
        CFBundleDisplayName: '30 Acts Stg',
      },
    },

    android: {
      ...config.android,
      package: 'org.actsofkindness.app.staging',
    },
  };
};

// NOT changed for staging, on purpose:
//   slug, extra.eas.projectId, updates.url, runtimeVersion
//     — these keep staging inside the same EAS project, which is what lets
//       `eas update --branch preview --environment preview` keep reaching it.
//   plugins, including @config-plugins/react-native-branch
//     — staging should differ from production as little as possible. Branch
//       still initialises; it simply never receives a universal-link open.
//
// KNOWN WART: both apps register the Facebook URL scheme fb1033236095805810,
// and iOS leaves the winner undefined when two apps claim one scheme. The app
// uses Facebook for sharing only, never login, so the exposure is small. Noted
// rather than fixed.
