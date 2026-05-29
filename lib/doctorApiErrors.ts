/** Map backend doctor API error codes to user-visible messages. */

const FALLBACK_TR: Record<string, string> = {
  patient_not_clinic_member:
    "Hasta kliniğe henüz üye değil. İlk muayeneden sonra hastanın Clinifly uygulamasından kliniğe kayıt olması gerekir; üyelik tamamlanmadan klinik tedavi planı kaydı yapılamaz.",
  patient_not_found: "Hasta kaydı bulunamadı.",
  patient_not_assigned: "Bu hasta size atanmamış.",
  no_encounter_for_patient: "Önce muayene kaydı oluşturulmalı.",
};

export function formatDoctorApiError(err: unknown): string {
  const e = err as { code?: string; message?: string; status?: number };
  if (e?.message && String(e.message).trim().length > 8 && !String(e.message).startsWith("{")) {
    return String(e.message).trim();
  }
  const code = String(e?.code || "").trim();
  if (code && FALLBACK_TR[code]) return FALLBACK_TR[code];
  if (code === "patient_not_clinic_member") return FALLBACK_TR.patient_not_clinic_member;
  return code || "İşlem tamamlanamadı.";
}
