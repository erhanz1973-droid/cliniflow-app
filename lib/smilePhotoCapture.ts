/** Smile Score photo capture modes. */
export type SmilePhotoCaptureMode = "smile" | "closeup_teeth";

export const DEFAULT_SMILE_PHOTO_CAPTURE_MODE: SmilePhotoCaptureMode = "smile";

/** API photoType hint for smile-score analysis (smile photo in dual flow). */
export const DEFAULT_SMILE_PHOTO_TYPE = "smile";

/** API photoType hint for teeth close-up in dual flow. */
export const TEETH_CLOSEUP_PHOTO_TYPE = "closeup_teeth";

export const SMILE_PHOTO_CAPTURE_MODES: SmilePhotoCaptureMode[] = ["smile", "closeup_teeth"];

export const SMILE_DUAL_ANALYSIS_MODE = "smile_dual" as const;

/** i18n keys for smile vs teeth capture — keep labels consistent per step. */
export function smilePhotoCaptureLabelKeys(mode: SmilePhotoCaptureMode) {
  if (mode === "closeup_teeth") {
    return {
      stepTitle: "smileDualFlow.step2Title",
      captureTitle: "smileDualFlow.step2CaptureTitle",
      purpose: "smileDualFlow.step2Purpose",
      takePhoto: "smileDualFlow.step2TakePhoto",
      uploadPhoto: "smileDualFlow.step2UploadPhoto",
    } as const;
  }
  return {
    stepTitle: "smileDualFlow.step1Title",
    captureTitle: "smileDualFlow.step1CaptureTitle",
    purpose: "smileDualFlow.step1Purpose",
    takePhoto: "smileDualFlow.step1TakePhoto",
    uploadPhoto: "smileDualFlow.step1UploadPhoto",
  } as const;
}
