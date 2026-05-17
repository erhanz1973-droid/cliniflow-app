import { API_BASE } from "./api";

export type SendMessageInput = {
  token: string;
  clinicId: string;
  clinicCode?: string;
  text: string;
  /** Active treatment offer — mirrors into offer_messages on the backend */
  offerId?: string;
  /** Patient_files row ids when available */
  attachments: string[];
  /** HTTPS URLs from chat/upload fallback */
  attachmentUrls?: string[];
};

/**
 * POST /api/patient/me/messages (veya /api/patient/messages) — metin + clinic_id + photo_urls.
 */
export async function sendMessage(input: SendMessageInput): Promise<Response> {
  const {
    token,
    clinicId,
    clinicCode,
    text,
    offerId,
    attachments,
    attachmentUrls = [],
  } = input;
  const cid = String(clinicId || "").trim();
  const body: Record<string, unknown> = {
    text,
    message: text,
    type: "text",
    clinic_id: cid,
    clinicId: cid,
  };
  const code = clinicCode?.trim();
  if (code) {
    body.clinic_code = code;
    body.clinicCode = code;
  }
  const oid = String(offerId || "").trim();
  if (oid) {
    body.offer_id = oid;
    body.offerId = oid;
  }
  const ids = attachments.map(String).filter(Boolean);
  if (ids.length > 0) {
    body.attachments = ids;
    body.fileIds = ids;
    body.file_ids = ids;
  }
  const urls = attachmentUrls.filter((u) => /^https?:\/\//i.test(String(u).trim()));
  if (urls.length > 0) {
    body.photo_urls = urls;
  }

  return fetch(`${API_BASE}/api/patient/me/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
