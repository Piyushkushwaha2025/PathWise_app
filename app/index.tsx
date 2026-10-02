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

    // Fast-path: Check locally persisted auth state immediately (<5ms)
    // Avoids waiting 1.5s - 2.5s for Clerk's remote network handshake
    AsyncStorage.getItem("auth_was_signed_in")
      .then((wasSignedIn) => {
        if (!isMounted) return;
        if (wasSignedIn === "true") {
          setDestination("/(app)/dashboard");
          SplashScreen.hideAsync().catch(() => {});
        } else if (wasSignedIn === "false") {
          setDestination("/(auth)/sign-in");
          SplashScreen.hideAsync().catch(() => {});
        }
      })
      .catch(() => {});

    // Authoritative Clerk update: When Clerk resolves auth state, update persisted flag and route if needed
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

    // Safety timeout fallback: for fresh installs where auth_was_signed_in is null
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
    }, 1500);

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

