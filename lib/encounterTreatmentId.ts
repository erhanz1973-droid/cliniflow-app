/**
 * encounter_treatments satırı için gerçek UUID; bazı ekranlar sentetik önekli id üretir.
 * Birden fazla UUID içeren metinde "son UUID" almak yanlış id'ye (PUT 404) yol açabiliyordu.
 */
const PLAIN_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_SEGMENT =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

export type TreatmentIdKind = "plain_uuid" | "synthetic_embedded_uuid" | "invalid";

export function isPlainEncounterTreatmentUuid(raw: unknown): boolean {
  const s = String(raw ?? "").trim();
  return s.length > 0 && PLAIN_UUID.test(s);
}

/**
 * API'den gelen düz UUID'ye dokunma; yalnızca sentetik / birleşik id'lerde gömülü UUID'yi çıkar.
 */
export function resolveEncounterTreatmentId(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  /**
   * patient-json-* id sonundaki UUID, patients.treatments içindeki procedure id olur;
   * encounter_treatments.id ile karıştırılırsa PATCH 404 (treatment_not_found) verir — asla döndürme.
   */
  if (s.toLowerCase().includes("patient-json")) return null;

  if (PLAIN_UUID.test(s)) return s;

  const lower = s.toLowerCase();
  const enc = s.match(
    /encounter-treatment-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i
  );
  if (enc?.[1]) return enc[1];

  if (lower.includes("encounter-treatment")) {
    const matches = s.match(UUID_SEGMENT);
    if (matches?.length === 1) return matches[0];
    if (matches?.length) return matches[matches.length - 1];
  }

  return null;
}

export function classifyTreatmentId(raw: unknown): TreatmentIdKind {
  const s = String(raw ?? "").trim();
  if (!s) return "invalid";
  if (PLAIN_UUID.test(s)) return "plain_uuid";
  if (resolveEncounterTreatmentId(raw)) return "synthetic_embedded_uuid";
  return "invalid";
}
