/** Cached treatment-plan / diagnosis screen payloads (per patient). */

import { recordCacheMetric } from "./cacheMetrics";
import { peekCachedResource, setCachedResource } from "./resourceCache";

export type TreatmentPlanCachePayload = {
  treatments: unknown[];
  diagnoses: unknown[];
  doctors: unknown[];
};

/** Cached diagnosis screen (primary VM for doctor:diagnosis:{patientId}). */
export type DiagnosisScreenCache = {
  diagnoses: unknown[];
  treatments: unknown[];
  encounterId?: string;
};

export function treatmentPlanCacheKey(patientId: string): string {
  return `doctor:treatment-plan:${String(patientId).trim()}`;
}

export function diagnosisScreenCacheKey(patientId: string): string {
  return `doctor:diagnosis:${String(patientId).trim()}`;
}

export function peekDiagnosisScreenCache(patientId: string): DiagnosisScreenCache | null {
  const pid = String(patientId).trim();
  if (!pid) return null;
  const key = diagnosisScreenCacheKey(pid);
  const hit = peekCachedResource<DiagnosisScreenCache>(key);
  recordCacheMetric(hit ? "diagnosis_cache_hit" : "diagnosis_cache_miss", { patientId: pid, key });
  return hit;
}

export function writeDiagnosisScreenCache(patientId: string, payload: DiagnosisScreenCache): void {
  const pid = String(patientId).trim();
  if (!pid) return;
  setCachedResource(diagnosisScreenCacheKey(pid), payload);
  setCachedResource(treatmentPlanCacheKey(pid), {
    diagnoses: payload.diagnoses,
    treatments: payload.treatments,
    doctors: [],
  });
}
