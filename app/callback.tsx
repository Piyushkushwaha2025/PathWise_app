import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import AppLoading from '../components/AppLoading';

export default function OAuthCallbackScreen() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      router.replace('/(app)/dashboard');
    }
    
    // Safety net: if not signed in after 10 seconds, the OAuth flow likely failed,
    // so we return to sign in to avoid being permanently stuck on the loading screen.
    const timer = setTimeout(() => {
      if (!isSignedIn) router.replace('/(auth)/sign-in');
    }, 10000);
    return () => clearTimeout(timer);
  }, [isLoaded, isSignedIn]);

  return <AppLoading />;
}