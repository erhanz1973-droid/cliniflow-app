/**
 * Canonical telemetry event names (product / device ops). Pair with {@link trackEvent}.
 * Dashboard: wire `flushNow()` in trackEvent.ts to PostHog, Firebase, or your API.
 */
export const AnalyticsEvents = {
  notificationPermissionMissing: "notification_permission_missing",
  storageLowDetected: "storage_low_detected",
  deviceLowStorageDetected: "device_low_storage_detected",
  attachmentStorageFailure: "attachment_storage_failure",
  attachmentDownloadBlocked: "attachment_download_blocked",
  attachmentDownloadFailed: "attachment_download_failed",
  attachmentUploadBlocked: "attachment_upload_blocked",
  attachmentUploadFailed: "attachment_upload_failed",
} as const;
