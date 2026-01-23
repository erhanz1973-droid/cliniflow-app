import React, { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { API_BASE } from "@/lib/api";

export default function XrayUploadScreen() {
  const [uploading, setUploading] = useState(false);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pickAndUpload() {
    setError(null);
    setLastUrl(null);

    const res = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "application/pdf"],
      multiple: false,
      copyToCacheDirectory: true,
    });

    if (res.canceled) return;

    const file = res.assets?.[0];
    if (!file?.uri) return;

    try {
      setUploading(true);

      const form = new FormData();
      form.append("patientId", "p1");
      form.append("kind", "xray");

      // RN/Expo FormData file
      form.append("file", {
        uri: file.uri,
        name: file.name || "xray.pdf",
        type: file.mimeType || "application/octet-stream",
      } as any);

      const r = await fetch(`${API_BASE}/api/upload/xray`, {
        method: "POST",
        body: form,
      });

      const json = await r.json();
      if (!r.ok || !json.ok) {
        throw new Error(json?.error || `Upload failed: ${r.status}`);
      }

      setLastUrl(`${API_BASE}${json.url}`);
    } catch (e: any) {
      setError(e?.message || "Upload error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>X-ray Upload</Text>

      <Pressable style={styles.btn} onPress={pickAndUpload} disabled={uploading}>
        <Text style={styles.btnText}>{uploading ? "Uploading..." : "Pick & Upload"}</Text>
      </Pressable>

      {uploading && <ActivityIndicator style={{ marginTop: 12 }} />}

      {lastUrl && (
        <Text style={styles.ok}>Uploaded: {lastUrl}</Text>
      )}

      {error && (
        <Text style={styles.err}>Error: {error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3F4F6", padding: 16, justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800", marginBottom: 12 },
  btn: { backgroundColor: "#2563EB", padding: 12, borderRadius: 12, alignItems: "center" },
  btnText: { color: "white", fontWeight: "800" },
  ok: { marginTop: 12, color: "green" },
  err: { marginTop: 12, color: "crimson" },
});
