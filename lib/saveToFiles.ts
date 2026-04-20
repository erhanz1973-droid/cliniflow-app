import { API_BASE } from "./api";

export type SaveToFilesInput = {
  token: string;
  patientId: string;
  uri: string;
  name: string;
  mimeType: string;
  /** Used when patient-files upload cannot resolve clinic (fallback: chat upload) */
  clinicId?: string;
  clinicCode?: string;
};

export type SaveToFilesResult = { fileId: string | null; url: string | null };

/**
 * Prefer patient Files vault (`POST /api/patient/:patientId/upload`).
 * Falls back to chat upload when clinic cannot be resolved for the vault.
 */
export async function saveToFiles(input: SaveToFilesInput): Promise<SaveToFilesResult> {
  const { token, patientId, uri, name, mimeType, clinicId, clinicCode } = input;

  const form = new FormData();
  form.append("file", { uri, name, type: mimeType } as any);

  try {
    const res = await fetch(
      `${API_BASE}/api/patient/${encodeURIComponent(patientId)}/upload`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      }
    );
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      file?: { id?: string; url?: string };
    };
    if (res.ok && j?.ok && j.file?.url) {
      return {
        fileId: j.file.id != null ? String(j.file.id) : null,
        url: String(j.file.url),
      };
    }
  } catch {
    /* fall through */
  }

  const cid = String(clinicId || "").trim();
  if (!cid) {
    return { fileId: null, url: null };
  }

  const form2 = new FormData();
  form2.append("files", { uri, name, type: mimeType } as any);
  form2.append("patientId", patientId);
  if (mimeType.startsWith("image/")) form2.append("isImage", "true");
  form2.append("clinicId", cid);
  form2.append("clinic_id", cid);
  const code = clinicCode?.trim();
  if (code) {
    form2.append("clinicCode", code);
    form2.append("clinic_code", code);
  }

  try {
    const r2 = await fetch(`${API_BASE}/api/chat/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      body: form2,
    });
    const j2 = (await r2.json().catch(() => ({}))) as {
      files?: { url?: string }[];
    };
    const url = j2?.files?.[0]?.url;
    if (r2.ok && url) {
      return { fileId: null, url: String(url) };
    }
  } catch {
    /* ignore */
  }

  return { fileId: null, url: null };
}
