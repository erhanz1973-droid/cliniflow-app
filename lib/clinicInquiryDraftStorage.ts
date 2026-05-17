import AsyncStorage from "@react-native-async-storage/async-storage";
import type { InquiryAttachment } from "./treatmentGuide/collectInquiryAttachments";

export const CLINIC_INQUIRY_DRAFT_KEY = "@cliniflow:clinic-inquiry-draft:v1";

export type StoredClinicInquiryDraft = {
  text: string;
  /** All files included when sharing with clinic */
  attachments: InquiryAttachment[];
  /** @deprecated use attachments[].url */
  photoUrls?: string[];
  savedAt: number;
};

export async function saveClinicInquiryDraftForQuote(
  draft: StoredClinicInquiryDraft,
): Promise<void> {
  const photoUrls =
    draft.photoUrls ??
    draft.attachments
      .map((a) => String(a.url || "").trim())
      .filter((u) => /^https?:\/\//i.test(u));
  await AsyncStorage.setItem(
    CLINIC_INQUIRY_DRAFT_KEY,
    JSON.stringify({ ...draft, photoUrls }),
  );
}

export async function loadClinicInquiryDraftForQuote(): Promise<StoredClinicInquiryDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(CLINIC_INQUIRY_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredClinicInquiryDraft;
    if (!parsed?.text?.trim()) return null;
    const attachments = Array.isArray(parsed.attachments) ? parsed.attachments : [];
    if (attachments.length === 0 && Array.isArray(parsed.photoUrls) && parsed.photoUrls.length > 0) {
      return {
        ...parsed,
        attachments: parsed.photoUrls.map((url, i) => ({
          id: `legacy_photo_${i}`,
          kind: "photo" as const,
          label: "Photo",
          url,
          thumbnailUrl: url,
        })),
      };
    }
    return { ...parsed, attachments };
  } catch {
    return null;
  }
}

export async function clearClinicInquiryDraftForQuote(): Promise<void> {
  await AsyncStorage.removeItem(CLINIC_INQUIRY_DRAFT_KEY);
}
