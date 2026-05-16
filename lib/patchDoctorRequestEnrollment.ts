import type { DoctorRequestRow } from "./doctorRequestsCache";
import { DOCTOR_REQUESTS_LIST_CACHE_KEY } from "./doctorRequestsCache";
import { peekCachedResource, setCachedResource } from "./resourceCache";

/** After server confirms enrollment, fix stale list cache so UI stops routing to offer-chat. */
export function patchDoctorRequestEnrollmentInCache(
  requestId: string,
  patch: { lead_thread_is_lead: boolean; enrolled: boolean },
): DoctorRequestRow[] | null {
  const rid = String(requestId || "").trim();
  if (!rid) return null;
  const cached = peekCachedResource<DoctorRequestRow[]>(DOCTOR_REQUESTS_LIST_CACHE_KEY);
  if (!cached?.length) return null;
  const next = cached.map((row) => {
    if (String(row.id) !== rid) return row;
    return {
      ...row,
      lead_thread_is_lead: patch.lead_thread_is_lead,
      threadIsLead: patch.lead_thread_is_lead,
      unread_count: patch.enrolled ? 0 : row.unread_count,
    };
  });
  setCachedResource(DOCTOR_REQUESTS_LIST_CACHE_KEY, next);
  return next;
}
