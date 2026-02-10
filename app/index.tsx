import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '../lib/auth';

export default function Index() {
  const { user, isAuthReady } = useAuth();
  
  // If user is authenticated, redirect based on role
  if (isAuthReady && user) {
    if (user.type === 'doctor') {
      return <Redirect href="/doctor/dashboard" />;
    } else {
      return <Redirect href="/(tabs)/home" />;
    }
  }
  
  // If not authenticated, redirect to login
  return <Redirect href="/login" />;
}
