import { useThemeStore } from '../../../store/useThemeStore';
import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity, BackHandler, TextInput, Image, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { useRouter, useFocusEffect } from 'expo-router';
import { Typography, Spacing, Radius } from '../../../constants/theme';
import * as SecureStore from 'expo-secure-store';
import { useStudySessionStore } from '../../../store/studySessionStore';
import { UNIVERSITIES } from '../../../constants/universities';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';

export default function WebViewLoginScreen() {
  const { uniId } = useLocalSearchParams<{ uniId: string }>();
  const activeUni = UNIVERSITIES[uniId || 'cu'];
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const router = useRouter();
  const webViewRef = useRef<WebView>(null);
  const shouldAutoFillRef = useRef(false);
  const { clearSession } = useStudySessionStore();
  
  const [loadingMsg, setLoadingMsg] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOnLms, setIsOnLms] = useState(false);
  const [webviewKey, setWebviewKey] = useState(Date.now());

  // Native UI State
  const [step, setStep] = useState(1); // 1 = UID+Pwd, 2 = Captcha
  const [uid, setUid] = useState('');
  const [pwd, setPwd] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaBase64, setCaptchaBase64] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState('');
  
  // Field-specific errors
  const [uidError, setUidError] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [consentError, setConsentError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [consent, setConsent] = useState(false);



  // Reset state and Auto-fetch credentials on screen focus
  useFocusEffect(
    React.useCallback(() => {
      let isMounted = true;
      (async () => {
        // Reset state so old captchas don't stick around
        setStep(1);
        setCaptchaBase64(null);
        setCaptchaInput('');
        setUidError('');
        setPwdError('');
        setConsentError('');
        setInlineError('');
        setIsProcessing(false);
        setLoadingMsg('');
        
        if (isMounted) setWebviewKey(Date.now());

        const savedU = await SecureStore.getItemAsync('culko_u');
        const savedP = await SecureStore.getItemAsync('culko_p');
        if (savedU && savedP && isMounted) {
          setUid(savedU);
          setPwd(savedP);
          setConsent(true);
          
          setTimeout(() => {
            if (!isMounted) return;
            setInlineError('');
            setIsProcessing(true);
            setLoadingMsg('Restoring Connection...');
            
            const script = `
              var uidField = document.getElementById('txtUserId');
              var nextBtn = document.getElementById('btnNext');
              if (uidField && nextBtn) {
                uidField.value = '${savedU}';
                nextBtn.click();
              }
              true;
            `;
            if (webViewRef.current) {
                webViewRef.current.injectJavaScript(script);
            }
          }, 600);
        } else if (isMounted) {
          setUid('');
          setPwd('');
          setConsent(false);
        }
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
    setUid('');
    setPwd('');
    setConsent(false);
    setStep(1);
    setCaptchaBase64(null);
    setUidError('');
    setPwdError('');
    setConsentError('');
    setInlineError('');
    setWebviewKey(Date.now());
  };

  useEffect(() => {
    const onBackPress = () => {
      if (step === 2) {
        setStep(1);
        setCaptchaBase64(null);
        setWebviewKey(Date.now()); // Reset webview to start over
      } else {
        handleCancel();
      }
      return true;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backHandler.remove();
  }, [step]);

  const handleNavigationStateChange = async (navState: WebViewNavigation) => {
    const { url } = navState;
    const urlLower = url.toLowerCase();

    const isSuccessPath = urlLower.includes(activeUni.studentHomeMatch.toLowerCase());
    const isCulkoLoggedIn = urlLower.includes('student.culko.in') && 
                            !urlLower.includes('login') && 
                            !urlLower.includes('logout');

    if (activeUni.id === 'cu') setIsOnLms(isCulkoLoggedIn);
    else setIsOnLms(urlLower.includes(activeUni.lmsDomain.toLowerCase()));

    if (navState.loading) return;

    if ((isSuccessPath || isCulkoLoggedIn) && loadingMsg !== 'Login successful. Preparing to sync data...') {
      setIsProcessing(true);
      setLoadingMsg('Login successful. Preparing to sync data...');
      
      // Save credentials for auto-login later
      if (uid && pwd) {
        await SecureStore.setItemAsync('culko_u', uid);
        await SecureStore.setItemAsync('culko_p', pwd);
      }
      
      setTimeout(() => {
        router.replace('/(app)/studyos/sync');
      }, 100);
    } else if (!navState.loading) {
      // Re-inject the polling script on every page load to ensure we catch CAPTCHA after postback
      webViewRef.current?.injectJavaScript(injectedJs);
    }
  };

  const handleMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'CAPTCHA_SRC') {
        setCaptchaBase64(data.src);
        setStep(2);
        setIsProcessing(false);
      } else if (data.type === 'ERROR') {
        setInlineError(data.msg);
        setIsProcessing(false);
      }
    } catch (e) {}
  };

  const forceProceed = async () => {
    setIsProcessing(true);
    setLoadingMsg('Bypassing... preparing to sync');
    router.replace('/(app)/studyos/sync');
  };

  const handleNextStep1 = () => {
    let hasError = false;
    if (!uid.trim()) { setUidError('Username is required'); hasError = true; }
    if (!pwd.trim()) { setPwdError('Password is required'); hasError = true; }
    if (!consent) { setConsentError('You must agree to store credentials'); hasError = true; }
    
    if (hasError) return;
    
    setInlineError('');
    setIsProcessing(true);
    setLoadingMsg('Restoring Connection...');
    
    const script = `
      var uidField = document.getElementById('txtUserId');
      var nextBtn = document.getElementById('btnNext');
      if (uidField && nextBtn) {
        uidField.value = '${uid.trim()}';
        nextBtn.click();
      }
      true;
    `;
    webViewRef.current?.injectJavaScript(script);
  };

  const handleLogin = () => {
    if (!pwd.trim() || !captchaInput.trim()) {
      setInlineError('Please fill all fields');
      return;
    }
    setInlineError('');
    setIsProcessing(true);
    setLoadingMsg('Authenticating...');

    const script = `
      var pwdField = document.getElementById('txtLoginPassword');
      var captchaField = document.getElementById('txtcaptcha');
      var loginBtn = document.getElementById('btnLogin');
      if (pwdField && captchaField && loginBtn) {
        pwdField.value = '${pwd.replace(/'/g, "\\\\'")}';
        captchaField.value = '${captchaInput.trim()}';
        loginBtn.click();
      }
      true;
    `;
    webViewRef.current?.injectJavaScript(script);
  };

  const injectedJs = `
    (function() {
      let lastError = '';
      let lastCaptcha = '';
      
      setInterval(function() {
        try {
          var errorLbl = document.getElementById('lblMessage');
          if (errorLbl && errorLbl.innerText.trim() !== '' && errorLbl.innerText.trim() !== lastError) {
             lastError = errorLbl.innerText.trim();
             window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', msg: lastError }));
          }

          var captchaImg = document.getElementById('imgCaptcha');
          if (captchaImg && captchaImg.src && captchaImg.src !== lastCaptcha) {
             lastCaptcha = captchaImg.src;
             try {
               var canvas = document.createElement('canvas');
               canvas.width = captchaImg.width || 150;
               canvas.height = captchaImg.height || 50;
               var ctx = canvas.getContext('2d');
               ctx.drawImage(captchaImg, 0, 0, canvas.width, canvas.height);
               var base64 = canvas.toDataURL('image/png');
               window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CAPTCHA_SRC', src: base64 }));
             } catch(e) {
               window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CAPTCHA_SRC', src: lastCaptcha }));
             }
          }
        } catch(e) {}
      }, 500);
    })();
    true;
  `;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.closeBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="school" size={24} color={colors.primary} />
          <Text style={styles.headerTitle}>
            <Text style={{ color: colors.primary }}>{activeUni.shortName}</Text> Login
          </Text>
        </View>
        
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={handleClearData} style={styles.clearBtn}>
             <Ionicons name="trash-outline" size={20} color={colors.error} />
          </TouchableOpacity>

        </View>
      </View>

      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.formContainer} keyboardShouldPersistTaps="handled">
          
          <Text style={styles.formTitle}>Welcome to {activeUni.shortName}</Text>
          <Text style={styles.formSubtitle}>Sign in securely to sync your Attendance, Timetable, Marks & Profile directly to your device.</Text>

          {step === 1 && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Username <Text style={{color: colors.primary, fontSize: 11}}>(Saved on device)</Text></Text>
              <TextInput
                style={[styles.input, uidError ? { borderColor: colors.error } : null]}
                placeholder="e.g. 21BCS1000"
                placeholderTextColor={colors.textDim}
                value={uid}
                onChangeText={(t) => { setUid(t); setUidError(''); }}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {uidError ? <Text style={styles.fieldError}>{uidError}</Text> : null}
              
              <Text style={[styles.label, { marginTop: 24 }]}>Password <Text style={{color: colors.primary, fontSize: 11}}>(Auto-filled next time)</Text></Text>
              <View style={[styles.passwordContainer, pwdError ? { borderColor: colors.error } : null]}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Enter password"
                  placeholderTextColor={colors.textDim}
                  value={pwd}
                  onChangeText={(t) => { setPwd(t); setPwdError(''); }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ padding: 6 }}>
                  <Feather name={showPassword ? "eye" : "eye-off"} size={18} color={showPassword ? colors.primary : colors.textDim} />
                </TouchableOpacity>
              </View>
              {pwdError ? <Text style={styles.fieldError}>{pwdError}</Text> : null}
              
              <View style={styles.privacyContainer}>
                <Ionicons name="shield-checkmark" size={14} color={colors.textDim} style={{ marginTop: 2 }} />
                <Text style={styles.privacyText}>
                  We never store your password on our servers. It is securely encrypted and saved only on your device.
                </Text>
              </View>

              <TouchableOpacity style={styles.checkboxContainer} onPress={() => { setConsent(!consent); setConsentError(''); }} activeOpacity={0.8}>
                <Ionicons name={consent ? "checkbox" : "square-outline"} size={22} color={consent ? colors.primary : colors.textDim} />
                <Text style={styles.checkboxText}>
                  I agree to securely save my credentials on this device for faster logins. I acknowledge that maintaining my device's security is my responsibility.
                </Text>
              </TouchableOpacity>
              {consentError ? <Text style={[styles.fieldError, { marginTop: 0 }]}>{consentError}</Text> : null}

              {inlineError ? <Text style={styles.errorText}>{inlineError}</Text> : null}

              <TouchableOpacity style={[styles.primaryBtn, { marginTop: 32 }]} onPress={handleNextStep1} disabled={isProcessing}>
                <Text style={styles.primaryBtnText}>Login</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 2 && (
            <View style={styles.inputGroup}>
              {captchaBase64 && (
                <View style={[styles.captchaContainer, { marginTop: 24 }]}>
                  <Text style={styles.label}>Security Check</Text>
                  <View style={styles.captchaRow}>
                    <Image source={{ uri: captchaBase64 }} style={styles.captchaImg} resizeMode="contain" />
                    <TouchableOpacity 
                      style={styles.refreshBtn}
                      onPress={() => {
                        webViewRef.current?.injectJavaScript("document.getElementById('btnRefresh').click(); true;");
                      }}
                    >
                      <Ionicons name="refresh" size={20} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter CAPTCHA"
                    placeholderTextColor={colors.textDim}
                    value={captchaInput}
                    onChangeText={(t) => { setCaptchaInput(t); setInlineError(''); }}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              )}

              {inlineError ? <Text style={styles.errorText}>{inlineError}</Text> : null}

              <TouchableOpacity style={[styles.primaryBtn, { marginTop: 32 }]} onPress={handleLogin} disabled={isProcessing}>
                <Text style={styles.primaryBtnText}>Login</Text>
              </TouchableOpacity>
            </View>
          )}

        </ScrollView>
      </View>

      <View style={{ position: 'absolute', width: 0, height: 0, opacity: 0, overflow: 'hidden' }}>
        <WebView
          key={webviewKey}
          ref={webViewRef}
          source={{ uri: activeUni.loginUrl }}
          style={{ width: 0, height: 0, backgroundColor: 'transparent' }}
          onNavigationStateChange={handleNavigationStateChange}
          onMessage={handleMessage}
          injectedJavaScript={injectedJs}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
          incognito={false}
        />
      </View>
      
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
  closeBtn: { padding: 8, marginLeft: -12 },
  headerTitle: { fontFamily: 'SpaceGrotesk_700Bold', paddingRight: 4, fontSize: 22, color: colors.text },
  clearBtn: { padding: 8, marginRight: 8 },
  proceedBtn: { padding: 8, marginRight: -8, backgroundColor: `\${colors.primary}20`, borderRadius: 8 },
  proceedText: { ...Typography.body, color: colors.primary, fontFamily: 'Inter_600SemiBold' },
  
  hiddenWebview: { opacity: 0, position: 'absolute', top: -9999, height: 0, width: 0 },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: { ...Typography.body, marginTop: Spacing.md, fontFamily: 'Inter_500Medium' },

  formContainer: {
    flexGrow: 1,
    padding: Spacing.xl,
    justifyContent: 'center',
    paddingBottom: 120, // Push it slightly above the middle for better keyboard visibility
  },
  formTitle: {
    ...Typography.h1,
    color: colors.text,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  formSubtitle: {
    ...Typography.body,
    color: colors.textDim,
    marginBottom: Spacing.xl * 2,
    textAlign: 'center',
  },
  inputGroup: {
    width: '100%',
    maxWidth: 340,
    alignSelf: 'center',
    // removed gap to fix spacing between label and textfield
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.text,
    marginBottom: 6,
    marginLeft: 4, // slight indent for pill-shaped inputs
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.full,
    paddingRight: 16,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    color: colors.text,
    ...Typography.body,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.full,
    paddingVertical: 12,
    paddingHorizontal: 20,
    color: colors.text,
    ...Typography.body,
  },
  privacyContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 4,
    gap: 6,
  },
  privacyText: {
    ...Typography.body,
    fontSize: 12,
    color: colors.textDim,
    flex: 1,
    lineHeight: 18,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 24,
    paddingHorizontal: 4,
    gap: 8,
  },
  checkboxText: {
    ...Typography.body,
    fontSize: 12,
    color: colors.text,
    flex: 1,
    lineHeight: 18,
  },
  fieldError: {
    color: colors.error,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    marginTop: 6,
    marginLeft: 12,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    marginTop: 4,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: Spacing.lg,
  },
  primaryBtnText: {
    color: colors.background,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
  },
  captchaContainer: {
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
  captchaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  captchaImg: {
    height: 50,
    width: 150,
    backgroundColor: '#fff',
    borderRadius: Radius.md,
  },
  refreshBtn: {
    padding: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.md,
  },
});
