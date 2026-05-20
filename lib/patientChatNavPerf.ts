/**
 * Doctor → patient chat navigation timing. Search Metro: patient_chat_nav:
 */
export function markPatientChatNav(
  phase: "press" | "router_called" | "first_frame",
  detail?: Record<string, unknown>
): void {
  if (!__DEV__) return;
  console.log(`[perf:nav] patient_chat_nav:${phase}`, detail ?? {});
}
