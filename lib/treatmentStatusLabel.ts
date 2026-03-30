/**
 * encounter_treatments.status (API: küçük harf / snake_case) → i18n anahtarı
 */
export function localizedEncounterTreatmentStatus(
  tr: (key: string) => string,
  raw: unknown
): string {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  switch (s) {
    case "planned":
    case "pending":
      return tr("treatment.status.planned");
    case "scheduled":
      return tr("treatment.status.scheduled");
    case "active":
      return tr("treatment.status.active");
    case "in_progress":
    case "in-progress":
      return tr("treatment.status.inProgress");
    case "completed":
    case "done":
    case "complete":
      return tr("treatment.status.completed");
    case "cancelled":
    case "canceled":
      return tr("treatment.status.cancelled");
    default:
      if (!s) return tr("treatment.status.planned");
      return String(raw ?? "").trim();
  }
}
