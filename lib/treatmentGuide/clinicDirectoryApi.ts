import { API_BASE, getAuthHeaders } from "../api";

export type ClinicDirectoryEntry = {
  id: string;
  name: string;
  city: string | null;
  city_code: string | null;
  country: string | null;
  clinicCode: string | null;
};

export type ClinicDirectoryPayload = {
  clinics: ClinicDirectoryEntry[];
  cities: string[];
  total: number;
  cityCount: number;
};

export async function fetchClinicDirectory(params?: {
  city?: string | null;
  query?: string | null;
  limit?: number;
}): Promise<ClinicDirectoryPayload> {
  const q = new URLSearchParams();
  if (params?.city) q.set("city", params.city);
  if (params?.query) q.set("query", params.query);
  if (params?.limit) q.set("limit", String(params.limit));

  const res = await fetch(
    `${API_BASE.replace(/\/+$/, "")}/api/patient/me/clinic-directory?${q.toString()}`,
    { headers: { Accept: "application/json", ...getAuthHeaders() } },
  );
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !json.ok) {
    throw new Error(String(json.error || json.message || `Request failed (${res.status})`));
  }

  const clinics = Array.isArray(json.clinics)
    ? json.clinics.map((row) => {
        const c = row as Record<string, unknown>;
        return {
          id: String(c.id || ""),
          name: String(c.name || "Clinic"),
          city: c.city != null ? String(c.city) : null,
          city_code: c.city_code != null ? String(c.city_code) : null,
          country: c.country != null ? String(c.country) : null,
          clinicCode: c.clinicCode != null ? String(c.clinicCode) : null,
        };
      })
    : [];

  return {
    clinics,
    cities: Array.isArray(json.cities) ? json.cities.map(String) : [],
    total: typeof json.total === "number" ? json.total : clinics.length,
    cityCount: typeof json.cityCount === "number" ? json.cityCount : 0,
  };
}
