import { Paths } from "expo-file-system";

const MB = 1024 * 1024;

/** Minimum free space — below this we block heavy file ops proactively. */
export const DISK_BLOCK_BELOW_BYTES = 35 * MB;

/** Soft threshold: warn if below this (unless already blocked). */
export const DISK_WARN_BELOW_BYTES = 150 * MB;

export function getAvailableDiskBytes(): number | null {
  try {
    const n = Paths.availableDiskSpace;
    if (typeof n === "number" && Number.isFinite(n) && n >= 0) return n;
  } catch {
    return null;
  }
  return null;
}

/** Coarse bucket for analytics (avoid sending exact free bytes). */
export function diskSpaceBand(freeBytes: number | null): string {
  if (freeBytes == null) return "unknown";
  const mb = freeBytes / MB;
  if (mb < 35) return "lt_35mb";
  if (mb < 80) return "35_80mb";
  if (mb < 150) return "80_150mb";
  if (mb < 500) return "150_500mb";
  return "gt_500mb";
}

export type ProactiveDiskLevel = "ok" | "warning" | "blocked";

/**
 * @param reserveBytes Recommended headroom for the operation (e.g. expected download size).
 */
export function evaluateProactiveDiskLevel(freeBytes: number | null, reserveBytes: number): ProactiveDiskLevel {
  if (freeBytes == null) return "ok";
  const blockThreshold = Math.max(DISK_BLOCK_BELOW_BYTES, reserveBytes);
  if (freeBytes < blockThreshold) return "blocked";
  const warnThreshold = Math.max(DISK_WARN_BELOW_BYTES, reserveBytes + 30 * MB);
  if (freeBytes < warnThreshold) return "warning";
  return "ok";
}
