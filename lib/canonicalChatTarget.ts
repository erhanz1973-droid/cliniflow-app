/**
 * Single source of truth: offer-chat vs patient-chat vs redirects.
 * Reuse for navigation, push routing, unread channels, and inbox row actions.
 */
export type ChatViewerRole = "doctor" | "patient";

export type CanonicalChatChannel = "offer" | "patient" | "none";

export type CanonicalChatKind =
  | "offer_chat"
  | "patient_chat"
  | "patient_chat_tab"
  | "redirect_patients"
  | "redirect_requests"
  | "redirect_home"
  | "blocked";

export type ResolveCanonicalChatInput = {
  viewerRole: ChatViewerRole;
  patientId?: string | null;
  patientName?: string;
  offerId?: string | null;
  /** Pre-proposal coordination workspace (same channel as offer chat). */
  coordinationOfferId?: string | null;
  requestId?: string | null;
  leadThreadIsLead?: unknown;
  /** Server/bootstrap: patient joined clinic (shared care). */
  enrolled?: boolean;
  /** ensure-offer-chat / push: explicit route hint. */
  bootstrapRoute?: "offer_chat" | "patient_chat" | string | null;
  treatmentType?: string | null;
  otherPartyName?: string;
  /** Inbox row from thread-summary */
  threadKind?: "patient" | "offer" | string | null;
};

export type CanonicalChatTarget =
  | {
      channel: "offer";
      kind: "offer_chat";
      offerId: string;
      patientId: string | null;
      leadThreadIsLead: boolean | null;
      routeParams: {
        offerId: string;
        otherName: string;
        treatmentType: string;
        enrolledSharedCare: string;
        patientChatPatientId: string;
      };
      path: string;
    }
  | {
      channel: "patient";
      kind: "patient_chat";
      patientId: string;
      offerId: string | null;
      routeParams: {
        patientId: string;
        patientName: string;
        sourceOfferId?: string;
        sourceRequestId?: string;
      };
      path: string;
    }
  | {
      channel: "patient";
      kind: "patient_chat_tab";
      path: string;
    }
  | {
      channel: "none";
      kind: "redirect_patients" | "redirect_requests" | "redirect_home" | "blocked";
      reason: string;
      path: string;
    };

/** Coerce API / JSON quirks (`"false"`, `0`) before lifecycle checks. */
export function normalizeLeadThreadIsLead(raw: unknown): boolean | null {
  if (raw === true || raw === "true" || raw === 1 || raw === "1") return true;
  if (raw === false || raw === "false" || raw === 0 || raw === "0") return false;
  return null;
}

/** Shared-care / enrolled: canonical messaging is patient_chat, not offer_messages. */
export function isEnrolledSharedCare(input: {
  leadThreadIsLead?: unknown;
  enrolled?: boolean;
  bootstrapRoute?: string | null;
}): boolean {
  if (input.enrolled === true) return true;
  const route = String(input.bootstrapRoute || "").trim().toLowerCase();
  if (route === "patient_chat") return true;
  return normalizeLeadThreadIsLead(input.leadThreadIsLead) === false;
}

export function resolvePatientPk(patientId?: string | null): string | null {
  const id = String(patientId || "").trim();
  if (!id || id === "undefined" || id === "null") return null;
  return id;
}

export function buildOfferChatPath(
  offerId: string,
  otherName: string,
  extras?: { treatmentType?: string; enrolledSharedCare?: boolean },
): string {
  const q = new URLSearchParams({
    offerId,
    otherName: encodeURIComponent(otherName || "Patient"),
  });
  if (extras?.treatmentType) q.set("treatmentType", extras.treatmentType);
  if (extras?.enrolledSharedCare) q.set("enrolledSharedCare", "1");
  return `/offer-chat?${q.toString()}`;
}

export function buildPatientChatPath(
  patientId: string,
  patientName: string,
  extras?: { sourceOfferId?: string; sourceRequestId?: string },
): string {
  const q = new URLSearchParams({
    patientId,
    patientName: encodeURIComponent(patientName || "Patient"),
  });
  if (extras?.sourceOfferId) q.set("sourceOfferId", extras.sourceOfferId);
  if (extras?.sourceRequestId) q.set("sourceRequestId", extras.sourceRequestId);
  return `/doctor/patient-chat?${q.toString()}`;
}

function patientChatRouteParams(
  patientPk: string,
  patientName: string,
  input: ResolveCanonicalChatInput,
): { patientId: string; patientName: string; sourceOfferId?: string; sourceRequestId?: string } {
  const routeParams: {
    patientId: string;
    patientName: string;
    sourceOfferId?: string;
    sourceRequestId?: string;
  } = {
    patientId: patientPk,
    patientName: encodeURIComponent(patientName),
  };
  const oid = String(input.offerId || "").trim();
  const rid = String(input.requestId || "").trim();
  if (oid) routeParams.sourceOfferId = oid;
  if (rid) routeParams.sourceRequestId = rid;
  return routeParams;
}

/**
 * Authoritative resolver — returns exactly one active communication target.
 */
