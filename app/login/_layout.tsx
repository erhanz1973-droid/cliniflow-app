import { LanguageProvider } from '../../lib/language-context';
import { Stack } from 'expo-router';

export default function LoginLayout() {
  return (
    <LanguageProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </LanguageProvider>
  );
}
