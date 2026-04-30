import AsyncStorage from "@react-native-async-storage/async-storage";

/** Log once when any AsyncStorage op fails (e.g. disk full). */
let storageIssueLogged = false;

function noteStorageDegraded(e: unknown, op: string) {
  const msg = (e as Error)?.message;
  console.warn(`[AsyncStorage ${op} FAILED]`, msg);
  if (!storageIssueLogged) {
    storageIssueLogged = true;
    console.warn("[STORAGE ISSUE] falling back to in-memory only mode", msg ?? "");
  }
}

export async function safeGetItem(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch (e) {
    noteStorageDegraded(e, "READ");
    return null;
  }
}

export async function safeSetItem(key: string, value: string): Promise<boolean> {
  try {
    await AsyncStorage.setItem(key, value);
    return true;
  } catch (e) {
    noteStorageDegraded(e, "WRITE");
    return false;
  }
}

export async function safeRemoveItem(key: string): Promise<boolean> {
  try {
    await AsyncStorage.removeItem(key);
    return true;
  } catch (e) {
    noteStorageDegraded(e, "WRITE");
    return false;
  }
}
