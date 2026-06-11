const {
  withInfoPlist,
  withAndroidManifest,
  withStringsXml,
  AndroidConfig,
} = require("expo/config-plugins");

const DEFAULT_APP_ID = "1908819279802983";

function getFacebookConfig(config) {
  const fb = config.expo?.facebook || {};
  const appId = String(fb.appId || process.env.EXPO_PUBLIC_FACEBOOK_APP_ID || DEFAULT_APP_ID).trim();
  const clientToken = String(
    fb.clientToken || process.env.EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN || "",
  ).trim();
  const displayName = String(fb.displayName || config.expo?.name || "Cliniflow").trim();
  const trackingDescription =
    String(fb.iosUserTrackingPermission || "").trim() ||
    "Clinifly uses this identifier to measure ad performance and improve your experience.";
  return { appId, clientToken, displayName, trackingDescription };
}

function withFacebookIos(config) {
  return withInfoPlist(config, (cfg) => {
    const { appId, clientToken, displayName, trackingDescription } = getFacebookConfig(cfg);
    const plist = cfg.modResults;
    plist.FacebookAppID = appId;
    plist.FacebookDisplayName = displayName;
    if (clientToken) plist.FacebookClientToken = clientToken;
    plist.NSUserTrackingUsageDescription = trackingDescription;

    const schemes = new Set();
    const existing = plist.CFBundleURLTypes || [];
    for (const entry of existing) {
      const list = entry.CFBundleURLSchemes || [];
      for (const s of list) schemes.add(s);
    }
    schemes.add(`fb${appId}`);
    schemes.add("clinifly");
    schemes.add("net.clinifly.mobile");

    const preserved = existing.filter(
      (entry) =>
        !(entry.CFBundleURLSchemes || []).some((s) => String(s).startsWith("fb")),
    );
    plist.CFBundleURLTypes = [
      ...preserved,
      { CFBundleURLSchemes: Array.from(schemes) },
    ];

    const querySchemes = new Set(plist.LSApplicationQueriesSchemes || []);
    ["fbapi", "fb-messenger-share-api", "fbauth2", "fbshareextension"].forEach((s) =>
      querySchemes.add(s),
    );
    plist.LSApplicationQueriesSchemes = Array.from(querySchemes);

    return cfg;
  });
}

function withFacebookAndroid(config) {
  config = withStringsXml(config, (cfg) => {
    const { appId, clientToken } = getFacebookConfig(cfg);
    const strings = cfg.modResults;
    if (!strings.resources) strings.resources = {};
    if (!strings.resources.string) strings.resources.string = [];
    const list = Array.isArray(strings.resources.string)
      ? strings.resources.string
      : [strings.resources.string];

    const upsert = (name, value) => {
      const idx = list.findIndex((row) => row.$?.name === name);
      const row = { $: { name }, _: value };
      if (idx >= 0) list[idx] = row;
      else list.push(row);
    };
    upsert("facebook_app_id", appId);
    if (clientToken) upsert("facebook_client_token", clientToken);
    strings.resources.string = list;
    return cfg;
  });

  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    if (!app["meta-data"]) app["meta-data"] = [];
    const meta = Array.isArray(app["meta-data"]) ? app["meta-data"] : [app["meta-data"]];

    const upsertMeta = (name, value) => {
      const idx = meta.findIndex((m) => m.$?.["android:name"] === name);
      const row = { $: { "android:name": name, "android:value": value } };
      if (idx >= 0) meta[idx] = row;
      else meta.push(row);
    };
    upsertMeta("com.facebook.sdk.ApplicationId", "@string/facebook_app_id");
    upsertMeta("com.facebook.sdk.ClientToken", "@string/facebook_client_token");
    upsertMeta("com.facebook.sdk.AutoInitEnabled", "true");
    upsertMeta("com.facebook.sdk.AutoLogAppEventsEnabled", "true");
    upsertMeta("com.facebook.sdk.AdvertiserIDCollectionEnabled", "true");

    app["meta-data"] = meta;
    return cfg;
  });
}

function withFacebookSDK(config) {
  config = withFacebookIos(config);
  config = withFacebookAndroid(config);
  // Meta App Events + Play Console "uses Advertising ID" require AD_ID in the release manifest.
  config = AndroidConfig.Permissions.withPermissions(config, [
    "com.google.android.gms.permission.AD_ID",
  ]);
  return config;
}

module.exports = withFacebookSDK;
