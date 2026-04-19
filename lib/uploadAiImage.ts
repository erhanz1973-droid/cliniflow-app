import { API_BASE, getAuthHeaders } from "./api";

/**
 * Upload a local file URI to `POST /api/chat/ai-upload` and return a signed HTTPS URL
 * the backend can fetch (required for strip AI + merge).
 */
export async function uploadLocalImageForAi(localUri: string): Promise<string> {
  const form = new FormData();
  form.append(
    "file",
    {
      uri: localUri,
      name: "photo.jpg",
      type: "image/jpeg",
    } as any
  );

  const url = `${API_BASE}/api/chat/ai-upload`;
  console.log("CALLING API:", url);
  console.trace("API TRACE", url);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
    },
    body: form,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ai-upload ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = JSON.parse(text) as { ok?: boolean; url?: string };
  if (!data.ok || !data.url) {
    throw new Error("ai-upload: missing url");
  }
  return data.url;
}
