// Clear mixed auth data - Run once to clean up storage inconsistencies
import AsyncStorage from '@react-native-async-storage/async-storage';

const OLD_KEYS = [
  'cliniflow.auth.v1',
  'cliniflow.patient.v1',
];

const NEW_KEY = 'clinifly.auth.v1';

async function cleanupAuthStorage() {
  try {
    console.log('🧹 Cleaning up old cliniflow storage keys...');
    
    // Remove old cliniflow keys
    for (const key of OLD_KEYS) {
      await AsyncStorage.removeItem(key);
      console.log(`✅ Removed old key: ${key}`);
    }
    
    // Clear new key to force fresh login
    await AsyncStorage.removeItem(NEW_KEY);
    console.log(`✅ Cleared new key: ${NEW_KEY}`);
    
    console.log('🎉 Storage cleanup complete! Please restart the app.');
  } catch (error) {
    console.error('❌ Storage cleanup failed:', error);
  }
}

// Export for use in app if needed
export { cleanupAuthStorage };
