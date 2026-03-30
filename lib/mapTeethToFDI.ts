/**
 * MVP: map detection boxes → simplified FDI-style labels (11–18 upper, 31–38 lower).
 *
 * - Sort left → right (by box top-left `x`).
 * - Split upper / lower by horizontal midline of the image (`imageHeight / 2`),
 *   using each box **center Y** (`y + height/2`).
 * - Upper arch: `11 + index` (left-to-right order in image).
 * - Lower arch: `31 + index` (left-to-right order in image).
 *
 * Limitations (MVP): front camera mirror, mixed quadrants, and real FDI quadrants
 * (11–18 vs 21–28 etc.) are not modeled — refine with pose / arch heuristics later.
 */

export type ToothBBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
  /** Sunucu / model veriyorsa kullanılır; yoksa MVP FDI ataması yapılır */
  toothNumber?: number;
};

export type ToothBBoxWithFDI = ToothBBox & { toothNumber: number };

/** Center Y of bbox (image pixels). */
function centerY(d: ToothBBox): number {
  return d.y + d.height / 2;
}

/**
 * @param detections — same pixel space as image dimensions
 * @param imageWidth — reserved for future quadrant / mirror logic (FDI quadrants)
 * @param imageHeight — upper/lower split at `imageHeight / 2`
 */
export function mapTeethToFDI(
  detections: ToothBBox[],
  _imageWidth: number,
  imageHeight: number
): ToothBBoxWithFDI[] {
  if (!detections.length) return [];

  const midY =
    imageHeight > 0
      ? imageHeight / 2
      : (() => {
          const cy = detections.map(centerY);
          return (Math.min(...cy) + Math.max(...cy)) / 2;
        })();

  const upper = detections.filter((d) => centerY(d) < midY);
  const lower = detections.filter((d) => centerY(d) >= midY);

  const upperSorted = [...upper].sort((a, b) => a.x - b.x);
  const lowerSorted = [...lower].sort((a, b) => a.x - b.x);

  const upperFDI: ToothBBoxWithFDI[] = upperSorted.map((d, i) => ({
    ...d,
    toothNumber: d.toothNumber ?? 11 + i,
  }));

  const lowerFDI: ToothBBoxWithFDI[] = lowerSorted.map((d, i) => ({
    ...d,
    toothNumber: d.toothNumber ?? 31 + i,
  }));

  return [...upperFDI, ...lowerFDI];
}
