import { Tabs, usePathname, useRouter } from "expo-router";
import { TabBar } from "../../components/layout/TabBar";
import { useEffect, useRef } from "react";
import { BlurTargetView } from "expo-blur";
import { useUpdateStore } from "../../store/useUpdateStore";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeStore } from "../../store/useThemeStore";
import { useStudySessionStore } from "../../store/studySessionStore";
import { useStudyOSStore } from "../../store/studyosStore";
import { useBackgroundSync } from "../../hooks/useBackgroundSync";
import { KeyboardAvoidingView, Platform, StyleSheet, View, BackHandler, Modal, Text, TouchableOpacity } from "react-native";
import { Clock, WifiOff } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import { Radius, Spacing, Typography } from '../../constants/theme';
import AppLoading from "../../components/AppLoading";
import { ProfileArcSwitcher } from "../../components/layout/ProfileArcSwitcher";


const SessionExpiredModal = ({ visible, onClose, colors, onReconnect, onLeave }: any) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.modalOverlay}>
      <View style={[styles.modalCard, { backgroundColor: colors.surfaceHigh || colors.surface, borderColor: colors.border }]}>
        <View style={{ alignItems: 'center', marginBottom: 24, width: '100%' }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary + '15', justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
            <Clock color={colors.primary} size={40} />
          </View>
          <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', paddingRight: 4, fontSize: 24, color: colors.text, textAlign: 'center', marginBottom: 12 }}>Session Expired</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: colors.textDim, textAlign: 'center', lineHeight: 22, paddingHorizontal: 12 }}>
            For your security, your university portal session has timed out. Reconnect to resume syncing your academic data in real-time.
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 12, width: '100%', marginTop: 8 }}>
          <TouchableOpacity 
            style={{ flex: 1, paddingVertical: 14, backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border, borderRadius: 100, justifyContent: 'center', alignItems: 'center' }}
            activeOpacity={0.8}
            onPress={onLeave}
          >
            <Text style={{ color: colors.text, fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>Leave</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={{ flex: 1, paddingVertical: 14, backgroundColor: colors.primary, borderRadius: 100, justifyContent: 'center', alignItems: 'center' }}
            activeOpacity={0.8}
            onPress={onReconnect}
          >
            <Text style={{ color: '#fff', fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>Reconnect</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);


const DisconnectedBubble = ({ onPress, colors }: any) => (
  <TouchableOpacity
    activeOpacity={0.8}
    onPress={onPress}
    style={{
      position: 'absolute',
      bottom: 120,
      right: 24,
      backgroundColor: colors.surfaceHigh || '#1e293b',
      width: 48,
      height: 48,
      borderRadius: 24,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: '#ef4444',
      shadowColor: '#ef4444',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 10,
      elevation: 10,
      zIndex: 9999,
    }}
  >
    <WifiOff color="#ef4444" size={24} />
  </TouchableOpacity>
);

export default function AppLayout() {
  const blurTargetRef = useRef<View>(null);
  const { checkForUpdates } = useUpdateStore();
  const { checkConnection, isSwitchingMode, isSessionExpired, setSessionExpired, isSessionDisconnected, isStudyOSMode } = useStudySessionStore();
  const { loadGamification } = useStudyOSStore();
  
  // Initialize background sync and polling
  useBackgroundSync();

  const colors = useThemeStore((s) => s.colors);

  useEffect(() => {
    // Single auto-check on app load — delayed so app fully renders first
    // Manual check is available in Profile → "Check for Updates"
    const timer = setTimeout(() => {
      checkForUpdates(false); // false = auto, respects cooldown
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const pathname = usePathname();
  const router = useRouter();
  
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
      <BlurTargetView ref={blurTargetRef} style={{ flex: 1 }}>
        <KeyboardAvoidingView 
          style={{ flex: 1 }} 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <Tabs
          // @ts-ignore - TS type mismatch between expo-router and @react-navigation/bottom-tabs
          tabBar={(props) => <TabBar {...props} />}
          screenOptions={{ 
            headerShown: false,
            freezeOnBlur: false,
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
      </BlurTargetView>
      {isSwitchingMode && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 999 }]}>
          <AppLoading />
        </View>
      )}

      <ProfileArcSwitcher colors={colors} blurTargetRef={blurTargetRef} />
      {isStudyOSMode && isSessionDisconnected && !isSessionExpired && (
        <DisconnectedBubble onPress={() => setSessionExpired(true)} colors={colors} />
      )}
      <SessionExpiredModal 
        visible={isSessionExpired} 
        onClose={() => {}} 
        colors={colors}
        onLeave={() => {
          setSessionExpired(false);
        }}
        onReconnect={async () => {
          setSessionExpired(false);
          const savedUni = await SecureStore.getItemAsync('study_university_id');
          router.replace({ pathname: '/(app)/studyos/webview-login', params: { uniId: savedUni || 'cu' } } as any);
        }}
      />
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  modalCard: {
    width: '100%',
    padding: Spacing.xl,
    paddingVertical: 32,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  modalBtn: {
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    alignItems: 'center',
  },
  modalBtnText: {
    // defaults
  }
});
