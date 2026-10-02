import { useThemeStore } from '../../../store/useThemeStore';
import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity, BackHandler, TextInput, Image, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { useRouter, useFocusEffect } from 'expo-router';
import { Typography, Spacing, Radius } from '../../../constants/theme';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStudySessionStore } from '../../../store/studySessionStore';
import { UNIVERSITIES } from '../../../constants/universities';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import { verifyUidWithDB, useDBProfile, syncUserWithDB } from '../../../lib/db';

function sanitizeUserFacingError(rawMsg: string | undefined | null, fallback: string = ''): string {
  if (!rawMsg) return fallback;
  const str = String(rawMsg).trim();
  const isTechnical = 
    str.includes('<') ||
    str.includes('>') ||
    str.toLowerCase().includes('json parse') ||
    str.toLowerCase().includes('unexpected') ||
    str.toLowerCase().includes('syntaxerror') ||
    str.toLowerCase().includes('network request failed') ||
    str.toLowerCase().includes('failed to fetch') ||
    str.toLowerCase().includes('token') ||
    str.toLowerCase().includes('typeerror') ||
    str.toLowerCase().includes('referenceerror') ||
    str.toLowerCase().includes('object') ||
    str.toLowerCase().includes('undefined') ||
    str.toLowerCase().includes('null');

  if (isTechnical) {
    return fallback;
  }
  return str;
}

