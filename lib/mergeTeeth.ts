/**
 * Composite AI upper/lower strips onto the full original image.
 *
 * expo-image-manipulator does not support `overlay` — merge runs on Cliniflow backend
 * (`POST /api/chat/merge-teeth-strips`, Sharp composite).
 */

import { apiPost } from "./api";

import type { MouthBox } from "./mouthDetection";

export async function mergeTeeth(
  originalUri: string,
  upperUri: string,
  lowerUri: string,
  mouth: MouthBox,
  patientId: string
): Promise<string> {
  const data = await apiPost<{ ok?: boolean; url?: string; output?: string[] }>(
    "/api/chat/merge-teeth-strips",
    {
      patientId,
      originalImageUrl: originalUri,
      upperImageUrl: upperUri,
      lowerImageUrl: lowerUri,
      mouth: {
        originX: mouth.originX,
        originY: mouth.originY,
        width: mouth.width,
        height: mouth.height,
      },
    }
  );
  if (!data || (data as { ok?: boolean }).ok === false) {
    throw new Error("merge-teeth-strips failed");
  }
  const out = data as { url?: string; output?: string[] };
  const finalUrl = out.output?.[0] ?? out.url;
  if (!finalUrl) {
    throw new Error("merge-teeth-strips: no url in response");
  }
  return finalUrl;
}
