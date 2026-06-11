/** Smile Score photo capture modes (MVP: smile only). */
export type SmilePhotoCaptureMode = "smile" | "closeup_teeth";

export const DEFAULT_SMILE_PHOTO_CAPTURE_MODE: SmilePhotoCaptureMode = "smile";

/** API photoType hint for smile-score analysis. */
export const DEFAULT_SMILE_PHOTO_TYPE = "smile";

export const SMILE_PHOTO_CAPTURE_MODES: SmilePhotoCaptureMode[] = ["smile", "closeup_teeth"];
