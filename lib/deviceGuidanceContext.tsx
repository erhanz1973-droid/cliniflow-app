import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AppStateStatus,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePathname } from "expo-router";
import * as Notifications from "expo-notifications";
import { useLanguage } from "./language-context";
import { useAuth } from "./auth";
import { safeGetItem, safeSetItem } from "./asyncStorageSafe";
import { classifyStorageErrorSeverity, isLowStorageLikeError } from "./lowStorageError";
import { diskSpaceBand, evaluateProactiveDiskLevel, getAvailableDiskBytes } from "./diskSpaceGuard";
import { trackEvent } from "./analytics/trackEvent";
import { AnalyticsEvents } from "./analytics/events";

const KEY_NOTIF_DISMISS_UNTIL = "@cliniflow:device_ux_notif_dismiss_until";
const KEY_STORAGE_DISMISS_UNTIL = "@cliniflow:device_ux_storage_dismiss_until";

const NOTIFICATION_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const LOW_STORAGE_SNOOZE_MS = 24 * 60 * 60 * 1000;
const LOW_STORAGE_FAILURE_MIN_INTERVAL_MS = 45 * 60 * 1000;
const PROACTIVE_WARNING_MIN_INTERVAL_MS = 30 * 60 * 1000;

export type DeviceGuidanceContextValue = {
  reportLowStorageLikeError: (error: unknown, meta?: { operation?: string }) => void;
  prepareHeavyFileOp: (opts: { operation: string; reserveBytes?: number }) => Promise<{ proceed: boolean }>;
};

const DeviceGuidanceContext = createContext<DeviceGuidanceContextValue | null>(null);

export function useDeviceGuidanceOptional(): DeviceGuidanceContextValue | null {
  return useContext(DeviceGuidanceContext);
}

function notificationNeedsGuidance(status: Notifications.NotificationPermissionsStatus): boolean {
  if (Platform.OS === "web") return false;
  if (!status.granted) return true;
  const ios = status.ios;
  if (Platform.OS === "ios" && ios) {
    if (ios.allowsAlert === false) return true;
    if (ios.allowsSound === false) return true;
    if (ios.allowsBadge === false) return true;
  }
  return false;
}