export function resolveCanonicalChatTarget(input: ResolveCanonicalChatInput): CanonicalChatTarget {
  const viewerRole = input.viewerRole;
  const offerId = String(
    input.offerId || input.coordinationOfferId || "",
  ).trim();
  const patientPk = resolvePatientPk(input.patientId);
  const patientName = String(input.patientName || input.otherPartyName || "Patient").trim() || "Patient";
  const enrolled = isEnrolledSharedCare(input);
  const treatmentType = String(input.treatmentType || "").trim();

  if (viewerRole === "doctor") {
    if (enrolled) {
      if (patientPk) {
        const routeParams = patientChatRouteParams(patientPk, patientName, input);
        return {
          channel: "patient",
          kind: "patient_chat",
          patientId: patientPk,
          offerId: offerId || null,
          routeParams,
          path: buildPatientChatPath(patientPk, patientName, {
            sourceOfferId: routeParams.sourceOfferId,
            sourceRequestId: routeParams.sourceRequestId,
          }),
        };
      }
      return {
        channel: "none",
        kind: "redirect_patients",
        reason: "enrolled_missing_patient_id",
        path: "/doctor/patients",
      };
    }

    if (input.threadKind === "offer" && offerId) {
      const routeParams = {
        offerId,
        otherName: encodeURIComponent(patientName),
        treatmentType,
        enrolledSharedCare: "0",
        patientChatPatientId: patientPk || "",
      };
      return {
        channel: "offer",
        kind: "offer_chat",
        offerId,
        patientId: patientPk,
        leadThreadIsLead: normalizeLeadThreadIsLead(input.leadThreadIsLead) ?? true,
        routeParams,
        path: buildOfferChatPath(offerId, patientName, { treatmentType }),
      };
    }

    if (offerId) {
      const routeParams = {
        offerId,
        otherName: encodeURIComponent(patientName),
        treatmentType,
        enrolledSharedCare: "0",
        patientChatPatientId: patientPk || "",
      };
      return {
        channel: "offer",
        kind: "offer_chat",
        offerId,
        patientId: patientPk,
        leadThreadIsLead: normalizeLeadThreadIsLead(input.leadThreadIsLead) ?? true,
        routeParams,
        path: buildOfferChatPath(offerId, patientName, { treatmentType }),
      };
    }

    if (patientPk) {
      const routeParams = patientChatRouteParams(patientPk, patientName, input);
      return {
        channel: "patient",
        kind: "patient_chat",
        patientId: patientPk,
        offerId: null,
        routeParams,
        path: buildPatientChatPath(patientPk, patientName),
      };
    }

    if (String(input.requestId || "").trim()) {
      return {
        channel: "none",
        kind: "redirect_requests",
        reason: "no_offer_on_request",
        path: "/doctor/requests",
      };
    }

    return {
      channel: "none",
      kind: "blocked",
      reason: "doctor_no_chat_target",
      path: "/doctor/requests",
    };
  }

  // patient viewer
  if (enrolled) {
    return {
      channel: "patient",
      kind: "patient_chat_tab",
      path: "/(tabs)/chat",
    };
  }

  if (offerId) {
    const routeParams = {
      offerId,
      otherName: encodeURIComponent(patientName),
      treatmentType,
      enrolledSharedCare: "0",
      patientChatPatientId: patientPk || "",
    };
    return {
      channel: "offer",
      kind: "offer_chat",
      offerId,
      patientId: patientPk,
      leadThreadIsLead: normalizeLeadThreadIsLead(input.leadThreadIsLead),
      routeParams,
      path: buildOfferChatPath(offerId, patientName, { treatmentType }),
    };
  }

  if (String(input.requestId || "").trim()) {
    return {
      channel: "none",
      kind: "redirect_requests",
      reason: "patient_open_coordination_from_requests",
      path: "/my-requests",
    };
  }

  return {
    channel: "none",
    kind: "redirect_home",
    reason: "patient_no_offer",
    path: "/(tabs)/home",
  };
}

/** Unread tallies: offer_messages vs clinic messages — never double-count enrolled rows. */
export function canonicalUnreadChannel(
  input: Pick<ResolveCanonicalChatInput, "leadThreadIsLead" | "enrolled" | "bootstrapRoute" | "threadKind">,
): CanonicalChatChannel {
  if (isEnrolledSharedCare(input)) return "patient";
  if (input.threadKind === "offer") return "offer";
  return "offer";
}

export function shouldCountOfferThreadUnread(
  input: Pick<ResolveCanonicalChatInput, "leadThreadIsLead" | "enrolled" | "bootstrapRoute">,
): boolean {
  return !isEnrolledSharedCare(input);
}

export function pathFromCanonicalTarget(target: CanonicalChatTarget): string | null {
  if (target.kind === "blocked") return null;
  return target.path;
}

export function pushDataToResolveInput(
  data: Record<string, unknown>,
  viewerRole: ChatViewerRole,
): ResolveCanonicalChatInput {
  const first = (keys: string[]) => {
    for (const k of keys) {
      const v = data[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };
  return {
    viewerRole,
    offerId: first(["offerId", "offer_id", "coordinationOfferId", "coordination_offer_id"]),
    patientId: first(["patientId", "patient_id"]),
    patientName: first(["patientName", "patient_name"]) || "Patient",
    requestId: first(["requestId", "request_id"]),
    leadThreadIsLead: data.lead_thread_is_lead ?? data.leadThreadIsLead,
    enrolled: data.enrolled === true || data.enrolled === "true" || data.enrolled === 1,
    bootstrapRoute: first(["route", "bootstrapRoute"]),
    treatmentType: first(["treatmentType", "treatment_type"]),
    otherPartyName: first(["senderName", "sender_name", "title"]),
  };
}
