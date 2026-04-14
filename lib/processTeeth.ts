import type { FaceBox } from "./mouthDetection";
import { getMouthRegion } from "./mouthDetection";
import { mergeTeeth } from "./mergeTeeth";
import { runAI } from "./runAI";
import { splitTeeth } from "./splitTeeth";
import { uploadLocalImageForAi } from "./uploadAiImage";

function isRemoteUri(uri: string): boolean {
  return uri.startsWith("http://") || uri.startsWith("https://");
}

export type ProcessTeethParams = {
  imageUri: string;
  face: FaceBox | null;
  imageWidth: number;
  imageHeight: number;
  patientId: string;
};

/**
 * Full client strip flow: mouth ROI → split → upload local URIs → AI each strip → merge on server.
 * Requires auth token (`setAuthToken` in lib/api) and backend v31+ (replicate-teeth-strip + merge-teeth-strips).
 */
export async function processTeeth(params: ProcessTeethParams): Promise<string> {
  const { imageUri, face, imageWidth, imageHeight, patientId } = params;

  const mouth = getMouthRegion(face, imageWidth, imageHeight);
  const { upperUri, lowerUri } = await splitTeeth(imageUri, mouth);

  const originalRemote = isRemoteUri(imageUri)
    ? imageUri
    : await uploadLocalImageForAi(imageUri);
  const upperRemote = isRemoteUri(upperUri)
    ? upperUri
    : await uploadLocalImageForAi(upperUri);
  const lowerRemote = isRemoteUri(lowerUri)
    ? lowerUri
    : await uploadLocalImageForAi(lowerUri);

  const [upperAI, lowerAI] = await Promise.all([
    runAI(upperRemote, patientId, "upper"),
    runAI(lowerRemote, patientId, "lower"),
  ]);

  return mergeTeeth(originalRemote, upperAI, lowerAI, mouth, patientId);
}
