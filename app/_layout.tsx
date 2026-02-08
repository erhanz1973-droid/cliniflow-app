import React from 'react';
import { AuthProvider } from '../lib/auth';
import { LanguageProvider } from '../lib/language-context';
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
      </LanguageProvider>
    </AuthProvider>
  );
}
