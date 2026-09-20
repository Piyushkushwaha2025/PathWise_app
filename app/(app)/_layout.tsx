import { Tabs, usePathname, useRouter } from "expo-router";
import { TabBar } from "../../components/layout/TabBar";
import { useEffect, useRef, useState } from "react";
import { BlurTargetView } from "expo-blur";
import { useUpdateStore } from "../../store/useUpdateStore";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeStore } from "../../store/useThemeStore";
import { useStudySessionStore } from "../../store/studySessionStore";
import { useStudyOSStore } from "../../store/studyosStore";
import { useBackgroundSync } from "../../hooks/useBackgroundSync";
import { KeyboardAvoidingView, Platform, StyleSheet, View, BackHandler, Modal, Text, TouchableOpacity, Animated } from "react-native";
import { Clock, WifiOff } from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { Radius, Spacing, Typography } from '../../constants/theme';
import AppLoading from "../../components/AppLoading";
import { SilentReconnectModal } from '../../components/studyos/SilentReconnectModal';

import { ProfileArcSwitcher } from "../../components/layout/ProfileArcSwitcher";





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
  const { checkConnection, isSwitchingMode, isSessionExpired, setSessionExpired, isSessionDisconnected, isStudyOSMode, customError, setCustomError } = useStudySessionStore();
  const { loadGamification } = useStudyOSStore();
  
  // Initialize background sync and polling
  useBackgroundSync();

  const colors = useThemeStore((s) => s.colors);

  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const toastAnim = useRef(new Animated.Value(-150)).current;

  const triggerReconnectToast = () => {
    const msgs = [
      "We're back baby! 🚀",
      "Connection restored! The Matrix has you again. 💊",
      "Ta-da! Connected faster than your ex replies! 🏃‍♂️💨",
      "A wild connection appeared! 🎮",
      "Wifi gods are happy today! 📶🙌",
      "Hooray! Data is flowing again! 🌊"
    ];
    setToastMsg(msgs[Math.floor(Math.random() * msgs.length)]);
    setShowToast(true);
    Animated.sequence([
      Animated.spring(toastAnim, { toValue: Platform.OS === 'ios' ? 60 : 40, useNativeDriver: true }),
      Animated.delay(3500),
      Animated.timing(toastAnim, { toValue: -150, duration: 400, useNativeDriver: true })
    ]).start(() => setShowToast(false));
  };


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
      <SilentReconnectModal 
        visible={isSessionExpired} 
        onClose={() => {
          setSessionExpired(false);
          setCustomError(null);
        }} 
        colors={colors}
        customError={customError}
        onLeave={() => { setSessionExpired(false); setCustomError(null); }}
        onSuccess={() => {
          setSessionExpired(false);
          setCustomError(null);
          useStudySessionStore.getState().setSessionDisconnected(false);
          triggerReconnectToast();
        }}
      />

      {/* Premium Shape Toast Notification */}
      {showToast && (
        <Animated.View style={{
          position: 'absolute',
          top: 0,
          alignSelf: 'center',
          width: '88%',
          transform: [{ translateY: toastAnim }],
          backgroundColor: colors.surfaceHigh || '#111827',
          borderRadius: 28,
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.08)',
          borderBottomWidth: 4,
          borderBottomColor: '#22c55e',
          paddingVertical: 14,
          paddingHorizontal: 18,
          flexDirection: 'row',
          alignItems: 'center',
          shadowColor: '#22c55e',
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: 0.25,
          shadowRadius: 24,
          elevation: 14,
          zIndex: 9999
        }}>
          <View style={{
            width: 46,
            height: 46,
            borderRadius: 16,
            backgroundColor: '#22c55e15',
            justifyContent: 'center',
            alignItems: 'center',
            marginRight: 16
          }}>
            <Ionicons name="checkmark-done-circle" size={26} color="#22c55e" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text || '#fff', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16, letterSpacing: 0.3, marginBottom: 2 }}>
              Online & Synced
            </Text>
            <Text style={{ color: colors.textDim, fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 16, paddingRight: 4 }}>
              {toastMsg}
            </Text>
          </View>
        </Animated.View>
      )}
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
