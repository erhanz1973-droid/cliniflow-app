import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';

export default function LoadingScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f6f7f9' }}>
      <ActivityIndicator size="large" color="#2563eb" />
      <Text style={{ marginTop: 16, fontSize: 16, color: '#666' }}>Yükleniyor...</Text>
    </View>
  );
}
