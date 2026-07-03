import { Tabs } from "expo-router";
import { TabBar } from "../../components/layout/TabBar";
import { useEffect } from "react";
import { useUpdateStore } from "../../store/useUpdateStore";
import { AppUpdateModal } from "../../components/modals/AppUpdateModal";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeStore } from "../../store/useThemeStore";
import { KeyboardAvoidingView, Platform } from "react-native";

export default function AppLayout() {
  const { checkForUpdates } = useUpdateStore();

  const colors = useThemeStore((s) => s.colors);

  useEffect(() => {
    // Check for updates silently on app startup
    checkForUpdates();
  }, [checkForUpdates]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Tabs
          tabBar={(props) => <TabBar {...props} />}
          screenOptions={{ headerShown: false }}
        >
        <Tabs.Screen name="dashboard" options={{ title: "Dashboard" }} />
        <Tabs.Screen name="roadmaps" options={{ title: "Roadmaps" }} />
        <Tabs.Screen name="roadmaps/create" options={{ href: null }} />
        <Tabs.Screen name="roadmaps/[id]" options={{ href: null }} />
        <Tabs.Screen name="studyos" options={{ title: "StudyOS" }} />
        <Tabs.Screen name="subscription" options={{ title: "Subscription" }} />
        <Tabs.Screen name="profile" options={{ title: "Profile" }} />
        </Tabs>
        <AppUpdateModal />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
