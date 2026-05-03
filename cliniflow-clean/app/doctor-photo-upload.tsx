import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../lib/auth';
import { API_BASE } from '../lib/api';

export default function DoctorPhotoUpload() {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState(user?.profilePhotoUrl || null);
  const [diplomaFile, setDiplomaFile] = useState((user as any)?.diplomaFileUrl || null);

  const pickImage = async (type: 'profile' | 'diploma') => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        uploadFile(asset, type);
      }
    } catch (error: any) {
      Alert.alert('Hata', 'Fotoğraf seçilemedi: ' + error.message);
    }
  };

  const uploadFile = async (asset: ImagePicker.ImagePickerAsset, type: 'profile' | 'diploma') => {
    setUploading(true);

    try {
      const formData = new FormData();
      
      // Convert to blob
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      
      formData.append(type === 'profile' ? 'photo' : 'diploma', {
        uri: asset.uri,
        type: blob.type,
        name: `${type}_${Date.now()}.${asset.uri.split('.').pop()}`,
      } as any);

      const uploadResponse = await fetch(`${API_BASE}/api/doctor/upload-${type}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user.token}`,
          'Content-Type': 'multipart/form-data',
        },
        body: formData,
      });

      const result = await uploadResponse.json();

      if (result.ok) {
        if (type === 'profile') {
          setProfilePhoto(result.profilePhotoUrl);
          Alert.alert('Başarılı', 'Profil fotoğrafınız güncellendi.');
        } else {
          setDiplomaFile(result.diplomaFileUrl);
          Alert.alert('Başarılı', 'Diplomanız yüklendi.');
        }
      } else {
        Alert.alert('Hata', (result as any).error || 'Yükleme başarısız.');
      }
    } catch (error: any) {
      Alert.alert('Hata', 'Yükleme sırasında hata: ' + (error as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={{ flex: 1, padding: 20, backgroundColor: '#f5f5f5' }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' }}>
        Doktor Fotoğrafları
      </Text>

      {/* Profile Photo Upload */}
      <View style={{ marginBottom: 30 }}>
        <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 10 }}>
          📷 Profil Fotoğrafı (Opsiyonel)
        </Text>
        
        {profilePhoto ? (
          <Image 
            source={{ uri: profilePhoto }} 
            style={{ 
              width: 120, 
              height: 120, 
              borderRadius: 60, 
              marginBottom: 10,
              alignSelf: 'center'
            }} 
          />
        ) : (
          <View style={{ 
            width: 120, 
            height: 120, 
            borderRadius: 60, 
            backgroundColor: '#e0e0e0', 
            marginBottom: 10,
            alignSelf: 'center',
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            <Text style={{ fontSize: 40, color: '#999' }}>📷</Text>
          </View>
        )}

        <TouchableOpacity
          style={{
            backgroundColor: '#007AFF',
            padding: 12,
            borderRadius: 8,
            alignItems: 'center',
          }}
          onPress={() => pickImage('profile')}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontWeight: '600' }}>
              {profilePhoto ? 'Fotoğrafı Değiştir' : 'Fotoğraf Yükle'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Diploma Upload */}
      <View style={{ marginBottom: 30 }}>
        <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 10 }}>
          📄 Diploma / Lisans Belgesi (Opsiyonel)
        </Text>
        
        {diplomaFile && (
          <View style={{ 
            padding: 10, 
            backgroundColor: '#f0f0f0', 
            borderRadius: 8, 
            marginBottom: 10,
            alignItems: 'center'
          }}>
            <Text style={{ fontSize: 14, color: '#666' }}>
              📄 Diploma yüklendi
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={{
            backgroundColor: '#28a745',
            padding: 12,
            borderRadius: 8,
            alignItems: 'center',
          }}
          onPress={() => pickImage('diploma')}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontWeight: '600' }}>
              {diplomaFile ? 'Diplomayı Değiştir' : 'Diploma Yükle'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Info */}
      <View style={{ 
        backgroundColor: '#e8f4fd', 
        padding: 15, 
        borderRadius: 8 
      }}>
        <Text style={{ fontSize: 14, color: '#333', lineHeight: 20 }}>
          <Text style={{ fontWeight: '600' }}>Bilgi:</Text>
          {'\n'}
          • Profil fotoğrafı: Maksimum 3MB, JPG/PNG/WEBP formatı
          {'\n'}
          • Diploma: Maksimum 5MB, JPG/PNG/PDF formatı
          {'\n'}
          • Yüklenen dosyalar sadece admin panelinde görünür
          {'\n'}
          • Hasta tarafında diploma gösterilmez
        </Text>
      </View>
    </View>
  );
}
