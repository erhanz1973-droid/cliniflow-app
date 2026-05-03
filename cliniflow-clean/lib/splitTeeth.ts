import * as ImageManipulator from "expo-image-manipulator";

import type { MouthBox } from "./mouthDetection";

export type SplitTeethResult = {
  upperUri: string;
  lowerUri: string;
};

/**
 * Crop üst / alt yarılar (mouth kutusunun üst %50 ve alt %50’si).
 */
export async function splitTeeth(
  imageUri: string,
  mouth: MouthBox
): Promise<SplitTeethResult> {
  const upperH = Math.max(1, Math.floor(mouth.height / 2));
  const lowerH = Math.max(1, mouth.height - upperH);

  const upper = await ImageManipulator.manipulateAsync(
    imageUri,
    [
      {
        crop: {
          originX: mouth.originX,
          originY: mouth.originY,
          width: mouth.width,
          height: upperH,
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
          originY: mouth.originY + upperH,
          width: mouth.width,
          height: lowerH,
        },
      },
    ],
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
  );

  return {
    upperUri: upper.uri,
    lowerUri: lower.uri,
  };
}
