import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

/** True when running inside the Expo Go client (no custom native modules). */
export function isExpoGoRuntime(): boolean {
  if (Platform.OS === "web") return false;
  if (Constants.appOwnership === "expo") return true;
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/** Meta / Facebook native SDK requires a dev or production build — not Expo Go. */
export function isMetaNativeSdkAvailable(): boolean {
  return Platform.OS !== "web" && !isExpoGoRuntime();
}
