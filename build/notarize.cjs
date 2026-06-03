// electron-builder `afterSign` hook — notarize + staple the macOS app.
//
// It runs ONLY when notarization credentials are present in the environment, so
// contributors without an Apple account can still `npm run dist:mac` and get a
// working (unsigned) build — this just no-ops. With a Developer ID cert in the
// keychain + the env vars below, the produced .app/.dmg is signed, notarized,
// and stapled, so end users get a single one-time macOS access prompt.
//
// Credentials (set whichever pair you use):
//   App-specific password:  APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
//   App Store Connect key:  APPLE_API_KEY (path to .p8), APPLE_API_KEY_ID, APPLE_API_ISSUER
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return; // mac only

  const {
    APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID,
    APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER
  } = process.env;

  const hasPassword = !!(APPLE_ID && APPLE_APP_SPECIFIC_PASSWORD && APPLE_TEAM_ID);
  const hasApiKey = !!(APPLE_API_KEY && APPLE_API_KEY_ID && APPLE_API_ISSUER);
  if (!hasPassword && !hasApiKey) {
    console.log('[notarize] no APPLE_* credentials in env — skipping notarization (build stays unsigned).');
    return;
  }

  let notarize;
  try {
    ({ notarize } = require('@electron/notarize'));
  } catch {
    console.warn('[notarize] @electron/notarize not installed — run `npm install`. Skipping.');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  const creds = hasApiKey
    ? { appleApiKey: APPLE_API_KEY, appleApiKeyId: APPLE_API_KEY_ID, appleApiIssuer: APPLE_API_ISSUER }
    : { appleId: APPLE_ID, appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD, teamId: APPLE_TEAM_ID };

  console.log(`[notarize] submitting ${appName}.app to Apple via notarytool (this can take a few minutes)…`);
  await notarize({ tool: 'notarytool', appPath, ...creds });

  console.log('[notarize] stapling ticket to the app…');
  execFileSync('xcrun', ['stapler', 'staple', appPath], { stdio: 'inherit' });
  console.log('[notarize] done — app is signed, notarized, and stapled.');
};
