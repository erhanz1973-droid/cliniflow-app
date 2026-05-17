import AsyncStorage from "@react-native-async-storage/async-storage";

const UPLOAD_PREFIX = "@cliniflow:tg-upload:v1:";
const LAST_IMAGE_PREFIX = "@cliniflow:tg-last-image:v1:";

export type UploadedImageRecord = {
  contentHash: string;
  remoteUrl: string;
  fingerprint: string;
  uploadedAt: number;
};

export type LastGuideImageRecord = {
  displayUri: string;
  remoteUrl: string;
  contentHash: string;
  fingerprint: string;
  savedAt: number;
};

function uploadKey(patientId: string, contentHash: string): string {
  return `${UPLOAD_PREFIX}${patientId}:${contentHash}`;
}

function lastImageKey(patientId: string): string {
  return `${LAST_IMAGE_PREFIX}${patientId}`;
}

export async function getUploadedImageByHash(
  patientId: string,
  contentHash: string,
): Promise<UploadedImageRecord | null> {
  const pid = String(patientId || "").trim();
  const hash = String(contentHash || "").trim().toLowerCase();
  if (!pid || !hash) return null;
  try {
    const raw = await AsyncStorage.getItem(uploadKey(pid, hash));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UploadedImageRecord;
    if (!parsed?.remoteUrl) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveUploadedImageRecord(
  patientId: string,
  record: UploadedImageRecord,
): Promise<void> {
  const pid = String(patientId || "").trim();
  if (!pid || !record.contentHash || !record.remoteUrl) return;
  try {
    await AsyncStorage.setItem(uploadKey(pid, record.contentHash), JSON.stringify(record));
  } catch {
    /* non-fatal */
  }
}

export async function loadLastGuideImage(patientId: string): Promise<LastGuideImageRecord | null> {
  const pid = String(patientId || "").trim();
  if (!pid) return null;
  try {
    const raw = await AsyncStorage.getItem(lastImageKey(pid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastGuideImageRecord;
    if (!parsed?.displayUri) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveLastGuideImage(
  patientId: string,
  record: LastGuideImageRecord,
): Promise<void> {
  const pid = String(patientId || "").trim();
  if (!pid || !record.displayUri) return;
  try {
    await AsyncStorage.setItem(lastImageKey(pid), JSON.stringify(record));
  } catch {
    /* non-fatal */
  }
}
