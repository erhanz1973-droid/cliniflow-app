export type FaceBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MouthBox = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

function clampMouthToImage(m: MouthBox, imageWidth: number, imageHeight: number): MouthBox {
  const originX = Math.max(0, Math.min(Math.round(m.originX), imageWidth - 1));
  const originY = Math.max(0, Math.min(Math.round(m.originY), imageHeight - 1));
  const width = Math.max(1, Math.min(Math.round(m.width), imageWidth - originX));
  const height = Math.max(1, Math.min(Math.round(m.height), imageHeight - originY));
  return { originX, originY, width, height };
}

/**
 * Mouth region from a face box (ideal) or full-image fallback when face is missing.
 * Ratios align with backend heuristic (see `getSpecFallbackMouthRectFromFullImage` in `index.cjs`).
 */
export function getMouthRegion(
  face: FaceBox | null,
  imageWidth: number,
  imageHeight: number
): MouthBox {
  if (face) {
    const raw: MouthBox = {
      originX: face.x + face.width * 0.2,
      originY: face.y + face.height * 0.55,
      width: face.width * 0.6,
      height: face.height * 0.3,
    };
    return clampMouthToImage(raw, imageWidth, imageHeight);
  }

  const raw: MouthBox = {
    originX: imageWidth * 0.2,
    originY: imageHeight * 0.6,
    width: imageWidth * 0.6,
    height: imageHeight * 0.25,
  };
  return clampMouthToImage(raw, imageWidth, imageHeight);
}
