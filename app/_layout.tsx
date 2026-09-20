import "react-native-gesture-handler";
import "react-native-reanimated";
import React, { useEffect } from "react";
import { View, StyleSheet, LogBox, Image, Animated, useColorScheme } from "react-native";
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
import NewAssignmentNotification from "../components/studyos/NewAssignmentNotification";
import { GlobalPaywallModal } from "../components/ui/GlobalPaywallModal";
import {
  useFonts,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import {
  Inter_400Regular, Inter_500Medium, Inter_700Bold,
  Inter_600SemiBold,
} from "@expo-google-fonts/inter";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono";
import { tokenCache } from "../lib/clerk";
import { Colors } from "../constants/theme";
import * as Notifications from "expo-notifications";
import { Platform, AppState } from "react-native";
import { AppOpenAd, TestIds, AdEventType } from "react-native-google-mobile-ads";

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

// Setup Android notification channel once, deferred so it doesn't block startup
function setupAndroidChannels() {
  if (Platform.OS !== "android") return;
  // Delete old channels with wrong sound settings
  Notifications.deleteNotificationChannelAsync("pathwise-default");
  Notifications.deleteNotificationChannelAsync("pathwise-coin");
  Notifications.deleteNotificationChannelAsync("pathwise-streak");

  Notifications.setNotificationChannelAsync("pathwise-default-v2", {
    name: "PathWise Notifications",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "ting.mp3",
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#3b82f6",
    showBadge: true,
  });

  Notifications.setNotificationChannelAsync("pathwise-coin-v2", {
    name: "PathWise — Achievements",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "mario_coin.mp3",
    vibrationPattern: [0, 100, 100, 100],
    lightColor: "#f59e0b",
    showBadge: true,
  });

  Notifications.setNotificationChannelAsync("pathwise-streak-v2", {
    name: "PathWise — Streak Alerts",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "mario_death.mp3",
    vibrationPattern: [0, 500, 200, 500],
    lightColor: "#ef4444",
    showBadge: true,
  });
}

import { useThemeStore, loadTheme, ThemeType } from "../store/useThemeStore";
import { useUser } from "@clerk/clerk-expo";
import { registerBackgroundSync } from "../tasks/backgroundSync";

import { useStudySessionStore } from "../store/studySessionStore";
import { useStudyOSStore } from "../store/studyosStore";

if (LogBox) {
  LogBox.ignoreLogs([
    'Clerk: Clerk has been loaded with development keys',
  ]);
}

loadTheme();
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
  const { isLoaded } = useAuth();
  const { user } = useUser();
  const colors = useThemeStore((state) => state.colors);
  const initTheme = useThemeStore((state) => state.initTheme);
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    // Fire-and-forget — never block UI on local reads
    Promise.all([
      useStudySessionStore.getState().checkConnection(),
      useStudyOSStore.getState().loadGamification(),
    ]).catch(e => console.warn("Store init warning:", e));
  }, []);

  useEffect(() => {
    let appOpenAd: AppOpenAd | null = null;
    let isAdLoaded = false;
    let isShowingAd = false;
    let hasShownInitialAd = false; // Track cold start ad

    if (Platform.OS !== "web") {
      const adUnitId = __DEV__
        ? TestIds.APP_OPEN
        : "ca-app-pub-4632911659428084/4454731771";

      try {
        appOpenAd = AppOpenAd.createForAdRequest(adUnitId, {
          requestNonPersonalizedAdsOnly: true,
        });

        appOpenAd.addAdEventListener(AdEventType.LOADED, () => {
          isAdLoaded = true;
          // Show immediately on cold start if app is active
          if (!hasShownInitialAd && AppState.currentState === 'active' && !isShowingAd && !(global as any).isAdShowing) {
            hasShownInitialAd = true;
            isShowingAd = true;
            appOpenAd?.show();
          }
        });
        
        appOpenAd.addAdEventListener(AdEventType.CLOSED, () => {
          isShowingAd = false;
          isAdLoaded = false;
          appOpenAd?.load(); // Load next ad
        });

        appOpenAd.addAdEventListener(AdEventType.ERROR, (error) => {
          isShowingAd = false;
          isAdLoaded = false;
          console.warn("AppOpenAd error:", error);
        });

        // Load the first ad
        appOpenAd.load();
      } catch (e) {
        console.warn("Could not initialize AppOpenAd", e);
      }

      const appStateSubscription = AppState.addEventListener("change", (nextAppState) => {
        // Show the ad when app comes to foreground (active), EXCEPT if a rewarded ad is showing
        if (nextAppState === "active" && appOpenAd && isAdLoaded && !isShowingAd && !(global as any).isAdShowing) {
          hasShownInitialAd = true;
          isShowingAd = true;
          appOpenAd.show();
        }
      });

      return () => {
        appStateSubscription.remove();
      };
    }
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
              const projectId = "6ec620f1-e4e6-4862-8223-6418976b86e4";
              const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
              const API_URL = process.env.EXPO_PUBLIC_API_URL;
              if (API_URL && tokenData?.data) {
                fetch(`${API_URL}/api/user/push-token`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'x-clerk-user-id': user.id },
                  body: JSON.stringify({ expoPushToken: tokenData.data })
                }).catch(e => console.error("Error saving token:", e));
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

  useEffect(() => {
    if (user?.unsafeMetadata?.theme || user?.unsafeMetadata?.primaryColor) {
      initTheme(
        (user.unsafeMetadata.theme as ThemeType) || "black",
        user.unsafeMetadata.primaryColor as string | undefined
      );
    }
  }, [user?.unsafeMetadata?.theme, user?.unsafeMetadata?.primaryColor]);

  useEffect(() => {
    if (isLoaded) {
      setTimeout(() => {
        SplashScreen.hideAsync().catch(() => {});
      }, 150); // Small delay to let the initial screen paint
    }
  }, [isLoaded]);

  // Show nothing until Clerk auth is resolved (needed for routing)
  // This also holds the splash screen safely
  if (!isLoaded) return null;

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
    </View>
  );
}

export default function RootLayout() {
  const [, fontError] = useFonts({
    SpaceGrotesk_400Regular,
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
