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
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from "@expo-google-fonts/inter";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono";
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

if (LogBox) {
  LogBox.ignoreLogs([
    'SafeAreaView has been deprecated',
    'Clerk: Clerk has been loaded with development keys',
  ]);
}

loadTheme();
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, refetchOnWindowFocus: false },
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
    if (!user?.id) return;
    // Defer heavy startup tasks so app UI renders first
    const timer = setTimeout(() => {
      (async () => {
        const { status: existing } = await Notifications.getPermissionsAsync();
        let finalStatus = existing;
        if (existing !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        
        // If granted and user logged in, get token and save to DB
        if (finalStatus === "granted" && user?.id && Platform.OS !== 'web') {
          try {
            const projectId = "6ec620f1-e4e6-4862-8223-6418976b86e4";
            const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
            const API_URL = process.env.EXPO_PUBLIC_API_URL;
            
            if (API_URL && tokenData?.data) {
               fetch(`${API_URL}/api/user/push-token`, {
                  method: 'POST',
                  headers: {
                     'Content-Type': 'application/json',
                     'x-clerk-user-id': user.id
                  },
                  body: JSON.stringify({ expoPushToken: tokenData.data })
               }).catch(e => console.error("Error saving token:", e));
            }
          } catch (error: any) {
            console.warn("⚠️ Push token generation skipped:", error?.message);
          }
        }
        
        // Register background sync task
        await registerBackgroundSync();
      })();
    }, 3000); // 3s delay so the main UI renders first
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
      SplashScreen.hideAsync().catch(() => {});
      // Setup Android notification channels after app has rendered
      setupAndroidChannels();
    }
  }, [isLoaded]);

  // NOTE: we intentionally do NOT block the first paint on `fontsLoaded`.
  // Fonts load in the background and swap in once ready (they are cached after
  // first launch, so subsequent opens are instant). Gating the splash on fonts
  // was the main cause of the slow app-open time.
  if (!isLoaded) return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={theme === "white" || theme === "cream" ? "dark" : "light"} />
      <NewAssignmentNotification />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
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
    Inter_400Regular,
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
