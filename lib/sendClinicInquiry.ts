import { sendMessage } from "./sendMessage";
import type { InquiryAttachment } from "./treatmentGuide/collectInquiryAttachments";

export type SendClinicInquiryInput = {
  token: string;
  clinicId: string;
  clinicCode?: string;
  text: string;
  attachments: InquiryAttachment[];
};

function attachmentUrls(attachments: InquiryAttachment[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of attachments) {
    const u = String(a.url || "").trim();
    if (!/^https?:\/\//i.test(u)) continue;
    const key = u.split("?")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

/**
 * Send inquiry text then each attachment URL to the clinic thread (backend may fan out photo_urls).
 */
export async function sendClinicInquiryBundle(
  input: SendClinicInquiryInput,
): Promise<{ ok: boolean; error?: string }> {
  const { token, clinicId, clinicCode, text, attachments } = input;
  const urls = attachmentUrls(attachments);
  const trimmed = text.trim();

  if (!trimmed && urls.length === 0) {
    return { ok: false, error: "empty_inquiry" };
  }

  if (trimmed) {
    const res = await sendMessage({
      token,
      clinicId,
      clinicCode,
      text: trimmed,
      attachments: attachments.map((a) => a.id).filter((id) => id && id !== "session_dental_photo"),
      attachmentUrls: urls.length > 0 ? urls : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { ok: false, error: (err as { error?: string }).error || `HTTP ${res.status}` };
    }
    if (urls.length <= 1) return { ok: true };
  }

  if (!trimmed && urls.length > 0) {
    const res = await sendMessage({
      token,
      clinicId,
      clinicCode,
      text: ".",
      attachments: [],
      attachmentUrls: urls,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { ok: false, error: (err as { error?: string }).error || `HTTP ${res.status}` };
    }
  }

  return { ok: true };
}
