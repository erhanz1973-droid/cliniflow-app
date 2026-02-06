import React from 'react';
import { AuthProvider } from '../lib/auth';
import { LanguageProvider } from '../lib/language-context';
import { Stack } from 'expo-router';
import TabLayout from './(tabs)/_layout';

export default function RootLayout() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </LanguageProvider>
    </AuthProvider>
  );
}
