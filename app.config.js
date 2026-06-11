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

const FACEBOOK_APP_ID =
  process.env.EXPO_PUBLIC_FACEBOOK_APP_ID || "1908819279802983";
const FACEBOOK_CLIENT_TOKEN =
  process.env.EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN || "4a49a212a086eb531b7f78ba7fa33efe";

module.exports = {
  expo: {
    ...appJson.expo,
    facebook: {
      appId: FACEBOOK_APP_ID,
      clientToken: FACEBOOK_CLIENT_TOKEN,
      displayName: "Cliniflow",
      iosUserTrackingPermission:
        "Clinifly uses this identifier to measure ad performance and improve your experience.",
    },
    ios: {
      ...(appJson.expo.ios || {}),
      usesAppleSignIn: true,
      infoPlist: {
        ...(appJson.expo.ios?.infoPlist || {}),
        FacebookAppID: FACEBOOK_APP_ID,
        FacebookDisplayName: "Cliniflow",
        ...(FACEBOOK_CLIENT_TOKEN ? { FacebookClientToken: FACEBOOK_CLIENT_TOKEN } : {}),
        NSUserTrackingUsageDescription:
          "Clinifly uses this identifier to measure ad performance and improve your experience.",
      },
    },
    android: {
      ...(appJson.expo.android || {}),
      package: "com.clinifly.mobile",
      blockedPermissions: BLOCKED_ANDROID_MEDIA_PERMISSIONS,
      softwareKeyboardLayoutMode: "resize",
    },
    plugins: [
      ...(Array.isArray(appJson.expo.plugins) ? appJson.expo.plugins : []),
      "./plugins/withFacebookSDK.js",
    ],
  },
};
