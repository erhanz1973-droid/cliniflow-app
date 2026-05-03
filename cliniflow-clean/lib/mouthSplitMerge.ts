/**
 * Mouth crop + upper/lower split (matches backend heuristic in index.cjs:
 * getSpecFallbackMouthRectFromFullImage — ~x+20%·W, y+55%·H, w=60%·h=30%).
 *
 * Full dual-region AI + merge runs on Cliniflow backend (`POST /api/chat/smile-simulation`).
 * expo-image-manipulator has no overlay/composite action — `mergeResults` below explains options.
 */

import * as ImageManipulator from "expo-image-manipulator";

/** Face box from ML Kit / expo-face-detector / vision-camera, etc. */
export type FaceBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Pixel-aligned mouth rectangle in full-image coordinates. */
export type MouthRect = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

/** Same ratios as backend fallback mouth band. */
export function approximateMouthFromFace(face: FaceBounds): MouthRect {
  const originX = Math.round(face.x + face.width * 0.2);
  const originY = Math.round(face.y + face.height * 0.55);
  const width = Math.round(face.width * 0.6);
  const height = Math.round(face.height * 0.35);
  return { originX, originY, width, height };
}

export type SplitMouthResult = {
  upper: string;
  lower: string;
  mouth: MouthRect;
};

/**
 * Crop mouth from full image, then split into top 50% / bottom 50% (üst / alt diş).
 */
export async function splitMouth(
  imageUri: string,
  face: FaceBounds
): Promise<SplitMouthResult> {
  const mouth = approximateMouthFromFace(face);
  const halfH = Math.max(1, Math.floor(mouth.height / 2));

  const upper = await ImageManipulator.manipulateAsync(
    imageUri,
    [
      {
        crop: {
          originX: mouth.originX,
          originY: mouth.originY,
          width: mouth.width,
          height: halfH,
        },
      },
    ],
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
  );

  const lower = await ImageManipulator.manipulateAsync(
    imageUri,
    [
      {
        crop: {
          originX: mouth.originX,
          originY: mouth.originY + halfH,
          width: mouth.width,
          height: mouth.height - halfH,
        },
      },
    ],
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
  );

  return { upper: upper.uri, lower: lower.uri, mouth };
}

/**
 * expo-image-manipulator does **not** support overlaying one image onto another (no composite action).
 * Your sample used `overlay` — that API is not available in Expo’s manipulator.
 *
 * **Recommended:** upload the full photo, call Cliniflow `POST /api/chat/smile-simulation` — the server
 * runs dual upper/lower Replicate strips and merges (see root `index.cjs` `replicateDualRegionTeethImg2Img`).
 *
 * **If you must merge client-side:** stack `Image` views (original + positioned upper/lower results)
 * and capture with `react-native-view-shot` or use Skia — add those dependencies separately.
 */
export async function mergeResults(
  _originalUri: string,
  _upperUri: string,
  _lowerUri: string,
  _mouth: MouthRect
): Promise<string> {
  throw new Error(
    "[mouthSplitMerge] mergeResults is not implemented: expo-image-manipulator cannot overlay images. " +
      "Use backend smile-simulation for dual-region merge, or composite with ViewShot/Skia."
  );
}
