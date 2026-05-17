import { Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { API_BASE, getAuthHeaders } from "../api";
import {
  ensureCameraAccess,
  ensureMediaLibraryAccessForPicker,
  launchImageLibraryPlayStoreSafe,
} from "../mediaPicker";
import { parseIntakeApiPayload } from "./intakeApi";
import type { IntakeJourneyPayload, OperationalIntakeFlags } from "./types";

export type PickedUploadFile = {
  uri: string;
  name: string;
  mimeType: string;
};

export async function pickIntakeImageFromLibrary(): Promise<PickedUploadFile | null> {
  const ok = await ensureMediaLibraryAccessForPicker();
  if (!ok) return null;

  const result = await launchImageLibraryPlayStoreSafe({
    allowsEditing: false,
    quality: 0.85,
  });
  if (result.canceled || !result.assets?.[0]?.uri) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.fileName || `photo_${Date.now()}.jpg`,
    mimeType: asset.mimeType || "image/jpeg",
  };
}

export async function pickIntakeImageFromCamera(): Promise<PickedUploadFile | null> {
  const ok = await ensureCameraAccess();
  if (!ok) return null;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.85,
  });
  if (result.canceled || !result.assets?.[0]?.uri) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.fileName || `camera_${Date.now()}.jpg`,
    mimeType: asset.mimeType || "image/jpeg",
  };
}

export async function pickIntakeDocumentFile(): Promise<PickedUploadFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["image/*", "application/pdf"],
    multiple: false,
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]?.uri) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.name || `document_${Date.now()}`,
    mimeType: asset.mimeType || "application/octet-stream",
  };
}

type PickMode = "image" | "document" | "both";

export function promptIntakeFilePick(
  mode: PickMode,
  labels: {
    title: string;
    selectImage: string;
    takePhoto: string;
    chooseFile: string;
    cancel: string;
  },
): Promise<PickedUploadFile | null> {
  return new Promise((resolve) => {
    const options: { text: string; onPress: () => void; style?: "cancel" | "default" }[] = [];

    if (mode === "image" || mode === "both") {
      options.push({
        text: labels.selectImage,
        onPress: () => {
          void pickIntakeImageFromLibrary().then(resolve);
        },
      });
      options.push({
        text: labels.takePhoto,
        onPress: () => {
          void pickIntakeImageFromCamera().then(resolve);
        },
      });
    }

    if (mode === "document" || mode === "both") {
      options.push({
        text: labels.chooseFile,
        onPress: () => {
          void pickIntakeDocumentFile().then(resolve);
        },
      });
    }

    options.push({ text: labels.cancel, style: "cancel", onPress: () => resolve(null) });

    Alert.alert(labels.title, undefined, options, { cancelable: true, onDismiss: () => resolve(null) });
  });
}

export type IntakeUploadResult = {
  operationalIntakeFlags: OperationalIntakeFlags | null;
  intakeJourney: IntakeJourneyPayload | null;
};

export async function uploadPatientAiDocument(params: {
  file: PickedUploadFile;
  documentType: string;
  sessionId: string;
  clinicId: string;
}): Promise<IntakeUploadResult> {
  const form = new FormData();
  form.append("file", {
    uri: params.file.uri,
    name: params.file.name,
    type: params.file.mimeType,
  } as unknown as Blob);
  form.append("documentType", params.documentType);
  form.append("sessionId", params.sessionId);
  form.append("clinicId", params.clinicId);
  form.append("uploadConsent", "true");

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...getAuthHeaders(),
  };
  if (Platform.OS === "android") {
    // RN sets multipart boundary when Content-Type is omitted.
  }

  const res = await fetch(`${API_BASE.replace(/\/+$/, "")}/api/patient/me/ai-documents`, {
    method: "POST",
    headers,
    body: form,
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !json.ok) {
    const msg = String(json.message || json.error || `Upload failed (${res.status})`);
    throw new Error(msg);
  }

  const parsed = parseIntakeApiPayload({
    operationalIntakeFlags: json.operationalIntakeFlags,
    intakeJourney: json.intakeJourney,
  });
  return {
    operationalIntakeFlags: parsed.operationalIntakeFlags,
    intakeJourney: parsed.intakeJourney,
  };
}
