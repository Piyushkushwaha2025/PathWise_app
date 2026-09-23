import React, { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as SplashScreen from "expo-splash-screen";
import { Colors } from "../constants/theme";

/**
 * Checks if the user was previously signed in on this device,
 * allowing instant offline navigation to the dashboard.
 */
async function checkHasLocalSession(): Promise<boolean> {
  try {
    const wasSignedIn = await AsyncStorage.getItem("auth_was_signed_in");
    // If explicitly signed out, do not use offline auto-login
    if (wasSignedIn === "false") return false;
    if (wasSignedIn === "true") return true;

    // Fallback checks for existing credentials / cached data
    const [uniId, clerkJwt, studyData] = await Promise.all([
      SecureStore.getItemAsync("study_university_id").catch(() => null),
      SecureStore.getItemAsync("__clerk_client_jwt").catch(() => null),
      AsyncStorage.getItem("studyos_scraped_data").catch(() => null),
    ]);

    if (uniId || clerkJwt || studyData) {
      AsyncStorage.setItem("auth_was_signed_in", "true").catch(() => {});
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export default function Index() {
  const { isSignedIn, isLoaded } = useAuth();
  const [destination, setDestination] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function evaluateAuth() {
      // 1. If Clerk is already loaded and reports signed in, proceed to dashboard
      if (isLoaded && isSignedIn) {
        AsyncStorage.setItem("auth_was_signed_in", "true").catch(() => {});
        if (isMounted) {
          setDestination("/(app)/dashboard");
          SplashScreen.hideAsync().catch(() => {});
        }
        return;
      }

      // 2. Check local device credentials (takes ~5-15ms, works 100% offline)
      const hasLocalSession = await checkHasLocalSession();
      if (!isMounted) return;

      if (hasLocalSession) {
        // User has an active local session: enter dashboard immediately offline
        setDestination("/(app)/dashboard");
        SplashScreen.hideAsync().catch(() => {});
        return;
      }

      // 3. If Clerk is loaded and reports NOT signed in (and no local session exists)
      if (isLoaded && !isSignedIn) {
        setDestination("/(auth)/sign-in");
        SplashScreen.hideAsync().catch(() => {});
        return;
      }

      // 4. Fallback grace period (400ms) in case Clerk is slow to load
      const timer = setTimeout(async () => {
        if (!isMounted) return;
        const recheckLocal = await checkHasLocalSession();
        if (isMounted) {
          setDestination(recheckLocal ? "/(app)/dashboard" : "/(auth)/sign-in");
          SplashScreen.hideAsync().catch(() => {});
        }
      }, 400);

      return () => clearTimeout(timer);
    }

    evaluateAuth();

    return () => {
      isMounted = false;
    };
  }, [isLoaded, isSignedIn]);

  if (destination) {
    return <Redirect href={destination as any} />;
  }

  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
});

