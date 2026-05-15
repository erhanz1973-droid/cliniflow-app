/** After a real write failure / ENOSPC / Cocoa 640 (vs proactive free-space warning). */
export type StorageFailureSeverity = "critical";

/**
 * Detect iOS/Android-style "disk full" errors that break temp/cache writes,
 * downloads, and share sheet preparation (e.g. NSCocoaErrorDomain 640).
 */
export function isLowStorageLikeError(error: unknown): boolean {
  const e = error as { message?: string; code?: string | number; domain?: string; userInfo?: Record<string, unknown> };
  const parts: string[] = [];
  if (e?.message) parts.push(String(e.message));
  if (e?.domain) parts.push(String(e.domain));
  if (e?.code != null) parts.push(String(e.code));
  try {
    if (e?.userInfo && typeof e.userInfo === "object") {
      parts.push(JSON.stringify(e.userInfo).toLowerCase());
    }
  } catch {
    /* ignore */
  }
  const blob = parts.join(" ").toLowerCase();
  if (!blob.trim()) return false;
  if (blob.includes("nscocoaerrordomain") && blob.includes("640")) return true;
  if (/\b640\b/.test(blob) && (blob.includes("cocoa") || blob.includes("save") || blob.includes("write"))) return true;
  if (blob.includes("out of space")) return true;
  if (blob.includes("no space left")) return true;
  if (blob.includes("enospc")) return true;
  if (blob.includes("sqlite_full") || blob.includes("database or disk is full")) return true;
  if (blob.includes("volume") && blob.includes("space")) return true;
  return false;
}

/** All matched errors are treated as critical (actual failure), not heuristic warning. */
export function classifyStorageErrorSeverity(error: unknown): StorageFailureSeverity | null {
  return isLowStorageLikeError(error) ? "critical" : null;
}
