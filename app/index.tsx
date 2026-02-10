import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '../lib/auth';

export default function Index() {
  const { user, isAuthReady, isAuthLoading } = useAuth();
  
  console.log("[INDEX] Auth ready:", isAuthReady, "User:", user, "Loading:", isAuthLoading);
  
  // 🔥 FIX: Only show loading if auth is still loading OR no user yet
  if (!isAuthReady || isAuthLoading || !user) {
    return <Redirect href="/loading" />;
  }
  
  // If user is authenticated, redirect based on role
  if (isAuthReady && user) {
    console.log("[INDEX] User authenticated, type:", user.type, "redirecting based on role");
    
    if (user.type === 'doctor') {
      return <Redirect href="/doctor/dashboard" />;
    } else {
      return <Redirect href="/(tabs)/home" />;
    }
  }
  
  // If not authenticated, redirect to login
  return <Redirect href="/login" />;
}
