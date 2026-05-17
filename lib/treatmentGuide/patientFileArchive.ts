import * as FileSystem from "expo-file-system";
import { API_BASE, getAuthHeaders, resolvePublicAssetUrl } from "../api";
import { uploadPatientAiDocument, type PickedUploadFile } from "./uploadDocument";

export type PatientArchiveFile = {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  fileType: "image" | "xray" | "pdf" | "file";
  createdAt: number;
};

export async function fetchPatientArchiveFiles(patientId: string): Promise<PatientArchiveFile[]> {
  const pid = String(patientId || "").trim();
  if (!pid) return [];
  const res = await fetch(`${API_BASE}/api/patient/${encodeURIComponent(pid)}/files`, {
    headers: { ...getAuthHeaders(), Accept: "application/json" },
  });
  const json = (await res.json().catch(() => ({}))) as { files?: PatientArchiveFile[] };
  if (!res.ok || !Array.isArray(json.files)) return [];
  return json.files;
}

export function archiveFileDisplayUrl(file: PatientArchiveFile): string {
  return resolvePublicAssetUrl(file.url);
}

export function isArchiveVisualFile(file: PatientArchiveFile): boolean {
  return (
    file.fileType === "image" ||
    file.fileType === "xray" ||
    String(file.mimeType || "").startsWith("image/")
  );
}

export function documentTypeForArchiveFile(file: PatientArchiveFile): string {
  if (file.fileType === "xray") return "panoramic_xray";
  return "intraoral_photo";
}

export async function uploadPatientAiDocumentFromArchive(params: {
  file: PatientArchiveFile;
  sessionId: string;
  clinicId: string;
  documentType?: string;
}): Promise<Awaited<ReturnType<typeof uploadPatientAiDocument>>> {
  const remote = archiveFileDisplayUrl(params.file);
  if (!/^https?:\/\//i.test(remote)) {
    throw new Error("invalid_archive_url");
  }
  const ext =
    remote.match(/\.(jpe?g|png|webp|heic|pdf)(?:\?|$)/i)?.[1]?.toLowerCase() ||
    (params.file.mimeType?.includes("pdf") ? "pdf" : "jpg");
  const dest = `${FileSystem.cacheDirectory}archive_${Date.now()}.${ext}`;
  const dl = await FileSystem.downloadAsync(remote, dest);
  const mime =
    params.file.mimeType ||
    (ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : "image/jpeg");
  const picked: PickedUploadFile = {
    uri: dl.uri,
    name: params.file.name || `archive_${Date.now()}.${ext}`,
    mimeType: mime,
  };
  return uploadPatientAiDocument({
    file: picked,
    documentType: params.documentType || documentTypeForArchiveFile(params.file),
    sessionId: params.sessionId,
    clinicId: params.clinicId,
  });
}
