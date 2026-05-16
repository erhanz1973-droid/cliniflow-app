const { AndroidConfig, withAndroidManifest } = require("expo/config-plugins");

/** Broad gallery/storage permissions blocked for Google Play photo-picker policy. */
const REMOVED_PERMISSIONS = [
  "android.permission.READ_MEDIA_IMAGES",
  "android.permission.READ_MEDIA_VIDEO",
  "android.permission.READ_MEDIA_AUDIO",
  "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
];

function ensureToolsNamespace(manifest) {
  manifest.$ = manifest.$ || {};
  manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
}

function addRemovePermissions(manifest) {
  ensureToolsNamespace(manifest);
  const existing = manifest["uses-permission"] || [];
  const list = Array.isArray(existing) ? [...existing] : [existing];

  for (const name of REMOVED_PERMISSIONS) {
    const hasRemove = list.some(
      (entry) =>
        entry?.$?.["android:name"] === name && entry?.$?.["tools:node"] === "remove",
    );
    if (!hasRemove) {
      list.push({ $: { "android:name": name, "tools:node": "remove" } });
    }
  }

  manifest["uses-permission"] = list;
}

function withPlayStoreMediaPermissions(config) {
  config = AndroidConfig.Permissions.withBlockedPermissions(config, REMOVED_PERMISSIONS);
  return withAndroidManifest(config, (cfg) => {
    addRemovePermissions(cfg.modResults.manifest);
    return cfg;
  });
}

module.exports = withPlayStoreMediaPermissions;
