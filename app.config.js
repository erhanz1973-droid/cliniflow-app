/**
 * Merge layer on top of `app.json` (version, slug, ios, android incl. versionCode, extra/eas).
 * Keeps Play-sensitive Android manifest tweaks here without duplicating project identity.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const appJson = require("./app.json");

const BLOCKED_ANDROID_MEDIA_PERMISSIONS = [
  "android.permission.READ_MEDIA_IMAGES",
  "android.permission.READ_MEDIA_VIDEO",
  "android.permission.READ_MEDIA_AUDIO",
  "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
];

module.exports = {
  expo: {
    ...appJson.expo,
    ios: {
      ...(appJson.expo.ios || {}),
      usesAppleSignIn: true,
    },
    android: {
      ...(appJson.expo.android || {}),
      package: "com.clinifly.mobile",
      blockedPermissions: BLOCKED_ANDROID_MEDIA_PERMISSIONS,
      softwareKeyboardLayoutMode: "resize",
    },
  },
};
