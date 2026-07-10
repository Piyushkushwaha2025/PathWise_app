import React, { useState, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing } from '../../../constants/theme';
import { fetchMoodleSessionCookie } from '../../../lib/cuAuth';
import { extractMoodleUserDetails } from '../../../lib/moodleSession';
import { useCuSessionStore } from '../../../store/cuSessionStore';

const CU_LOGIN_URL = 'https://student.culko.in/Login.aspx';

export default function WebViewLoginScreen() {
  const router = useRouter();
  const webViewRef = useRef<WebView>(null);
  const { setSession } = useCuSessionStore();
  
  const [loadingMsg, setLoadingMsg] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Script to inject when we land on StudentHome.aspx to auto-trigger the LMS SSO
  const triggerLmsSsoScript = `
    (function() {
      if (document.forms.length > 0) {
        var theForm = document.forms[0];
        if (!theForm.__EVENTTARGET) {
            var input = document.createElement('input');
            input.type = 'hidden';
            input.name = '__EVENTTARGET';
            input.id = '__EVENTTARGET';
            theForm.appendChild(input);
        }
        theForm.__EVENTTARGET.value = 'ctl00$lbtnLMSSSO';
        theForm.submit();
      }
    })();
    true;
  `;

  const [isOnLms, setIsOnLms] = useState(false);
  const [manualSession, setManualSession] = useState<{sesskey: string, userId: string} | null>(null);

  const handleNavigationStateChange = async (navState: WebViewNavigation) => {
    const { url } = navState;

    // Trigger SSO when landing on StudentHome
    if (url.toLowerCase().includes('studenthome.aspx') && !isProcessing) {
      setLoadingMsg('Authenticating securely...');
      webViewRef.current?.injectJavaScript(triggerLmsSsoScript);
    }

    if (url.toLowerCase().includes('lms.culko.in')) {
      if (!isOnLms) setIsOnLms(true);
      
      if (!isProcessing) {
        const checkScript = `
          (function() {
            var checkInterval = setInterval(function() {
              try {
                var html = document.documentElement.innerHTML;
                
                // Aggressive sesskey extraction
                var sesskeyMatch = html.match(/sesskey=([a-zA-Z0-9]+)/) || html.match(/"sesskey":"([a-zA-Z0-9]+)"/) || html.match(/name="sesskey" value="([a-zA-Z0-9]+)"/);
                var sesskey = sesskeyMatch ? sesskeyMatch[1] : (window.M && window.M.cfg ? window.M.cfg.sesskey : null);
                
                // Aggressive userId extraction
                var userIdMatch = html.match(/\\/user\\/profile\\.php\\?id=([0-9]+)/) || html.match(/\\/user\\/preferences\\.php\\?userid=([0-9]+)/) || html.match(/"userid":([0-9]+)/) || html.match(/data-userid="([0-9]+)"/);
                var userId = userIdMatch ? userIdMatch[1] : (window.M && window.M.cfg ? window.M.cfg.userid : null);

                if (sesskey && userId) {
                  clearInterval(checkInterval);
                  window.ReactNativeWebView.postMessage(JSON.stringify({ 
                    type: 'LMS_DATA_READY', 
                    sesskey: sesskey, 
                    userId: userId 
                  }));
                } else if (sesskey) {
                  // Found sesskey but no userid? We will pass it so manual button works
                   window.ReactNativeWebView.postMessage(JSON.stringify({ 
                    type: 'LMS_PARTIAL_READY', 
                    sesskey: sesskey, 
                    userId: '0' 
                  }));
                }
              } catch (e) {}
            }, 1000);
          })();
          true;
        `;
        webViewRef.current?.injectJavaScript(checkScript);
      }
    } else {
      if (isOnLms) setIsOnLms(false);
    }
  };

  const handleMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'LMS_DATA_READY') {
        setIsProcessing(true);
        setLoadingMsg('Finalizing setup...');
        await setSession(data.sesskey, parseInt(data.userId, 10));
        router.replace('/(app)/studyos/dashboard');
      } else if (data.type === 'LMS_PARTIAL_READY') {
        setManualSession({ sesskey: data.sesskey, userId: data.userId });
      }
    } catch (e) {
      console.log('Message parse error', e);
    }
  };

  const forceProceed = async () => {
    if (manualSession) {
      setIsProcessing(true);
      setLoadingMsg('Finalizing setup...');
      await setSession(manualSession.sesskey, parseInt(manualSession.userId, 10) || 0);
      router.replace('/(app)/studyos/dashboard');
    } else {
      alert("Still trying to read the portal data. Please click around the LMS menu so we can capture your session.");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <Text style={styles.closeText}>Cancel</Text>
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>CU Portal</Text>
        
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
        ref={webViewRef}
        source={{ uri: CU_LOGIN_URL }}
        style={[styles.webview, isProcessing && styles.hiddenWebview]}
        onNavigationStateChange={handleNavigationStateChange}
        onMessage={handleMessage}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={styles.webviewLoader}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        )}
      />

      {isProcessing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>{loadingMsg}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    paddingTop: 40,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.text,
  },
  closeBtn: {
    padding: Spacing.sm,
  },
  closeText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '500',
  },
  proceedBtn: {
    padding: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: 8,
  },
  proceedText: {
    color: Colors.background,
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
    backgroundColor: Colors.background,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill as any,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.xl,
    zIndex: 10,
  },
  loadingText: {
    ...Typography.h3,
    color: Colors.text,
    marginTop: Spacing.lg,
    textAlign: 'center',
  },
});
