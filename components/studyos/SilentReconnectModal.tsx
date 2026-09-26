import React, { useState, useRef, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, TextInput } from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { Clock } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UNIVERSITIES } from '../../constants/universities';
import { Radius, Spacing } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useStudySessionStore } from '../../store/studySessionStore';

export const SilentReconnectModal = ({ visible, onClose, colors, onLeave, onSuccess, customError }: any) => {
  const [step, setStep] = useState('expired'); // expired -> connecting -> captcha -> verifying
  const [captchaBase64, setCaptchaBase64] = useState<string | null>(null);
  const [captchaInput, setCaptchaInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  
  const webViewRef = useRef<WebView>(null);
  const [loginUrl, setLoginUrl] = useState('about:blank');
  const [savedU, setSavedU] = useState('');
  const [savedP, setSavedP] = useState('');
  const router = useRouter();
  
  // Reset when opened
  useEffect(() => {
    if (visible) {
      setStep('expired');
      setCaptchaBase64(null);
      setCaptchaInput('');
      setErrorMsg('');
      setLoginUrl('about:blank');
    }
  }, [visible]);

  const handleInitialReconnect = async () => {
    setStep('connecting');
    const uniId = await SecureStore.getItemAsync('study_university_id') || 'cu';
    const u = await SecureStore.getItemAsync('culko_u');
    const p = await SecureStore.getItemAsync('culko_p');
    
    if (!u || !p) {
      onClose();
      return;
    }
    
    setSavedU(u);
    setSavedP(p);
    setLoginUrl(UNIVERSITIES[uniId].loginUrl);
  };

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    const url = navState.url.toLowerCase();
    const isSuccess = url.includes('studenthome') || url.includes('dashboard') || (url.includes('student.culko.in') && !url.includes('login') && !url.includes('logout'));
    
    if (isSuccess && step !== 'expired') {
       // Request fresh cookies from the WebView session
       webViewRef.current?.injectJavaScript(`
         try {
           var c = document.cookie;
           window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'RECONNECT_COOKIES', cookie: c }));
         } catch(e) {}
         true;
       `);
       setTimeout(() => {
         onSuccess();
       }, 500);
    }
  };
  
  const handleLoadEnd = () => {
    if (step === 'connecting' && savedU) {
      webViewRef.current?.injectJavaScript(`
        var uidField = document.getElementById('txtUserId');
        var nextBtn = document.getElementById('btnNext');
        if (uidField && nextBtn) {
          uidField.value = '${savedU}';
          nextBtn.click();
        }
        true;
      `);
    }
  };

  const handleMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'RECONNECT_COOKIES') {
        if (data.cookie) {
          await SecureStore.setItemAsync('culko_cookies', data.cookie).catch(() => {});
          await AsyncStorage.setItem('culko_cookies', data.cookie).catch(() => {});
          await SecureStore.setItemAsync('session_saved_at', Date.now().toString()).catch(() => {});
        }
        onSuccess();
      } else if (data.type === 'CAPTCHA_SRC') {
         setCaptchaBase64(data.src);
         setStep('captcha');
      } else if (data.type === 'ERROR') {
         setErrorMsg(data.msg);
         setStep('captcha'); // go back to captcha to retry
      }
    } catch(e) {}
  };

  const submitCaptcha = () => {
    if (!captchaInput.trim()) return;
    setStep('verifying');
    setErrorMsg('');
    webViewRef.current?.injectJavaScript(`
      var pwdField = document.getElementById('txtLoginPassword');
      var capField = document.getElementById('txtcaptcha');
      var loginBtn = document.getElementById('btnLogin');
      if (pwdField && capField && loginBtn) {
         pwdField.value = '${savedP}';
         capField.value = '${captchaInput}';
         loginBtn.click();
      }
      true;
    `);
  };

  const injectedJs = `
    var lastCaptcha = '';
    setInterval(function() {
      try {
        var errorLbl = document.getElementById('lblMessage');
        if (errorLbl && errorLbl.innerText.trim() !== '') {
           window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', msg: errorLbl.innerText.trim() }));
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
    true;
  `;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onLeave}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: colors.surfaceHigh || colors.surface, borderColor: colors.border }]}>
          
          {step === 'expired' && (
            <React.Fragment>
              <View style={{ alignItems: 'center', marginBottom: 24, width: '100%' }}>
                <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: customError ? '#ef444415' : colors.primary + '15', justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
                  {customError 
                    ? <Ionicons name="shield-checkmark-outline" size={40} color="#ef4444" />
                    : <Clock color={colors.primary} size={40} />
                  }
                </View>
                <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', paddingRight: 4, fontSize: 22, color: colors.text, textAlign: 'center', marginBottom: 12 }}>
                  {customError ? 'Account Conflict' : 'Session Expired'}
                </Text>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: colors.textDim, textAlign: 'center', lineHeight: 22, paddingHorizontal: 12 }}>
                  {customError || 'For your security, your university portal session has timed out. Reconnect to resume syncing your academic data in real-time.'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 12, width: '100%', marginTop: 8 }}>
                <TouchableOpacity style={{ flex: 1, paddingVertical: 14, backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border, borderRadius: 100, justifyContent: 'center', alignItems: 'center' }} activeOpacity={0.8} onPress={onLeave}>
                  <Text style={{ color: colors.text, fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>Leave</Text>
                </TouchableOpacity>
                {!customError && (
                  <TouchableOpacity style={{ flex: 1, paddingVertical: 14, backgroundColor: colors.primary, borderRadius: 100, justifyContent: 'center', alignItems: 'center' }} activeOpacity={0.8} onPress={handleInitialReconnect}>
                    <Text style={{ color: '#fff', fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>Reconnect</Text>
                  </TouchableOpacity>
                )}
              </View>
            </React.Fragment>
          )}

          {step === 'connecting' && (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ marginTop: 16, color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 16 }}>Connecting to Portal...</Text>
              <Text style={{ marginTop: 8, color: colors.textDim, fontFamily: 'Inter_500Medium', fontSize: 13 }}>Please wait</Text>
            </View>
          )}

          {(step === 'captcha' || step === 'verifying') && (
             <View style={{ width: '100%' }}>
               <View style={{ alignItems: 'center', marginBottom: 20 }}>
                 <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary + '15', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
                   <Ionicons name="shield-checkmark" color={colors.primary} size={30} />
                 </View>
                 <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20, color: colors.text, textAlign: 'center', marginBottom: 8 }}>Security Check</Text>
                 <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: colors.textDim, textAlign: 'center', paddingHorizontal: 10 }}>
                   Enter the characters shown in the image below to reconnect.
                 </Text>
               </View>

               {errorMsg ? (
                 <View style={{ backgroundColor: '#ef444420', padding: 10, borderRadius: 8, marginBottom: 16 }}>
                   <Text style={{ color: '#ef4444', fontFamily: 'Inter_500Medium', fontSize: 13, textAlign: 'center' }}>{errorMsg}</Text>
                 </View>
               ) : null}

               {captchaBase64 ? (
                 <View style={{ alignItems: 'center', marginBottom: 20 }}>
                   <Image source={{ uri: captchaBase64 }} style={{ width: 160, height: 60, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border }} resizeMode="contain" />
                 </View>
               ) : (
                 <View style={{ alignItems: 'center', marginBottom: 20, height: 60, justifyContent: 'center' }}>
                   <ActivityIndicator size="small" color={colors.primary} />
                 </View>
               )}

               <TextInput
                 style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 16, textAlign: 'center', marginBottom: 20 }}
                 placeholder="Enter Captcha"
                 placeholderTextColor={colors.textDim}
                 value={captchaInput}
                 onChangeText={setCaptchaInput}
                 autoCapitalize="none"
                 autoCorrect={false}
                 editable={step === 'captcha'}
                 onSubmitEditing={submitCaptcha}
               />

               <TouchableOpacity 
                 style={{ paddingVertical: 14, backgroundColor: step === 'captcha' ? colors.primary : colors.primary + '80', borderRadius: 100, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8 }}
                 activeOpacity={0.8}
                 onPress={submitCaptcha}
                 disabled={step !== 'captcha' || !captchaInput.trim()}
               >
                 {step === 'verifying' ? <ActivityIndicator size="small" color="#fff" /> : null}
                 <Text style={{ color: '#fff', fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>
                   {step === 'verifying' ? 'Verifying...' : 'Reconnect Now'}
                 </Text>
               </TouchableOpacity>

               <TouchableOpacity style={{ marginTop: 16, alignItems: 'center' }} onPress={onLeave}>
                 <Text style={{ color: colors.textDim, fontFamily: 'Inter_500Medium', fontSize: 14 }}>Cancel</Text>
               </TouchableOpacity>
             </View>
          )}
          
        </View>
      </View>

      {/* Hidden WebView for background login */}
      <View style={{ width: 0, height: 0, opacity: 0 }}>
        {loginUrl !== 'about:blank' && (
          <WebView
            ref={webViewRef}
            source={{ uri: loginUrl }}
            injectedJavaScript={injectedJs}
            onMessage={handleMessage}
            onNavigationStateChange={handleNavigationStateChange}
            onLoadEnd={handleLoadEnd}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            sharedCookiesEnabled={true}
            thirdPartyCookiesEnabled={true}
          />
        )}
      </View>
    </Modal>
  );
};

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
  }
});
