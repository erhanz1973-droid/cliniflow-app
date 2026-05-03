import { initializeApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyCedb4B7wKbFjiEiecUIt-zUgHi2KMLayU",
  authDomain: "cliniflow-18037.firebaseapp.com",
  projectId: "cliniflow-18037",
  storageBucket: "cliniflow-18037.firebasestorage.app",
  messagingSenderId: "1088097441594",
  appId: "1:1088097441594:web:2b97ae881a5b9808be6203",
  measurementId: "G-MDVWD0WYH3"
};

const app = initializeApp(firebaseConfig);

// RN için auth persistence
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export { firebaseConfig };
