/**
 * Lightweight bridge so IntraoralCameraScreen can hand off a captured photo
 * to MessagesScreen's AI pipeline without circular imports.
 *
 * Usage:
 *   messages.tsx  → onIntraoralPhotoReady(fn)     (register on mount)
 *   intraoral-camera.tsx → fireIntraoralPhotoReady(...)  (after confirm)
 */

type PhotoReadyCallback = (
  uri: string,
  name: string,
  mimeType: string,
  photoType: string,
) => void;

let _cb: PhotoReadyCallback | null = null;

export function onIntraoralPhotoReady(fn: PhotoReadyCallback): void {
  _cb = fn;
}

export function fireIntraoralPhotoReady(
  uri: string,
  name: string,
  mimeType: string,
  photoType: string,
): void {
  _cb?.(uri, name, mimeType, photoType);
}
