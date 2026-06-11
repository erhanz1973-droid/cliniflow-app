/**
 * Meta App Events (Facebook SDK) — conversion tracking for App Promotion campaigns.
 * Requires EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN on EAS production builds.
 */
import { InteractionManager, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { logLaunchPhase, logLaunchPhaseOnce } from "./launchAudit";
import { isMetaNativeSdkAvailable } from "./isExpoGo";

export const META_FACEBOOK_APP_ID =
  String(process.env.EXPO_PUBLIC_FACEBOOK_APP_ID || "1908819279802983").trim();

const META_CLIENT_TOKEN = String(
  process.env.EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN || "4a49a212a086eb531b7f78ba7fa33efe",
).trim();
const CONTACT_FLAG_PREFIX = "meta_contact_clinic_logged:";

let initPromise: Promise<boolean> | null = null;
let sdkReady = false;
let attRequested = false;

type FbSdk = typeof import("react-native-fbsdk-next");

async function loadSdk(): Promise<FbSdk | null> {
  if (!isMetaNativeSdkAvailable()) {
    if (__DEV__) {
      console.log("[metaAppEvents] skipped — Expo Go has no native Facebook SDK (use dev/prod build)");
    }
    return null;
  }
  try {
    return await import("react-native-fbsdk-next");
  } catch (e) {
    console.warn("[metaAppEvents] SDK import failed:", (e as Error)?.message || e);
    logLaunchPhase("Meta SDK Init Failed", { stage: "import", error: String((e as Error)?.message || e) });
    return null;
  }
}

async function requestAttWhenIdle(): Promise<void> {
  if (Platform.OS !== "ios" || attRequested) return;
  attRequested = true;
  await new Promise<void>((resolve) => {
    InteractionManager.runAfterInteractions(() => resolve());
  });
  try {
    const { requestTrackingPermissionsAsync } = await import("expo-tracking-transparency");
    const result = await requestTrackingPermissionsAsync();
    logLaunchPhaseOnce("ATT Permission Result", { status: result?.status || "unknown" });
  } catch (e) {
    console.warn("[metaAppEvents] ATT request failed:", (e as Error)?.message || e);
    logLaunchPhase("ATT Permission Failed", { error: String((e as Error)?.message || e) });
  }
}

/** Initialize Meta SDK once at app startup (after root layout is mounted). */
export async function initMetaAppEvents(): Promise<boolean> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (!isMetaNativeSdkAvailable()) {
      logLaunchPhaseOnce("Meta SDK Init Skipped", { reason: "expo_go_or_web" });
      return false;
    }
    logLaunchPhaseOnce("Meta SDK Init Start", {
      appId: META_FACEBOOK_APP_ID,
      hasClientToken: Boolean(META_CLIENT_TOKEN),
    });
    if (!META_CLIENT_TOKEN) {
      console.warn(
        "[metaAppEvents] EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN missing — Meta App Events disabled.",
      );
      logLaunchPhase("Meta SDK Init Skipped", { reason: "missing_client_token" });
      return false;
    }
    const sdk = await loadSdk();
    if (!sdk?.Settings?.setAppID) {
      logLaunchPhase("Meta SDK Init Failed", { stage: "loadSdk", error: "Settings unavailable" });
      return false;
    }
    try {
      sdk.Settings.setAppID(META_FACEBOOK_APP_ID);
      sdk.Settings.setClientToken(META_CLIENT_TOKEN);
      sdk.Settings.initializeSDK();
      sdk.Settings.setAutoLogAppEventsEnabled(true);
      sdkReady = true;
      logLaunchPhaseOnce("Meta SDK Init Complete");
      void requestAttWhenIdle().then(async () => {
        try {
          sdk.Settings.setAdvertiserIDCollectionEnabled(true);
        } catch (e) {
          console.warn("[metaAppEvents] setAdvertiserIDCollectionEnabled failed:", (e as Error)?.message || e);
        }
      });
      return true;
    } catch (e) {
      console.warn("[metaAppEvents] init failed:", (e as Error)?.message || e);
      logLaunchPhase("Meta SDK Init Failed", {
        stage: "initializeSDK",
        error: String((e as Error)?.message || e),
      });
      return false;
    }
  })();
  return initPromise;
}

function logMetaEvent(eventName: string, params?: Record<string, string | number>): void {
  if (!sdkReady) return;
  void (async () => {
    const sdk = await loadSdk();
    if (!sdk) return;
    try {
      if (params && Object.keys(params).length) {
        sdk.AppEventsLogger.logEvent(eventName, params);
      } else {
        sdk.AppEventsLogger.logEvent(eventName);
      }
      if (__DEV__ || String(process.env.EXPO_PUBLIC_ANALYTICS_DEBUG || "").trim() === "1") {
        console.log(`[metaAppEvents] ${eventName}`, params || {});
      }
    } catch (e) {
      console.warn(`[metaAppEvents] logEvent(${eventName}) failed:`, (e as Error)?.message || e);
    }
  })();
}

/** fb_mobile_activate_app — call on cold start / foreground. */
export function trackMetaAppOpen(): void {
  logMetaEvent("fb_mobile_activate_app");
}

/** Standard Meta event after successful user (patient) registration. */
export function trackMetaCompleteRegistration(method = "mobile"): void {
  void (async () => {
    const sdk = await loadSdk();
    if (!sdk || !sdkReady) return;
    try {
      sdk.AppEventsLogger.logEvent(sdk.AppEventsLogger.AppEvents.CompletedRegistration, {
        fb_registration_method: method,
      });
      if (__DEV__) console.log("[metaAppEvents] CompleteRegistration", { method });
    } catch (e) {
      console.warn("[metaAppEvents] CompleteRegistration failed:", (e as Error)?.message || e);
    }
  })();
}

export function trackMetaPhotoUpload(source = "chat"): void {
  logMetaEvent("PhotoUpload", { source });
}

export function trackMetaDoctorRegistration(): void {
  logMetaEvent("DoctorRegistration");
}

export function trackMetaClinicRegistration(): void {
  logMetaEvent("ClinicRegistration");
}

/** First outbound message to a clinic — once per patient+clinic pair. */
export async function trackMetaContactClinicOnce(
  patientId: string,
  clinicId: string,
): Promise<void> {
  const pid = String(patientId || "").trim();
  const cid = String(clinicId || "").trim();
  if (!pid || !cid) return;
  const key = `${CONTACT_FLAG_PREFIX}${pid}:${cid}`;
  try {
    const seen = await AsyncStorage.getItem(key);
    if (seen === "1") return;
    trackMetaContactClinic();
    await AsyncStorage.setItem(key, "1");
  } catch {
    trackMetaContactClinic();
  }
}

export function trackMetaContactClinic(): void {
  logMetaEvent("ContactClinic");
}

/** Alias for Meta custom event naming in dashboards. */
export function trackMetaClinicContactInitiated(): void {
  trackMetaContactClinic();
}

export function trackMetaSmileScoreShare(channel = "facebook"): void {
  logMetaEvent("SmileScoreShare", { channel });
}
