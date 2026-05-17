import AsyncStorage from "@react-native-async-storage/async-storage";

export const CLINIC_INQUIRY_DRAFT_KEY = "@cliniflow:clinic-inquiry-draft:v1";

export type StoredClinicInquiryDraft = {
  text: string;
  photoUrls: string[];
  savedAt: number;
};

export async function saveClinicInquiryDraftForQuote(
  draft: StoredClinicInquiryDraft,
): Promise<void> {
  await AsyncStorage.setItem(CLINIC_INQUIRY_DRAFT_KEY, JSON.stringify(draft));
}

export async function loadClinicInquiryDraftForQuote(): Promise<StoredClinicInquiryDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(CLINIC_INQUIRY_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredClinicInquiryDraft;
    if (!parsed?.text?.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearClinicInquiryDraftForQuote(): Promise<void> {
  await AsyncStorage.removeItem(CLINIC_INQUIRY_DRAFT_KEY);
}
