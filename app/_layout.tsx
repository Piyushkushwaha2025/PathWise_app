import "react-native-gesture-handler";
import "react-native-reanimated";
import React, { useEffect, useState, useRef } from "react";
import { View, StyleSheet, LogBox, Image, Animated, useColorScheme, Text, TextInput } from "react-native";
import { Stack } from "expo-router";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { ErrorBoundary } from "../components/ErrorBoundary";
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import NewAssignmentNotification from "../components/studyos/NewAssignmentNotification";
import { GlobalPaywallModal } from "../components/ui/GlobalPaywallModal";
import { AppLockOverlay } from "../components/security/AppLockOverlay";
import {
  useFonts,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import {
  Inter_400Regular, Inter_500Medium, Inter_700Bold,
  Inter_600SemiBold,
} from "@expo-google-fonts/inter";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono";

// Global font scaling safeguard: ensures text never blows up, clips, or vanishes on devices with custom Android display/font sizes
if ((Text as any).defaultProps == null) {
  (Text as any).defaultProps = {};
}
(Text as any).defaultProps.maxFontSizeMultiplier = 1.0;
(Text as any).defaultProps.textBreakStrategy = 'simple';

if ((TextInput as any).defaultProps == null) {
  (TextInput as any).defaultProps = {};
}
(TextInput as any).defaultProps.maxFontSizeMultiplier = 1.0;
import { tokenCache } from "../lib/clerk";
import { Colors } from "../constants/theme";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// Global notification handler — show banner even when app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

import { setupAndroidChannels } from "../lib/notifications";

import { useThemeStore, loadTheme, ThemeType } from "../store/useThemeStore";
import { useUser } from "@clerk/clerk-expo";
import { registerBackgroundSync } from "../tasks/backgroundSync";

import { useStudySessionStore } from "../store/studySessionStore";
import { useStudyOSStore } from "../store/studyosStore";
import { useSubscription } from "../hooks/useSubscription";
import { savePushToken, setAuthTokenGetter, syncUserWithDB } from "../lib/db";

if (LogBox) {
  LogBox.ignoreLogs([
    'Clerk: Clerk has been loaded with development keys',
  ]);
}

loadTheme();
useStudySessionStore.getState().checkConnection().catch(() => {});
useStudyOSStore.getState().loadGamification().catch(() => {});
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,   // 5 min — show cached data instantly, no spinner
      gcTime: 10 * 60 * 1000,     // 10 min — keep in memory longer
    },
  },
});

const CLERK_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

