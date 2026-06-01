import { API_BASE } from "./api";

type StoredUser = {
  token: string;
  type?: "patient" | "doctor" | "admin";
  role?: "PATIENT" | "DOCTOR" | "ADMIN";
  patientId?: string;
  doctorId?: string;
  clinicId?: string;
  clinicCode?: string;
  status?: string;
  id?: string;
};

type RefreshResponse = {
  ok?: boolean;
  token?: string;
  type?: string;
  role?: string;
  patientId?: string;
  doctorId?: string;
  clinicId?: string;
  clinicCode?: string;
  status?: string;
};

/** If the stored JWT is expired, silently renew it so the user stays signed in. */
export async function refreshSessionTokenIfNeeded(user: StoredUser): Promise<StoredUser> {
  const token = String(user.token || "").trim();
  if (!token) return user;

  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh-session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) return user;
    const data = (await res.json()) as RefreshResponse;
    if (!data.ok || !data.token) return user;

    return {
      ...user,
      token: data.token,
      type:
        (data.type as StoredUser["type"]) ||
        user.type ||
        (String(data.role || "").toUpperCase() === "DOCTOR" ? "doctor" : "patient"),
      role: (data.role as StoredUser["role"]) || user.role,
      patientId: data.patientId || user.patientId,
      doctorId: data.doctorId || user.doctorId,
      clinicId: data.clinicId || user.clinicId,
      clinicCode: data.clinicCode || user.clinicCode,
      status: data.status || user.status,
    };
  } catch {
    return user;
  }
}
