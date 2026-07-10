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

// Setup Android notification channel once at startup
if (Platform.OS === "android") {
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

function RootLayoutInner({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { isLoaded } = useAuth();
  const { user } = useUser();
  const colors = useThemeStore((state) => state.colors);
  const initTheme = useThemeStore((state) => state.initTheme);
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    // Request notification permission on startup
    (async () => {
      const { status: existing } = await Notifications.getPermissionsAsync();
      if (existing !== "granted") {
        await Notifications.requestPermissionsAsync();
      }
    })();
  }, []);

  useEffect(() => {
    if (user?.unsafeMetadata?.theme || user?.unsafeMetadata?.primaryColor) {
      initTheme(
        (user.unsafeMetadata.theme as ThemeType) || "black",
        user.unsafeMetadata.primaryColor as string | undefined
      );
    }
  }, [user?.unsafeMetadata?.theme, user?.unsafeMetadata?.primaryColor]);

  useEffect(() => {
    if (isLoaded && fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
      return;
    }
    // Safety timeout: If Clerk or fonts hang for more than 3 seconds, force hide splash
    const timer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 3000);
    return () => clearTimeout(timer);
  }, [isLoaded, fontsLoaded]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
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
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    Inter_400Regular,
    Inter_500Medium,
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
              <StatusBar style="light" />
              <RootLayoutInner fontsLoaded={fontsLoaded || !!fontError} />
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
