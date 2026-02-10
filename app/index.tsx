import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '../lib/auth';

export default function Index() {
  const { user, isAuthReady } = useAuth();
  
  console.log("[INDEX] Auth ready:", isAuthReady, "User:", user);
  
  if (!isAuthReady) {
    return <Redirect href="/loading" />;
  }
  
  if (user) {
    console.log("[INDEX] User authenticated, type:", user.type, "redirecting based on role");
    
    if (user.type === 'doctor') {
      return <Redirect href="/doctor/dashboard" />;
    } else {
      return <Redirect href="/(tabs)/home" />;
    }
  }
  
  return <Redirect href="/login" />;
}
