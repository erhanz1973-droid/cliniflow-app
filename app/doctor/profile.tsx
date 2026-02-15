import React from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import DoctorPhotoUpload from '../doctor-photo-upload';

export default function DoctorProfileScreen() {
  const router = useRouter();

  return (
    <View style={{ flex: 1, padding: 20, backgroundColor: '#f5f5f5' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
        <TouchableOpacity
          style={{ backgroundColor: '#007AFF', padding: 10, borderRadius: 8 }}
          onPress={() => router.back()}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>← Geri</Text>
        </TouchableOpacity>
        
        <Text style={{ fontSize: 20, fontWeight: 'bold', alignSelf: 'center' }}>
          Doktor Fotoğrafları
        </Text>
        
        <View style={{ width: 80 }} />
      </View>

      <DoctorPhotoUpload />
    </View>
  );
}
