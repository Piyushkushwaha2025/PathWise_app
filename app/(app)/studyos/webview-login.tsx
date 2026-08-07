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

export default function WebViewLoginScreen() {
  const { user } = useUser();
  const { uniId } = useLocalSearchParams<{ uniId: string }>();
  const activeUni = UNIVERSITIES[uniId || 'cu'];
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const router = useRouter();
  const webViewRef = useRef<WebView>(null);
  const { setSession } = useStudySessionStore();
  
  const [loadingMsg, setLoadingMsg] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const [isOnLms, setIsOnLms] = useState(false);
  const [autoCreds, setAutoCreds] = useState<{u?: string, p?: string} | null>(null);
  const [webviewKey, setWebviewKey] = useState(Date.now());

  useFocusEffect(
    React.useCallback(() => {
      let isMounted = true;
      (async () => {
        setIsProcessing(false);
        setLoadingMsg('');
        if (isMounted) setWebviewKey(Date.now());
        try {
          const u = await SecureStore.getItemAsync('culko_u');
          const p = await SecureStore.getItemAsync('culko_p');
          if (isMounted) {
            if (u && p) setAutoCreds({u, p});
            else setAutoCreds(null);
          }
          await SecureStore.deleteItemAsync('culko_cookies');
        } catch(e){}
      })();
      return () => { isMounted = false; };
    }, [])
  );

  const handleCancel = () => {
    router.replace({ pathname: '/(app)/studyos/connect', params: { reset: 'true' } } as any);
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
    // 1. Matches studentHomeMatch OR
    // 2. We are on student.culko.in but NOT on the login/logout page
    const isSuccessPath = urlLower.includes(activeUni.studentHomeMatch.toLowerCase());
    const isCulkoLoggedIn = urlLower.includes('student.culko.in') && 
                            !urlLower.includes('login') && 
                            !urlLower.includes('logout');

    // Show "Finish" button only if we are past the login screen
    if (activeUni.id === 'cu') {
      setIsOnLms(isCulkoLoggedIn);
    } else {
      if (urlLower.includes(activeUni.lmsDomain.toLowerCase())) {
        if (!isOnLms) setIsOnLms(true);
      } else {
        if (isOnLms) setIsOnLms(false);
      }
    }

    // Only detect login success when page has fully loaded
    if (navState.loading) return;

    if ((isSuccessPath || isCulkoLoggedIn) && !isProcessing) {
      setIsProcessing(true);
      setLoadingMsg('Login successful. Preparing to sync data...');
      
      // Delay slightly for smooth UX, then redirect to sync screen
      setTimeout(() => {
        router.replace('/(app)/studyos/sync');
      }, 1000);
    }
    
    // Auto Login Injection
    if (!navState.loading && (urlLower.includes('login') || urlLower.includes('ums'))) {
      const uEnc = autoCreds?.u ? encodeURIComponent(autoCreds.u) : '';
      const pEnc = autoCreds?.p ? encodeURIComponent(autoCreds.p) : '';
      
      const autoFillScript = `
        try {
          var userInp = document.querySelector('input[type="text"]') || document.querySelector('input[name*="user" i]') || document.querySelector('input[name*="uid" i]');
          var passInp = document.querySelector('input[type="password"]');
          var btn = document.querySelector('input[type="submit"]') || document.querySelector('button[type="submit"]') || document.getElementById('btnLogin');
          
          var hasCreds = "${uEnc}" !== "";

          if (userInp && passInp && btn && !window.__autoLogStarted) {
             window.__autoLogStarted = true;
             
             if (hasCreds) {
               userInp.value = decodeURIComponent("${uEnc}");
               passInp.value = decodeURIComponent("${pEnc}");
             }
             
             // Always add click listener so we can save/update credentials
             btn.addEventListener('click', function() {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                   type: 'SAVE_CREDS',
                   u: userInp.value,
                   p: passInp.value
                }));
             });
          }
        } catch(e) {}
        true;
      `;
      setTimeout(() => {
        webViewRef.current?.injectJavaScript(autoFillScript);
      }, 1000);
    }
  };

  const handleMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'SAVE_CREDS' && data.u && data.p) {
         await SecureStore.setItemAsync('culko_u', data.u);
         await SecureStore.setItemAsync('culko_p', data.p);
         setAutoCreds({ u: data.u, p: data.p });
      }
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
          <Text style={styles.closeText}>Cancel</Text>
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>{activeUni.shortName} Portal</Text>
        
        {isOnLms ? (
          <TouchableOpacity onPress={forceProceed} style={styles.proceedBtn}>
             <Text style={styles.proceedText}>Finish</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>

      {/* Always render WebView so injectJavaScript continues running */}
      <WebView
        key={webviewKey}
        ref={webViewRef}
        source={{ uri: activeUni.loginUrl }}
        style={[styles.webview, isProcessing && styles.hiddenWebview]}
        onNavigationStateChange={handleNavigationStateChange}
        onMessage={handleMessage}
        startInLoadingState={true}
        sharedCookiesEnabled={true}
        renderLoading={() => (
          <View style={styles.webviewLoader}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
      />

      {isProcessing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>{loadingMsg}</Text>
        </View>
      )}
    </View>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    paddingTop: 40,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    ...Typography.h3,
    color: colors.text,
  },
  closeBtn: {
    padding: Spacing.sm,
  },
  closeText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '500',
  },
  proceedBtn: {
    padding: Spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  proceedText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: '600',
  },
  placeholder: {
    width: 60,
  },
  webview: {
    flex: 1,
  },
  hiddenWebview: {
    opacity: 0,
  },
  webviewLoader: {
    ...StyleSheet.absoluteFill as any,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill as any,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: Spacing.xl,
    zIndex: 10,
  },
  loadingText: {
    ...Typography.h3,
    color: colors.text,
    marginTop: Spacing.lg,
    textAlign: 'center',
  },
});
