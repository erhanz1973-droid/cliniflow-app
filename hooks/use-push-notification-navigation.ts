import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import Constants from "expo-constants";
import { useRootNavigationState, useRouter } from "expo-router";
import { useAuthSession } from "../lib/auth";
import { pushDataToResolveInput } from "../lib/canonicalChatTarget";
import { navigateCanonicalChat } from "../lib/navigateCanonicalChat";
import { getPathFromNotificationData } from "../lib/notificationRouting";
import { emitOfferUnreadEvent } from "../lib/offerUnreadEvents";
import { bumpDoctorRequestUnreadByOfferId } from "../lib/doctorRequestsUnread";
import { invalidateDoctorUnreadCacheOnly } from "../lib/doctorMessaging";
import { invalidatePatientInboxUnreadCache } from "../lib/patientInboxUnread";

const isExpoGo = Constants.appOwnership === "expo";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Notifications: any = null;
if (!isExpoGo) {
  try {
    Notifications = require("expo-notifications");
  } catch {
    /* no native module */
  }
}

type NotificationResponse = {
  notification: { request: { identifier: string; content: { data?: unknown } } };
};

type DeliveryKind = "cold_start" | "tap";

function getRequestId(response: NotificationResponse): string {
  return response.notification.request.identifier;
}

/**
 * Routes notification taps (and cold-start opens) to offer-chat / patient-chat.
 */
export function usePushNotificationNavigation(): void {
  const router = useRouter();
  const rootNav = useRootNavigationState();
  const { token, isDoctor, isPatient } = useAuthSession();
  const navReady = !!rootNav?.key;
  const processedRef = useRef<string[]>([]);
  const pendingRef = useRef<NotificationResponse | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const viewerType = isDoctor ? "doctor" : isPatient ? "patient" : null;

  const navigateFromData = useCallback(
    (data: Record<string, unknown> | undefined, delivery: DeliveryKind) => {
      if (!data || !token) return;
      const type = String(data.type || "").toLowerCase();
      if (type === "offer_message" || type === "new_offer") {
        const offerId = String(data.offerId || data.offer_id || "").trim();
        if (isDoctor && offerId) bumpDoctorRequestUnreadByOfferId(offerId, 1);
        emitOfferUnreadEvent({
          type: "offer_realtime_update",
          offerId: offerId || undefined,
          requestId: String(data.requestId || data.request_id || "").trim() || undefined,
          recipient: isDoctor ? "doctor" : "patient",
        });
        if (isDoctor) invalidateDoctorUnreadCacheOnly();
        if (isPatient) invalidatePatientInboxUnreadCache();
      }
      if (isDoctor && (type === "offer_message" || type === "new_offer")) {
        const target = navigateCanonicalChat(
          router,
          pushDataToResolveInput(data, "doctor"),
          { source: `push:${delivery}` },
        );
        if (__DEV__) {
          console.log("[push:nav]", { delivery, type, kind: target.kind, path: target.path });
        }
        return;
      }

      const path = getPathFromNotificationData(data, { type: viewerType ?? undefined });
      if (!path) return;
      if (__DEV__) console.log("[push:nav]", { delivery, path, type });
      router.push(path as never);
    },
    [router, token, isDoctor, isPatient, viewerType],
  );

  const handleResponse = useCallback(
    (response: NotificationResponse, delivery: DeliveryKind) => {
      if (!navReady) {
        pendingRef.current = response;
        return;
      }
      const id = getRequestId(response);
      if (processedRef.current.includes(id)) return;
      processedRef.current.push(id);
      if (processedRef.current.length > 40) processedRef.current.shift();
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      navigateFromData(data, delivery);
    },
    [navReady, navigateFromData],
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      appStateRef.current = s;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!Notifications || !token) return;

    const unsubTap = Notifications.addNotificationResponseReceivedListener(
      (response: NotificationResponse) => {
        handleResponse(response, "tap");
      },
    );

    const unsubFg = Notifications.addNotificationReceivedListener(
      (event: { request: { content: { data?: unknown } } }) => {
        if (appStateRef.current !== "active") return;
        const data = event.request.content.data as Record<string, unknown> | undefined;
        const type = String(data?.type || "").toLowerCase();
        if (type !== "offer_message" && type !== "new_offer" && type !== "chat_message") return;
        const offerId = String(data?.offerId || data?.offer_id || "").trim();
        if (isDoctor && offerId && (type === "offer_message" || type === "new_offer")) {
          bumpDoctorRequestUnreadByOfferId(offerId, 1);
        }
        emitOfferUnreadEvent({
          type: "offer_realtime_update",
          offerId: offerId || undefined,
          recipient: isDoctor ? "doctor" : "patient",
        });
        if (isDoctor) invalidateDoctorUnreadCacheOnly();
        if (isPatient) invalidatePatientInboxUnreadCache();
      },
    );

    void (async () => {
      if (!navReady) return;
      try {
        const last = await Notifications.getLastNotificationResponseAsync();
        if (last) handleResponse(last as NotificationResponse, "cold_start");
      } catch {
        /* ignore */
      }
    })();

    return () => {
      unsubTap.remove();
      unsubFg.remove();
    };
  }, [token, navReady, handleResponse, isDoctor, isPatient]);

  useEffect(() => {
    if (!navReady || !pendingRef.current) return;
    const pending = pendingRef.current;
    pendingRef.current = null;
    handleResponse(pending, "tap");
  }, [navReady, handleResponse]);
}