async function readDismissUntil(key: string): Promise<number> {
  const raw = await safeGetItem(key);
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function DeviceGuidanceProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const routeRef = useRef(pathname);
  routeRef.current = pathname;

  const { t, isLoading: langLoading } = useLanguage();
  const { isAuthed, isAuthReady, isAuthLoading } = useAuth();

  const [notifVisible, setNotifVisible] = useState(false);
  /** Storage banner: proactive heuristic vs real write failure. */
  const [storageBanner, setStorageBanner] = useState<"warning" | "critical" | null>(null);

  const lowStorageFailureLastEmitRef = useRef(0);
  const proactiveWarningLastAtRef = useRef(0);
  const notificationTelemetryOnceRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);

  const refreshNotificationBanner = useCallback(async () => {
    if (Platform.OS === "web" || langLoading) return;
    if (!isAuthReady || isAuthLoading || !isAuthed) {
      setNotifVisible(false);
      notificationTelemetryOnceRef.current = false;
      return;
    }
    try {
      const until = await readDismissUntil(KEY_NOTIF_DISMISS_UNTIL);
      if (Date.now() < until) {
        setNotifVisible(false);
        return;
      }
      const settings = await Notifications.getPermissionsAsync();
      const needs = notificationNeedsGuidance(settings);
      if (needs) {
        if (!notificationTelemetryOnceRef.current) {
          notificationTelemetryOnceRef.current = true;
          trackEvent(AnalyticsEvents.notificationPermissionMissing, {
            category: "notification_",
            granted: settings.granted,
            alerts: settings.ios?.allowsAlert ?? undefined,
            sound: settings.ios?.allowsSound ?? undefined,
            badges: settings.ios?.allowsBadge ?? undefined,
            route: routeRef.current,
          });
        }
        setNotifVisible(true);
      } else {
        notificationTelemetryOnceRef.current = false;
        setNotifVisible(false);
      }
    } catch (e) {
      if (__DEV__) console.warn("[DeviceGuidance] getPermissionsAsync failed", e);
    }
  }, [isAuthLoading, isAuthReady, isAuthed, langLoading]);

  useEffect(() => {
    void refreshNotificationBanner();
  }, [refreshNotificationBanner]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev.match(/inactive|background/) && next === "active") {
        void refreshNotificationBanner();
      }
    });
    return () => sub.remove();
  }, [refreshNotificationBanner]);

  const dismissNotificationBanner = useCallback(async () => {
    setNotifVisible(false);
    const until = Date.now() + NOTIFICATION_SNOOZE_MS;
    await safeSetItem(KEY_NOTIF_DISMISS_UNTIL, String(until));
  }, []);

  const dismissStorageBanner = useCallback(async () => {
    setStorageBanner(null);
    const until = Date.now() + LOW_STORAGE_SNOOZE_MS;
    await safeSetItem(KEY_STORAGE_DISMISS_UNTIL, String(until));
  }, []);

  const reportLowStorageLikeError = useCallback(
    (error: unknown, meta?: { operation?: string }) => {
      if (Platform.OS === "web") return;
      if (!classifyStorageErrorSeverity(error)) return;
      void (async () => {
        const until = await readDismissUntil(KEY_STORAGE_DISMISS_UNTIL);
        if (Date.now() < until) return;
        const now = Date.now();
        if (now - lowStorageFailureLastEmitRef.current < LOW_STORAGE_FAILURE_MIN_INTERVAL_MS) return;
        lowStorageFailureLastEmitRef.current = now;

        trackEvent(AnalyticsEvents.deviceLowStorageDetected, {
          category: "storage_",
          severity: "critical",
          route: routeRef.current,
          operation: meta?.operation ?? "unknown",
        });
        trackEvent(AnalyticsEvents.attachmentStorageFailure, {
          category: "attachment_",
          severity: "critical",
          operation: meta?.operation ?? "unknown",
        });

        setStorageBanner("critical");
      })();
    },
    []
  );

  const prepareHeavyFileOp = useCallback(
    async (opts: { operation: string; reserveBytes?: number }) => {
      if (Platform.OS === "web") return { proceed: true as const };
      const until = await readDismissUntil(KEY_STORAGE_DISMISS_UNTIL);
      if (Date.now() < until) return { proceed: true as const };

      const free = getAvailableDiskBytes();
      const reserve = opts.reserveBytes ?? 80 * 1024 * 1024;
      const level = evaluateProactiveDiskLevel(free, reserve);
      const band = diskSpaceBand(free);
      const route = routeRef.current;

      if (level === "blocked") {
        trackEvent(AnalyticsEvents.storageLowDetected, {
          category: "storage_",
          severity: "blocked",
          route,
          operation: opts.operation,
          free_space_band: band,
        });
        setStorageBanner("critical");
        return { proceed: false as const };
      }

      if (level === "warning") {
        const now = Date.now();
        if (now - proactiveWarningLastAtRef.current >= PROACTIVE_WARNING_MIN_INTERVAL_MS) {
          proactiveWarningLastAtRef.current = now;
          trackEvent(AnalyticsEvents.storageLowDetected, {
            category: "storage_",
            severity: "warning",
            route,
            operation: opts.operation,
            free_space_band: band,
          });
        }
        setStorageBanner("warning");
      }

      return { proceed: true as const };
    },
    []
  );

  const openSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  const value = useMemo(
    () => ({ reportLowStorageLikeError, prepareHeavyFileOp }),
    [reportLowStorageLikeError, prepareHeavyFileOp]
  );

  if (Platform.OS === "web") {
    return <DeviceGuidanceContext.Provider value={value}>{children}</DeviceGuidanceContext.Provider>;
  }

  const showOverlay = notifVisible || storageBanner != null;

  const storageIsRed = storageBanner === "critical";
  const storageTitle = storageBanner === "warning" ? t("deviceGuidance.lowStorageTitleWarning") : t("deviceGuidance.lowStorageTitle");
  const storageBody = storageBanner === "warning" ? t("deviceGuidance.lowStorageBodyWarning") : t("deviceGuidance.lowStorageBody");

  return (
    <DeviceGuidanceContext.Provider value={value}>
      <View style={styles.flex1}>
        {children}
        {showOverlay ? (
          <SafeAreaView edges={["top"]} style={styles.bannerHost} pointerEvents="box-none">
            {notifVisible ? (
              <View style={[styles.banner, styles.bannerNotif]} accessibilityRole="alert">
                <Text style={styles.bannerTitle}>{t("deviceGuidance.notificationsTitle")}</Text>
                <Text style={styles.bannerBody}>{t("deviceGuidance.notificationsBody")}</Text>
                <Text style={styles.bannerBullets}>
                  {`• ${t("deviceGuidance.notificationsBulletAlerts")}\n• ${t("deviceGuidance.notificationsBulletSound")}\n• ${t("deviceGuidance.notificationsBulletBadge")}`}
                </Text>
                <View style={styles.bannerActions}>
                  <Pressable onPress={openSettings} style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed]}>
                    <Text style={styles.btnPrimaryText}>{t("deviceGuidance.openSettings")}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void dismissNotificationBanner()}
                    style={({ pressed }) => [styles.btnGhost, pressed && styles.pressed]}
                  >
                    <Text style={styles.btnGhostText}>{t("deviceGuidance.dismiss")}</Text>
                  </Pressable>
                </View>
                {Platform.OS === "ios" ? (
                  <Text style={styles.bannerHint}>{t("deviceGuidance.notificationsIosPath")}</Text>
                ) : (
                  <Text style={styles.bannerHint}>{t("deviceGuidance.notificationsAndroidPath")}</Text>
                )}
              </View>
            ) : null}

            {storageBanner ? (
              <View
                style={[styles.banner, storageIsRed ? styles.bannerStorageCritical : styles.bannerStorageWarn]}
                accessibilityRole="alert"
              >
                <Text style={[styles.bannerTitle, storageIsRed ? styles.bannerTitleStorage : styles.bannerTitleWarn]}>
                  {storageTitle}
                </Text>
                <Text style={[styles.bannerBody, storageIsRed ? styles.bannerBodyStorage : styles.bannerBodyWarn]}>{storageBody}</Text>
                <Text style={styles.bannerHintStorage}>
                  {Platform.OS === "ios"
                    ? t("deviceGuidance.lowStorageHintIOS")
                    : t("deviceGuidance.lowStorageHintAndroid")}
                </Text>
                <View style={styles.bannerActions}>
                  <Pressable onPress={openSettings} style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed]}>
                    <Text style={styles.btnPrimaryText}>{t("deviceGuidance.openSettings")}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void dismissStorageBanner()}
                    style={({ pressed }) => [styles.btnGhostStorage, pressed && styles.pressed]}
                  >
                    <Text style={storageIsRed ? styles.btnGhostTextStorage : styles.btnGhostTextWarn}>{t("deviceGuidance.dismiss")}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </SafeAreaView>
        ) : null}
      </View>
    </DeviceGuidanceContext.Provider>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  bannerNotif: {
    backgroundColor: "#FFFBEB",
    borderColor: "#F59E0B",
  },
  bannerHost: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  banner: {
    borderRadius: 10,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  bannerStorageCritical: {
    backgroundColor: "#FEF2F2",
    borderColor: "#EF4444",
  },
  bannerStorageWarn: {
    backgroundColor: "#FFFBEB",
    borderColor: "#F59E0B",
  },
  bannerTitleStorage: { color: "#991B1B" },
  bannerBodyStorage: { color: "#7F1D1D" },
  bannerTitleWarn: { color: "#92400E" },
  bannerBodyWarn: { color: "#78350F" },
  bannerHintStorage: {
    marginTop: 8,
    fontSize: 12,
    color: "#57534E",
    lineHeight: 16,
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#92400E",
    marginBottom: 4,
  },
  bannerBody: {
    fontSize: 14,
    color: "#78350F",
    lineHeight: 20,
  },
  bannerBullets: {
    marginTop: 6,
    fontSize: 13,
    color: "#78350F",
    lineHeight: 18,
  },
  bannerHint: {
    marginTop: 8,
    fontSize: 12,
    color: "#78716C",
    lineHeight: 16,
  },
  bannerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
    alignItems: "center",
  },
  btnPrimary: {
    backgroundColor: "#D97706",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  btnPrimaryText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  btnGhost: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  btnGhostText: {
    color: "#92400E",
    fontSize: 14,
    fontWeight: "600",
  },
  btnGhostStorage: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  btnGhostTextStorage: {
    color: "#991B1B",
    fontSize: 14,
    fontWeight: "600",
  },
  btnGhostTextWarn: {
    color: "#92400E",
    fontSize: 14,
    fontWeight: "600",
  },
  pressed: { opacity: 0.85 },
});
