import React, { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as SplashScreen from "expo-splash-screen";
import { Colors } from "../constants/theme";


export default function Index() {
  const { isSignedIn, isLoaded } = useAuth();
  const [destination, setDestination] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    // 1. When Clerk has resolved auth state, route definitively
    if (isLoaded) {
      if (isSignedIn) {
        AsyncStorage.setItem("auth_was_signed_in", "true").catch(() => {});
        setDestination("/(app)/dashboard");
      } else {
        AsyncStorage.setItem("auth_was_signed_in", "false").catch(() => {});
        setDestination("/(auth)/sign-in");
      }
      SplashScreen.hideAsync().catch(() => {});
      return;
    }

    // 2. Safety timeout fallback: if Clerk takes more than 2.5s (e.g. extreme offline delay),
    // check if a valid Clerk token is stored locally.
    const timer = setTimeout(async () => {
      if (!isMounted) return;
      try {
        const [wasSignedIn, clerkJwt] = await Promise.all([
          AsyncStorage.getItem("auth_was_signed_in").catch(() => null),
          SecureStore.getItemAsync("__clerk_client_jwt").catch(() => null),
        ]);

        if (isMounted) {
          if (wasSignedIn === "true" && clerkJwt) {
            setDestination("/(app)/dashboard");
          } else {
            setDestination("/(auth)/sign-in");
          }
          SplashScreen.hideAsync().catch(() => {});
        }
      } catch {
        if (isMounted) {
          setDestination("/(auth)/sign-in");
          SplashScreen.hideAsync().catch(() => {});
        }
      }
    }, 2500);

    return () => {
      isMounted = false;
      clearTimeout(timer);
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

