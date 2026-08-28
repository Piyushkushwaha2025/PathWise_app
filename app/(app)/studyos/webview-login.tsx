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
  const [autoCreds, setAutoCreds] = useState<{u?: string, p?: string} | null>(null);

  const [isOnLms, setIsOnLms] = useState(false);
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
        } catch(e){}
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
    await SecureStore.deleteItemAsync('culko_u');
    await SecureStore.deleteItemAsync('culko_p');
    setAutoCreds(null);
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
    
    // Auto Login Injection for Webview
    if (!navState.loading && (urlLower.includes('login') || urlLower.includes('ums'))) {
      const uEnc = autoCreds?.u ? encodeURIComponent(autoCreds.u) : '';
      const pEnc = autoCreds?.p ? encodeURIComponent(autoCreds.p) : '';
      
      const autoFillScript = `
        try {
          var userInp = document.querySelector('input[type="text"]') || document.querySelector('input[name*="user" i]') || document.querySelector('input[name*="uid" i]');
          var passInp = document.querySelector('input[type="password"]');
          var captchaInp = document.querySelector('input[name*="captcha" i]') || document.querySelector('input[placeholder*="captcha" i]') || document.querySelector('input[id*="captcha" i]');
          var btn = document.querySelector('input[type="submit"]') || document.querySelector('button[type="submit"]') || document.getElementById('btnLogin') || document.getElementById('btnNext');
          
          var hasCreds = "${uEnc}" !== "";
          var hasCaptcha = !!captchaInp;
          var isPage1 = !!userInp && !passInp && !hasCaptcha;

          if (userInp && btn && !window.__autoLogStarted) {
             window.__autoLogStarted = true;
             
             if (hasCreds) {
               if (isPage1) {
                 userInp.value = decodeURIComponent("${uEnc}");
                 userInp.dispatchEvent(new Event('change', { bubbles: true }));
               } else if (hasCaptcha && passInp) {
                 passInp.value = decodeURIComponent("${pEnc}");
                 passInp.dispatchEvent(new Event('change', { bubbles: true }));
               }
             }
             
             // Attach click listener to save/update credentials on login click
             btn.addEventListener('click', function() {
                if (userInp && passInp) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                     type: 'SAVE_CREDS',
                     u: userInp.value,
                     p: passInp.value
                  }));
                }
             });

             if (hasCreds && isPage1) {
               // Safely auto-click NEXT button on page 1 only if there are no errors showing
               var errorMsg = document.querySelector('.text-danger') || document.querySelector('.error') || document.querySelector('#lblError');
               var errorText = errorMsg ? errorMsg.innerText.trim() : '';
               if (!errorText) {
                 setTimeout(function() { btn.click(); }, 400);
               }
             }
          }
        } catch(e) {}
        true;
      `;
      setTimeout(() => {
        webViewRef.current?.injectJavaScript(autoFillScript);
      }, 800);
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
    paddingHorizontal: Spacing.lg,
    paddingTop: 60,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeBtn: { padding: 8, marginLeft: -8 },
  headerTitle: { ...Typography.h3, color: colors.text },
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
