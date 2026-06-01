import AsyncStorage from "@react-native-async-storage/async-storage";

const PENDING_CODE_KEY = "cf_pending_clinic_invite_code";
const PENDING_NAME_KEY = "cf_pending_clinic_invite_name";
const PENDING_VIA_INVITE_KEY = "cf_pending_clinic_invite_via_qr";

export type PendingClinicInvite = {
  code: string;
  clinicName?: string;
  viaInvitation: boolean;
};

export function normalizeClinicInviteCode(raw: string | null | undefined): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "");
}

/** Parse clinifly://clinic-invite/CODE or https://host/invite/CODE */
export function parseClinicInviteFromUrl(url: string | null | undefined): string | null {
  const u = String(url || "").trim();
  if (!u) return null;
  try {
    const parsed = new URL(u.replace(/^clinifly:/i, "https://clinifly.app/"));
    const path = parsed.pathname || "";
    const inviteMatch = path.match(/\/invite\/([^/?#]+)/i);
    if (inviteMatch?.[1]) return normalizeClinicInviteCode(decodeURIComponent(inviteMatch[1]));
    const deepMatch = path.match(/\/clinic-invite\/([^/?#]+)/i);
    if (deepMatch?.[1]) return normalizeClinicInviteCode(decodeURIComponent(deepMatch[1]));
    const q = parsed.searchParams.get("invite") || parsed.searchParams.get("clinicCode");
    if (q) return normalizeClinicInviteCode(q);
  } catch {
    const m = u.match(/(?:invite|clinic-invite)\/([A-Za-z0-9_-]+)/i);
    if (m?.[1]) return normalizeClinicInviteCode(m[1]);
  }
  return null;
}

export async function savePendingClinicInvite(invite: PendingClinicInvite): Promise<void> {
  const code = normalizeClinicInviteCode(invite.code);
  if (!code) return;
  await AsyncStorage.multiSet([
    [PENDING_CODE_KEY, code],
    [PENDING_NAME_KEY, invite.clinicName || ""],
    [PENDING_VIA_INVITE_KEY, invite.viaInvitation ? "1" : "0"],
  ]);
}

export async function getPendingClinicInvite(): Promise<PendingClinicInvite | null> {
  const pairs = await AsyncStorage.multiGet([
    PENDING_CODE_KEY,
    PENDING_NAME_KEY,
    PENDING_VIA_INVITE_KEY,
  ]);
  const map = Object.fromEntries(pairs);
  const code = normalizeClinicInviteCode(map[PENDING_CODE_KEY]);
  if (!code) return null;
  return {
    code,
    clinicName: map[PENDING_NAME_KEY] || undefined,
    viaInvitation: map[PENDING_VIA_INVITE_KEY] === "1",
  };
}

export async function clearPendingClinicInvite(): Promise<void> {
  await AsyncStorage.multiRemove([
    PENDING_CODE_KEY,
    PENDING_NAME_KEY,
    PENDING_VIA_INVITE_KEY,
  ]);
}