export default function WebViewLoginScreen() {
  const { userId } = useAuth();
  const { dbUser } = useDBProfile();
  const { uniId, isReconnect } = useLocalSearchParams<{ uniId: string, isReconnect?: string }>();
  const activeUni = UNIVERSITIES[uniId || 'cu'];
  const colors = useThemeStore((s) => s.colors);
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === 'black';
  const styles = useStyles(colors, isDark, theme);
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

    // Fast-path: Trigger immediately when navigated to success page (do NOT wait 10s for heavy images/banners to finish loading)
    if ((isSuccessPath || isCulkoLoggedIn) && loadingMsg !== 'Login successful. Preparing to sync data...') {
      setIsProcessing(true);
      setLoadingMsg('Login successful. Preparing to sync data...');
      
      // Request cookies immediately from webview
      webViewRef.current?.injectJavaScript(`
        try {
          var c = document.cookie;
          if (c) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'COOKIES', data: c }));
        } catch(e) {}
        true;
      `);

      // Save credentials for auto-login later
      if (uid && pwd) {
        SecureStore.setItemAsync('culko_u', uid).catch(() => {});
        SecureStore.setItemAsync('culko_p', pwd).catch(() => {});
      }
      
      // Immediately bind and persist UID to MongoDB
      if (userId && uid) {
        syncUserWithDB(userId, undefined, uid.trim()).catch((err) => {
          console.warn('[WebViewLogin] Background sync UID notice:', err?.message);
        });
      }
      
      setTimeout(() => {
        if (isReconnect === 'true') {
          useStudySessionStore.getState().setSessionDisconnected(false);
          router.replace('/(app)/studyos/dashboard');
        } else {
          router.replace('/(app)/studyos/sync');
        }
      }, 50);
      return;
    }

    if (navState.loading) return;

    // Re-inject the polling script on every page load to ensure we catch CAPTCHA after postback
    webViewRef.current?.injectJavaScript(injectedJs);
  };

  const handleMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'COOKIES' && data.data) {
        SecureStore.setItemAsync('culko_cookies', data.data).catch(() => {});
        AsyncStorage.setItem('culko_cookies', data.data).catch(() => {});
      } else if (data.type === 'CAPTCHA_SRC') {
        setCaptchaBase64(data.src);
        if (step === 2 && isProcessing && loadingMsg === 'Authenticating...') {
          setInlineError('Invalid CAPTCHA or credentials. Please try again with the new image.');
          setCaptchaInput('');
        } else if (step === 1) {
          setInlineError('');
        }
        setStep(2);
        setIsProcessing(false);
      } else if (data.type === 'LOGIN_SUCCESS') {
        if (loadingMsg !== 'Login successful. Preparing to sync data...') {
          setIsProcessing(true);
          setLoadingMsg('Login successful. Preparing to sync data...');
          if (data.cookies) {
            SecureStore.setItemAsync('culko_cookies', data.cookies).catch(() => {});
            AsyncStorage.setItem('culko_cookies', data.cookies).catch(() => {});
          }
          if (uid && pwd) {
            SecureStore.setItemAsync('culko_u', uid).catch(() => {});
            SecureStore.setItemAsync('culko_p', pwd).catch(() => {});
          }
          if (userId && uid) {
            syncUserWithDB(userId, undefined, uid.trim()).catch((err) => {
              console.warn('[WebViewLogin] Background sync UID notice:', err?.message);
            });
          }
          setTimeout(() => {
            if (isReconnect === 'true') {
              useStudySessionStore.getState().setSessionDisconnected(false);
              router.replace('/(app)/studyos/dashboard');
            } else {
              router.replace('/(app)/studyos/sync');
            }
          }, 50);
        }
      } else if (data.type === 'ERROR') {
        const cleanMsg = sanitizeUserFacingError(data.msg, '');
        if (cleanMsg) {
          setInlineError(cleanMsg);
        }
        setCaptchaInput(''); // Clear the old input
        setIsProcessing(false);
      }
    } catch (e) {}
  };

  const forceProceed = async () => {
    setIsProcessing(true);
    setLoadingMsg('Bypassing... preparing to sync');
    
        if (isReconnect === 'true') {
          useStudySessionStore.getState().setSessionDisconnected(false);
          router.replace('/(app)/studyos/dashboard');
        } else {
          router.replace('/(app)/studyos/sync');
        }
  };

  const handleNextStep1 = async () => {
    let hasError = false;
    const cleanUid = uid.trim();
    if (!cleanUid) { setUidError('Username is required'); hasError = true; }
    if (!pwd.trim()) { setPwdError('Password is required'); hasError = true; }
    if (!consent) { setConsentError('You must agree to store credentials'); hasError = true; }
    
    if (hasError) return;
    
    setInlineError('');
    setUidError('');

    // Instant local in-memory lock check (0 ms response!)
    const currentBound = (dbUser?.uid && dbUser.uid.trim() !== '' && dbUser.uid.trim().toUpperCase() !== 'UNKNOWN')
      ? dbUser.uid.trim().toUpperCase()
      : null;
    if (currentBound && !currentBound.includes('TEST') && !currentBound.startsWith('TEMP')) {
      if (cleanUid.toUpperCase() !== currentBound) {
        const errorMsg = 'This PathWise account is already linked to a different College ID.';
        setUidError(errorMsg);
        setInlineError(errorMsg);
        return;
      }
    }

    setIsProcessing(true);
    setLoadingMsg('Connecting...');

    // Parallel trigger: Immediately inject script into webview so ASP.NET starts processing next step right away
    const safeUid = cleanUid.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const script = `
      (function() {
        var uidField = document.getElementById('txtUserId') || document.querySelector('input[name*="UserId"]');
        var nextBtn = document.getElementById('btnNext') || document.querySelector('input[type="submit"][value="Next"]');
        if (uidField && nextBtn) {
          uidField.value = '${safeUid}';
          uidField.dispatchEvent(new Event('change', { bubbles: true }));
          nextBtn.click();
        }
      })();
      true;
    `;
    webViewRef.current?.injectJavaScript(script);

    // Concurrently verify with DB (runs in parallel while webview loads)
    if (userId) {
      verifyUidWithDB(userId, cleanUid).catch((err: any) => {
        if (err?.code === 'UID_ALREADY_LINKED' || err?.code === 'UID_NOT_ALLOWED' || err?.code === 'ACCOUNT_ALREADY_BOUND') {
          setIsProcessing(false);
          setLoadingMsg('');
          setStep(1);
          setCaptchaBase64(null);
          const friendlyMsg = err?.code === 'ACCOUNT_ALREADY_BOUND'
            ? 'This PathWise account is already linked to a different College ID.'
            : (err?.message || 'This College ID is already linked to another PathWise account.');
          setUidError(friendlyMsg);
          setInlineError(friendlyMsg);
          setWebviewKey(Date.now()); // Reset webview
        } else {
          console.warn('verifyUidWithDB non-fatal issue bypassed:', err?.message);
        }
      });
    }
  };

  const handleLogin = () => {
    if (!pwd.trim() || !captchaInput.trim()) {
      setInlineError('Please fill all fields');
      return;
    }
    setInlineError('');
    setIsProcessing(true);
    setLoadingMsg('Authenticating...');

    const safeUid = uid.trim().replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const safePwd = pwd.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const safeCaptcha = captchaInput.trim().replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    const script = `
      (function() {
        try {
          var uidField = document.getElementById('txtUserId') || document.querySelector('input[name*="UserId"]');
          if (uidField && !uidField.value) {
            uidField.value = '${safeUid}';
            uidField.dispatchEvent(new Event('change', { bubbles: true }));
          }

          var pwdField = document.getElementById('txtLoginPassword') || document.getElementById('txtPassword') || document.querySelector('input[type="password"]');
          var captchaField = document.getElementById('txtcaptcha') || document.getElementById('txtCaptcha') || document.querySelector('input[name*="captcha"]');
          
          var loginBtn = document.getElementById('btnLogin') || document.getElementById('btnSubmit');
          if (!loginBtn) {
            var submits = document.querySelectorAll('input[type="submit"], button[type="submit"]');
            for (var i = 0; i < submits.length; i++) {
              if (submits[i].id !== 'btnNext' && submits[i].name !== 'btnNext') {
                loginBtn = submits[i];
                break;
              }
            }
          }

          if (pwdField && captchaField && loginBtn) {
            pwdField.value = '${safePwd}';
            pwdField.dispatchEvent(new Event('input', { bubbles: true }));
            pwdField.dispatchEvent(new Event('change', { bubbles: true }));

            captchaField.value = '${safeCaptcha}';
            captchaField.dispatchEvent(new Event('input', { bubbles: true }));
            captchaField.dispatchEvent(new Event('change', { bubbles: true }));

            setTimeout(function() {
              loginBtn.click();
            }, 100);
          } else {
            window.ReactNativeWebView.postMessage(JSON.stringify({ 
              type: 'ERROR', 
              msg: 'Login fields not found on page.' 
            }));
          }
        } catch(err) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ 
            type: 'ERROR', 
            msg: err.message || 'Error submitting form' 
          }));
        }
      })();
      true;
    `;
    webViewRef.current?.injectJavaScript(script);
  };

  const injectedJs = `
    (function() {
      let lastError = '';
      let lastCaptcha = '';
      
      // Intercept window.alert for UIMS popups
      const originalAlert = window.alert;
      window.alert = function(msg) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', msg: msg }));
        if (originalAlert) {}
      };

      setInterval(function() {
        try {
          var currentUrl = (window.location.href || '').toLowerCase();
          if ((currentUrl.includes('student.culko.in') || currentUrl.includes('home') || currentUrl.includes('profile')) &&
              !currentUrl.includes('login') && !currentUrl.includes('logout')) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'LOGIN_SUCCESS', url: currentUrl, cookies: document.cookie }));
            return;
          }

          var errorLbl = document.getElementById('lblMessage') || document.getElementById('lblMsg') || document.getElementById('lblError');
          if (errorLbl && errorLbl.innerText && errorLbl.innerText.trim() !== '' && errorLbl.innerText.trim() !== lastError) {
             lastError = errorLbl.innerText.trim();
             if (!lastError.toLowerCase().includes('success') && !lastError.toLowerCase().includes('wait')) {
               window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', msg: lastError }));
             }
          }

          var captchaImg = document.getElementById('imgCaptcha') || document.querySelector('img[src*="Captcha"]') || document.querySelector('img[src*="captcha"]');
          if (captchaImg && captchaImg.src && captchaImg.src !== lastCaptcha && captchaImg.complete && captchaImg.naturalWidth > 0) {
             lastCaptcha = captchaImg.src;
             try {
               var canvas = document.createElement('canvas');
               canvas.width = captchaImg.naturalWidth;
               canvas.height = captchaImg.naturalHeight;
               var ctx = canvas.getContext('2d');
               ctx.drawImage(captchaImg, 0, 0);
               var base64 = canvas.toDataURL('image/png');
               if (base64 && base64.length > 100) {
                 window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CAPTCHA_SRC', src: base64 }));
               }
             } catch(e) {
               window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CAPTCHA_SRC', src: lastCaptcha }));
             }
          }
        } catch(e) {}
      }, 180);
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
          
          <View style={styles.uniBadgeHeader}>
            <View style={styles.uniBadgePod}>
              <Ionicons name="school" size={32} color={colors.primary} />
            </View>
            <View style={styles.uniBadgeTag}>
              <Text style={styles.uniBadgeTagText}>{activeUni.shortName}</Text>
            </View>
          </View>

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
                <Ionicons name="shield-checkmark" size={14} color={colors.textMuted} style={{ marginTop: 2 }} />
                <Text style={styles.privacyText}>
                  We never store your password on our servers. It is securely encrypted and saved only on your device.
                </Text>
              </View>

              <TouchableOpacity style={styles.checkboxContainer} onPress={() => { setConsent(!consent); setConsentError(''); }} activeOpacity={0.8}>
                <Ionicons name={consent ? "checkbox" : "square-outline"} size={22} color={consent ? colors.primary : colors.textMuted} />
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

      <View style={{ position: 'absolute', top: -9999, left: -9999, width: 400, height: 800, opacity: 0 }}>
        <WebView
          key={webviewKey}
          ref={webViewRef}
          source={{ uri: activeUni.loginUrl }}
          style={{ width: 400, height: 800 }}
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

const useStyles = (colors: any, isDark: boolean, theme?: string) => StyleSheet.create({
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
  proceedBtn: { padding: 8, marginRight: -8, backgroundColor: `${colors.primary}20`, borderRadius: 8 },
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
  uniBadgeHeader: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  uniBadgePod: {
    width: 68,
    height: 68,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: isDark ? 'rgba(255,255,255,0.12)' : (theme === 'cream' ? '#d1c4b2' : theme === 'emerald' ? '#9DDABA' : colors.border),
    backgroundColor: isDark ? '#14141a' : (theme === 'cream' ? '#f3f0e6' : theme === 'emerald' ? '#D5F5E3' : '#ffffff'),
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: isDark ? 0.3 : 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  uniBadgeTag: {
    marginTop: -8,
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  uniBadgeTagText: {
    color: '#ffffff',
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 10.5,
    letterSpacing: 0.5,
  },
  formTitle: {
    ...Typography.h1,
    color: colors.text,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  formSubtitle: {
    ...Typography.body,
    color: colors.textMuted,
    marginBottom: Spacing.xl * 1.5,
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
    color: colors.textMuted,
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
    color: '#ffffff',
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
