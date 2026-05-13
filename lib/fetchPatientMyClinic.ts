import { API_BASE, TIMEOUT_GET } from "./api";
import type { ActiveClinic } from "../store/useClinicStore";
import { clearClinic, setClinic } from "../store/useClinicStore";

/** GET /api/patient/me/clinic → ActiveClinic or null */
export async function fetchPatientMyClinic(token: string): Promise<ActiveClinic | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_GET);
  try {
    const res = await fetch(`${API_BASE}/api/patient/me/clinic`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error("invalid_json");
    }
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new Error("auth");
      throw new Error(`http_${res.status}`);
    }
    if (data === null) return null;
    if (typeof data === "object" && data && "ok" in data && (data as { ok?: boolean }).ok === false) {
      throw new Error("api_error");
    }
    if (typeof data !== "object" || !data || !("id" in data) || !("name" in data)) {
      return null;
    }
    const row = data as Record<string, unknown>;
    const id = String(row.id || "").trim();
    const name = String(row.name || "").trim();
    if (!id || !name) return null;
    const logo = row.logo_url;
    const country = row.country;
    return {
      id,
      name,
      logo_url: logo == null || logo === "" ? null : String(logo),
      country: country == null || country === "" ? null : String(country),
    };
  } finally {
    clearTimeout(t);
  }
}

/** On success updates store + cache; on failure leaves existing cache in place. */
export async function refreshActiveClinicFromApi(token: string): Promise<void> {
  try {
    const c = await fetchPatientMyClinic(token);
    if (c) setClinic(c);
    else clearClinic();
  } catch (e) {
    __DEV__ && console.warn("[activeClinic] refresh failed — keeping cached clinic if any", e);
  }
}
