import { apiPost } from "./api";

export type ReplicateStripResponse = {
  ok?: boolean;
  url?: string;
  output?: string[];
};

export type TeethStripArch = "upper" | "lower";

/**
 * One Replicate img2img pass on a mouth strip (upper or lower), via backend
 * `POST /api/chat/replicate-teeth-strip`. Lower strips use slightly stronger alignment emphasis.
 */
export async function runAI(
  imageUrl: string,
  patientId: string,
  arch: TeethStripArch = "upper"
): Promise<string> {
  const data = await apiPost<ReplicateStripResponse>("/api/chat/replicate-teeth-strip", {
    patientId,
    imageUrl,
    arch,
  });
  if (!data || data.ok === false) {
    throw new Error("replicate-teeth-strip failed");
  }
  const url = data.output?.[0] ?? data.url;
  if (!url) {
    throw new Error("replicate-teeth-strip: no output url");
  }
  return url;
}
