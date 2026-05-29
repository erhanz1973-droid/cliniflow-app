import { API_BASE } from "./api";

export type DoctorAiCoordinationState = {
  aiSnoozeActive: boolean;
  aiSnoozedUntil: string | null;
  aiPaused: boolean;
  autoReplyAllowed: boolean;
};

export function parseDoctorAiCoordination(json: Record<string, unknown>): DoctorAiCoordinationState {
  const profile =
    json.profile && typeof json.profile === "object"
      ? (json.profile as Record<string, unknown>)
      : null;
  const delegation =
    profile?.delegation && typeof profile.delegation === "object"
      ? (profile.delegation as Record<string, unknown>)
      : null;

  const intake =
    profile?.operationalIntakeFlags && typeof profile.operationalIntakeFlags === "object"
      ? (profile.operationalIntakeFlags as Record<string, unknown>)
      : null;
  const until =
    String(
      delegation?.aiSnoozedUntil ??
        delegation?.ai_snoozed_until ??
        intake?.ai_snoozed_until ??
        intake?.aiSnoozedUntil ??
        "",
    ).trim() || null;

  const untilMs = until ? Date.parse(until) : NaN;
  const snoozeActive =
    delegation?.aiSnoozeActive === true ||
    (Number.isFinite(untilMs) && Date.now() < untilMs);

  return {
    aiSnoozeActive: snoozeActive,
    aiSnoozedUntil: snoozeActive && until ? until : null,
    aiPaused: profile?.aiPaused === true || delegation?.aiPaused === true,
    autoReplyAllowed: delegation?.autoReplyAllowed === true,
  };
}

export function snoozeRemainingLabel(untilIso: string | null): string | null {
  if (!untilIso) return null;
  const ms = Date.parse(untilIso) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const min = Math.max(1, Math.ceil(ms / 60_000));
  return `${min} dk`;
}

export async function fetchDoctorAiCoordination(
  token: string,
  patientId: string,
): Promise<DoctorAiCoordinationState | null> {
  const res = await fetch(
    `${API_BASE}/api/doctor/patients/${encodeURIComponent(patientId)}/ai-coordination`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
  );
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || json.ok === false) return null;
  return parseDoctorAiCoordination(json);
}

export async function resumeDoctorAiForPatient(
  token: string,
  patientId: string,
): Promise<{ ok: boolean; state?: DoctorAiCoordinationState; message?: string }> {
  const res = await fetch(
    `${API_BASE}/api/doctor/patients/${encodeURIComponent(patientId)}/ai-coordination`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ action: "resumeAi", clearEscalation: true }),
    },
  );
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || json.ok === false) {
    return {
      ok: false,
      message:
        typeof json.message === "string"
          ? json.message
          : typeof json.error === "string"
            ? json.error
            : "Kaydedilemedi",
    };
  }
  const delegation =
    json.delegation && typeof json.delegation === "object"
      ? (json.delegation as Record<string, unknown>)
      : null;
  return {
    ok: true,
    state: {
      aiSnoozeActive: false,
      aiSnoozedUntil: null,
      aiPaused: json.aiPaused === true,
      autoReplyAllowed: delegation?.autoReplyAllowed === true,
    },
  };
}

export async function snoozeDoctorAiForPatient(
  token: string,
  patientId: string,
  minutes = 5,
): Promise<{ ok: boolean; state?: DoctorAiCoordinationState; message?: string }> {
  const res = await fetch(
    `${API_BASE}/api/doctor/patients/${encodeURIComponent(patientId)}/ai-coordination`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ action: "snoozeAi", snoozeAiMinutes: minutes }),
    },
  );
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || json.ok === false) {
    return {
      ok: false,
      message:
        typeof json.message === "string"
          ? json.message
          : typeof json.error === "string"
            ? json.error
            : "Kaydedilemedi",
    };
  }
  const delegation =
    json.delegation && typeof json.delegation === "object"
      ? (json.delegation as Record<string, unknown>)
      : null;
  const until = String(json.aiSnoozedUntil ?? delegation?.aiSnoozedUntil ?? "").trim() || null;
  const untilMs = until ? Date.parse(until) : NaN;
  return {
    ok: true,
    state: {
      aiSnoozeActive: json.aiSnoozeActive === true || (Number.isFinite(untilMs) && Date.now() < untilMs),
      aiSnoozedUntil: until,
      aiPaused: json.aiPaused === true,
      autoReplyAllowed: delegation?.autoReplyAllowed === true,
    },
  };
}