function RootLayoutInner() {
  const { isLoaded, getToken } = useAuth();
  const { user } = useUser();

  // Register Clerk JWT token getter with global db client for authenticated requests
  useEffect(() => {
    if (getToken) {
      setAuthTokenGetter(getToken);
    }
  }, [getToken]);
  const colors = useThemeStore((state) => state.colors);
  const initTheme = useThemeStore((state) => state.initTheme);
  const theme = useThemeStore((state) => state.theme);
  const { isPro } = useSubscription();

  const [cachedIsPro, setCachedIsPro] = useState<boolean | null>(null);
  const splashHiddenRef = useRef(false);

  const hideSplashSafely = () => {
    if (!splashHiddenRef.current) {
      splashHiddenRef.current = true;
      SplashScreen.hideAsync().catch(() => {});
    }
  };

  // Safe splash hide when Clerk is loaded
  useEffect(() => {
    if (isLoaded) {
      hideSplashSafely();
    }
  }, [isLoaded]);

  // Absolute safety fallback: never keep splash screen frozen past 1500ms
  useEffect(() => {
    const safetyTimer = setTimeout(() => {
      hideSplashSafely();
    }, 1500);
    return () => clearTimeout(safetyTimer);
  }, []);

  // Load cached Pro / Trial state instantly from local storage for seamless cold starts
  useEffect(() => {
    AsyncStorage.getItem('@pathwise_cached_is_pro')
      .then((val) => {
        if (val !== null) {
          setCachedIsPro(val === 'true');
        }
      })
      .catch(() => {});
  }, []);

  // Sync Pro / Trial status to local cache whenever it updates & ensure MongoDB Atlas has user
  useEffect(() => {
    if (isLoaded && user?.id) {
      AsyncStorage.setItem('@pathwise_cached_is_pro', isPro ? 'true' : 'false').catch(() => {});
      AsyncStorage.setItem('auth_was_signed_in', 'true').catch(() => {});

      // Proactively ensure user profile exists in MongoDB Atlas on login / app launch
      const email = user.primaryEmailAddress?.emailAddress;
      const emailPrefix = email ? email.split('@')[0].toLowerCase() : null;
      let name = (user.fullName || user.firstName || '').trim();
      if (!name || (emailPrefix && name.toLowerCase() === emailPrefix)) {
        name = 'Learner';
      }
      syncUserWithDB(user.id, {
        name,
        email,
      }).catch((err) => {
        console.warn('Initial user Atlas sync notice:', err?.message);
      });
    }
  }, [isLoaded, user?.id, isPro]);

  // If user has Pro, is on active 30-day trial, has reward Pro, or was cached as Pro -> DO NOT show ads
  const isProEffective = isPro || cachedIsPro === true;
  const isProEffectiveRef = useRef(isProEffective);


  useEffect(() => {
    isProEffectiveRef.current = isProEffective;
  }, [isProEffective]);

  useEffect(() => {
    // Fire-and-forget — never block UI on local reads
    Promise.all([
      useStudySessionStore.getState().checkConnection(),
      useStudyOSStore.getState().loadGamification(),
    ]).catch(e => console.warn("Store init warning:", e));
  }, []);


  useEffect(() => {
    if (!user?.id) return;
    // Defer ALL heavy tasks by 5s so the dashboard fully renders first
    const timer = setTimeout(() => {
      (async () => {
        try {
          const { status: existing } = await Notifications.getPermissionsAsync();
          let finalStatus = existing;
          if (existing !== "granted") {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
          }
          if (finalStatus === "granted" && user?.id && Platform.OS !== 'web') {
            try {
              const projectId = "983f9008-442a-4984-9f18-859c152558c4";
              const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
              if (tokenData?.data) {
                await savePushToken(user.id, tokenData.data);
              }
            } catch (error: any) {
              console.warn("⚠️ Push token generation skipped:", error?.message);
            }
          }
          // Setup notification channels + background sync after everything else
          setupAndroidChannels();
          await registerBackgroundSync();
        } catch (e) {
          console.warn("Deferred startup task failed:", e);
        }
      })();
    }, 5000); // 5s delay — fully off critical path
    return () => clearTimeout(timer);
  }, [user?.id]);

  // Ensure user's selected theme and Android notification channels are loaded immediately on startup
  useEffect(() => {
    loadTheme();
    setupAndroidChannels();
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const savedTheme = (await AsyncStorage.getItem("app_theme")) || (await SecureStore.getItemAsync("app_theme"));
        // Only use Clerk metadata on initial setup if the device does NOT already have a local preference saved!
        // This prevents Clerk re-renders or background updates from reverting the user's selected theme.
        if (!savedTheme && user.unsafeMetadata?.theme) {
          const t = user.unsafeMetadata.theme as ThemeType;
          if (t === "black" || t === "white" || t === "cream" || t === "emerald") {
            initTheme(t, user.unsafeMetadata.primaryColor as string | undefined);
          }
        }
      } catch {}
    })();
  }, [user?.id]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={theme === "black" ? "light" : "dark"} />
      <NewAssignmentNotification />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'fade', // <-- Fade animation to prevent sliding stutter on launch
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="roadmap/[id]" />
      </Stack>
      <GlobalPaywallModal />
      <AppLockOverlay />
    </View>
  );
}

export default function RootLayout() {
  const [, fontError] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    Inter_400Regular, Inter_500Medium, Inter_700Bold,
    Inter_600SemiBold,
    JetBrainsMono_400Regular,
  });

  // Removed duplicate SplashScreen.hideAsync() so RootLayoutInner can control it

  return (
    <ClerkProvider publishableKey={CLERK_KEY} tokenCache={tokenCache}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <BottomSheetModalProvider>
              <ErrorBoundary>
                <RootLayoutInner />
              </ErrorBoundary>
            </BottomSheetModalProvider>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
