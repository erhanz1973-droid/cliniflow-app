import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";

const HEX64 = /^[a-f0-9]{64}$/i;

export function normalizeContentHash(raw: string | null | undefined): string {
  const h = String(raw || "").trim().toLowerCase();
  return HEX64.test(h) ? h : "";
}

/** SHA-256 of local file bytes (base64 read — works for camera / picker URIs). */
/** Stable SHA-256 for dual-photo analyze cache (smile hash + teeth hash). */
export async function combineContentHashes(
  left: string | null | undefined,
  right: string | null | undefined,
): Promise<string> {
  const a = normalizeContentHash(left);
  const b = normalizeContentHash(right);
  if (!a || !b) return "";
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${a}|${b}`,
    { encoding: Crypto.CryptoEncoding.HEX },
  );
  return normalizeContentHash(digest);
}

export async function sha256LocalFileUri(uri: string): Promise<string | null> {
  const path = String(uri || "").trim();
  if (!path || path.startsWith("http://") || path.startsWith("https://")) return null;
  try {
    const info = await FileSystem.getInfoAsync(path, { size: true } as Parameters<
      typeof FileSystem.getInfoAsync
    >[1]);
    if (!info.exists) return null;
    const b64 = await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (!b64) return null;
    return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, b64, {
      encoding: Crypto.CryptoEncoding.BASE64,
    });
  } catch {
    return null;
  }
}
