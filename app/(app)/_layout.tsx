import { Tabs } from "expo-router";
import { TabBar } from "../../components/layout/TabBar";
import { useEffect } from "react";
import { useUpdateStore } from "../../store/useUpdateStore";
import { AppUpdateModal } from "../../components/modals/AppUpdateModal";

export default function AppLayout() {
  const { checkForUpdates } = useUpdateStore();

  useEffect(() => {
    // Check for updates silently on app startup
    checkForUpdates();
  }, [checkForUpdates]);

  return (
    <>
      <Tabs
        // @ts-expect-error - mismatch between expo-router and react-navigation types
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
    </>
  );
}
