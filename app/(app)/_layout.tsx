import { Tabs, usePathname, useRouter } from "expo-router";
import { TabBar } from "../../components/layout/TabBar";
import { useEffect } from "react";
import { useUpdateStore } from "../../store/useUpdateStore";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeStore } from "../../store/useThemeStore";
import { useStudySessionStore } from "../../store/studySessionStore";
import { useStudyOSStore } from "../../store/studyosStore";
import { useBackgroundSync } from "../../hooks/useBackgroundSync";
import { KeyboardAvoidingView, Platform, StyleSheet, View, BackHandler } from "react-native";
import AppLoading from "../../components/AppLoading";

export default function AppLayout() {
  const { checkForUpdates } = useUpdateStore();
  const { checkConnection, isSwitchingMode } = useStudySessionStore();
  const { loadGamification } = useStudyOSStore();
  
  // Initialize background sync and polling
  useBackgroundSync();

  const colors = useThemeStore((s) => s.colors);

  useEffect(() => {
    // Check for college connection on boot to set StudyOS mode if needed
    checkConnection();
    loadGamification();
    // Single auto-check on app load — delayed so app fully renders first
    // Manual check is available in Profile → "Check for Updates"
    const timer = setTimeout(() => {
      checkForUpdates(false); // false = auto, respects cooldown
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const pathname = usePathname();
  const router = useRouter();
  const { isStudyOSMode } = useStudySessionStore();

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const onBackPress = () => {
      if (!isStudyOSMode) return false;

      const currentPath = pathname ? pathname.replace(/\/$/, '') : '';
      
      const isHomeTab = currentPath === '/dashboard' || currentPath === '/(app)/dashboard' || currentPath === '' || currentPath === '/(app)';
      const isOtherRootTab = 
        currentPath === '/roadmaps' || currentPath === '/(app)/roadmaps' ||
        currentPath === '/studyos' || currentPath === '/(app)/studyos' ||
        currentPath === '/subscription' || currentPath === '/(app)/subscription' ||
        currentPath === '/profile' || currentPath === '/(app)/profile';

      // If user is on any other StudyOS root tab, back navigates to StudyOS Home
      if (isOtherRootTab) {
        router.navigate('/dashboard' as any);
        return true;
      }

      // If user is on StudyOS Home tab, trap back button so they never exit StudyOS or see outside tabs
      if (isHomeTab) {
        return true;
      }

      // Let normal back navigation happen on nested pages (e.g. chat, attendance, marks details)
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [isStudyOSMode, pathname, router]);

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
      {isSwitchingMode && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 999 }]}>
          <AppLoading />
        </View>
      )}
    </SafeAreaView>
  );
}
