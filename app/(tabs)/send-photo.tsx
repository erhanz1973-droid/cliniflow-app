// app/send-photo.tsx
// Send Photo - Patient can send photos to doctor

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import { API_BASE } from "../../lib/api";

export default function SendPhotoScreen() {
  const router = useRouter();
  const { user, isAuthReady, isDoctor, isPatient } = useAuth();
  const [loading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [notes, setNotes] = useState("");

  // Role-based redirect
  React.useEffect(() => {
    if (!isAuthReady) return;
    
    // Doctors cannot access this screen
    if (isDoctor) {
      router.replace("/doctor-dashboard");
      return;
    }
    
    // Only patients can access
    if (!isPatient) {
      router.replace("/login");
      return;
    }
  }, [isAuthReady, isDoctor, isPatient, router]);

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error("[SEND PHOTO] Error picking image:", error);
      Alert.alert("Hata", "Fotoğraf seçilemedi");
    }
  };

  const takePhoto = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error("[SEND PHOTO] Error taking photo:", error);
      Alert.alert("Hata", "Fotoğraf çekilemedi");
    }
  };

  const uploadPhoto = async () => {
    if (!selectedImage) {
      Alert.alert("Hata", "Lütfen önce fotoğraf seçin");
      return;
    }

    try {
      setUploading(true);

      const formData = new FormData();
      formData.append("photo", {
        uri: selectedImage,
        type: "image/jpeg",
        name: "photo.jpg",
      } as any);
      formData.append("notes", notes);
      formData.append("patientId", user?.id || "");

      const response = await fetch(`${API_BASE}/api/patient/photo`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user?.token}`,
          "Content-Type": "multipart/form-data",
        },
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          Alert.alert("Başarılı", "Fotoğraf başarıyla gönderildi.");
          setSelectedImage(null);
          setNotes("");
          router.back();
        } else {
          Alert.alert("Hata", data.message || "Fotoğraf gönderilemedi");
        }
      } else {
        Alert.alert("Hata", "Fotoğraf gönderilemedi");
      }
    } catch (error) {
      console.error("[SEND PHOTO] Upload error:", error);
      Alert.alert("Hata", "Bağlantı hatası");
    } finally {
      setUploading(false);
    }
  };

  if (!isAuthReady) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Fotoğraf Gönder</Text>
        <Text style={styles.subtitle}>
          Tedavi sürecinizi takip etmek için fotoğraf gönderin
        </Text>
      </View>

      <View style={styles.imageSection}>
        {selectedImage ? (
          <View style={styles.previewContainer}>
            <Image source={{ uri: selectedImage }} style={styles.previewImage} />
            <Pressable
              style={styles.removeButton}
              onPress={() => setSelectedImage(null)}
            >
              <Text style={styles.removeButtonText}>×</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.placeholderContainer}>
            <Text style={styles.placeholderText}>📷</Text>
            <Text style={styles.placeholderSubtext}>Fotoğraf seçin veya çekin</Text>
          </View>
        )}
      </View>

      <View style={styles.buttonContainer}>
        <Pressable style={styles.button} onPress={pickImage}>
          <Text style={styles.buttonText}>📁 Galeri</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={takePhoto}>
          <Text style={styles.buttonText}>📷 Kamera</Text>
        </Pressable>
      </View>

      <View style={styles.notesSection}>
        <Text style={styles.label}>Notlar (opsiyonel)</Text>
        <TextInput
          style={styles.notesInput}
          placeholder="Fotoğraf hakkında notlar..."
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>

      <Pressable
        style={[styles.uploadButton, (!selectedImage || uploading) && styles.uploadButtonDisabled]}
        onPress={uploadPhoto}
        disabled={!selectedImage || uploading}
      >
        {uploading ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Text style={styles.uploadButtonText}>Gönder</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  content: {
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 24,
  },
  imageSection: {
    marginBottom: 24,
  },
  previewContainer: {
    position: "relative",
    marginBottom: 16,
  },
  previewImage: {
    width: "100%",
    height: 300,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
  },
  removeButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
  },
  placeholderContainer: {
    alignItems: "center",
    justifyContent: "center",
    height: 300,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    borderWidth: 2,
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
  },
  placeholderText: {
    fontSize: 48,
    marginBottom: 8,
  },
  placeholderSubtext: {
    fontSize: 16,
    color: "#6B7280",
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 24,
  },
  button: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    minWidth: 120,
    alignItems: "center",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  notesSection: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  notesInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    backgroundColor: "#FFFFFF",
    height: 100,
  },
  uploadButton: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  uploadButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  uploadButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
