import { useThemeStore } from '../../../store/useThemeStore';
import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity, BackHandler } from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { useRouter, useFocusEffect } from 'expo-router';
import { Typography, Spacing } from '../../../constants/theme';
import * as SecureStore from 'expo-secure-store';
import { useStudySessionStore } from '../../../store/studySessionStore';
import { UNIVERSITIES } from '../../../constants/universities';
import { useLocalSearchParams } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';

export default function WebViewLoginScreen() {
  const { user } = useUser();
  const { uniId } = useLocalSearchParams<{ uniId: string }>();
  const activeUni = UNIVERSITIES[uniId || 'cu'];
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const router = useRouter();
  const webViewRef = useRef<WebView>(null);
  const { setSession, clearSession } = useStudySessionStore();
  
  const [loadingMsg, setLoadingMsg] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const [isOnLms, setIsOnLms] = useState(false);
  const [webviewKey, setWebviewKey] = useState(Date.now());

  useFocusEffect(
    React.useCallback(() => {
      let isMounted = true;
      (async () => {
        setIsProcessing(false);
        setLoadingMsg('');
        if (isMounted) setWebviewKey(Date.now());
      })();
      return () => { isMounted = false; };
    }, [])
  );

  const handleCancel = () => {
    router.replace({ pathname: '/(app)/studyos/connect', params: { reset: 'true' } } as any);
  };

  const handleClearData = async () => {
    await clearSession(true);
    await SecureStore.deleteItemAsync('culko_cookies');
    setWebviewKey(Date.now()); // reload webview
  };

  useEffect(() => {
    const onBackPress = () => {
      handleCancel();
      return true;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backHandler.remove();
  }, []);

  const handleNavigationStateChange = async (navState: WebViewNavigation) => {
    const { url } = navState;
    const urlLower = url.toLowerCase();

    // Auto-detect login success:
    const isSuccessPath = urlLower.includes(activeUni.studentHomeMatch.toLowerCase());
    const isCulkoLoggedIn = urlLower.includes('student.culko.in') && 
                            !urlLower.includes('login') && 
                            !urlLower.includes('logout');

    if (activeUni.id === 'cu') {
      setIsOnLms(isCulkoLoggedIn);
    } else {
      setIsOnLms(urlLower.includes(activeUni.lmsDomain.toLowerCase()));
    }

    if (navState.loading) return;

    if ((isSuccessPath || isCulkoLoggedIn) && !isProcessing) {
      setIsProcessing(true);
      setLoadingMsg('Login successful. Preparing to sync data...');
      setTimeout(() => {
        router.replace('/(app)/studyos/sync');
      }, 1000);
    }
  };

  const handleMessage = async (event: any) => {
    try {
      // Add other message handlers here if needed in the future
    } catch (e) {}
  };

  const forceProceed = async () => {
    setIsProcessing(true);
    setLoadingMsg('Bypassing... preparing to sync');
    router.replace('/(app)/studyos/sync');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.closeBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>{activeUni.shortName} Portal</Text>
        
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={handleClearData} style={styles.clearBtn}>
             <Ionicons name="trash-outline" size={20} color={colors.error} />
          </TouchableOpacity>
          {isOnLms && (
            <TouchableOpacity onPress={forceProceed} style={styles.proceedBtn}>
               <Text style={styles.proceedText}>Finish</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <WebView
        key={webviewKey}
        ref={webViewRef}
        source={{ uri: activeUni.loginUrl }}
        style={[styles.webview, isProcessing && styles.hiddenWebview]}
        onNavigationStateChange={handleNavigationStateChange}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        incognito={false}
      />
      
      {isProcessing && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.text }]}>{loadingMsg}</Text>
        </View>
      )}
    </View>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: 16,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  closeBtn: { padding: 8, marginLeft: -8 },
  headerTitle: { 
    fontFamily: 'SpaceGrotesk_700Bold', 
    fontSize: 22, 
    color: colors.text 
  },
  clearBtn: { padding: 8, marginRight: 8 },
  proceedBtn: { padding: 8, marginRight: -8, backgroundColor: `${colors.primary}20`, borderRadius: 8 },
  proceedText: { ...Typography.body, color: colors.primary, fontFamily: 'Inter_600SemiBold' },
  webview: { flex: 1, backgroundColor: 'transparent' },
  hiddenWebview: { opacity: 0, position: 'absolute', top: -9999 },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: { ...Typography.body, marginTop: Spacing.md, fontFamily: 'Inter_500Medium' },
});
