import { Tabs } from "expo-router";
import { TabBar } from "../../components/layout/TabBar";
import { useEffect } from "react";
import { useUpdateStore } from "../../store/useUpdateStore";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeStore } from "../../store/useThemeStore";
import { KeyboardAvoidingView, Platform } from "react-native";

export default function AppLayout() {
  const { checkForUpdates } = useUpdateStore();

  const colors = useThemeStore((s) => s.colors);

  useEffect(() => {
    // Single auto-check on app load — delayed so app fully renders first
    // Manual check is available in Profile → "Check for Updates"
    const timer = setTimeout(() => {
      checkForUpdates(false); // false = auto, respects cooldown
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Tabs
          // @ts-ignore - TS type mismatch between expo-router and @react-navigation/bottom-tabs
          tabBar={(props) => <TabBar {...props} />}
          screenOptions={{ 
            headerShown: false,
            freezeOnBlur: true,
            lazy: true,
            sceneStyle: { backgroundColor: colors.background }
          }}
        >
        <Tabs.Screen name="dashboard" options={{ title: "Dashboard" }} />
        <Tabs.Screen name="roadmaps" options={{ title: "Roadmaps" }} />
        <Tabs.Screen name="studyos" options={{ title: "StudyOS" }} />
        <Tabs.Screen name="subscription" options={{ title: "Subscription" }} />
        <Tabs.Screen name="profile" options={{ title: "Profile" }} />
        </Tabs>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
