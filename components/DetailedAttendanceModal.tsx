import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../store/useThemeStore';
import { useStudyOSStore } from '../store/studyosStore';
import { Spacing, Radius } from '../constants/theme';
import * as SecureStore from 'expo-secure-store';

interface Props {
  visible: boolean;
  onClose: () => void;
  subjectCode: string;
  subjectName: string;
  viewActionTarget: string | undefined;
}

const ATTENDANCE_URL = 'https://student.culko.in/frmStudentCourseWiseAttendanceSummary.aspx?type=etgkYfqBdH1fSfc255iYGw==';

export function DetailedAttendanceModal({ visible, onClose, subjectCode, subjectName, viewActionTarget }: Props) {
  const colors = useThemeStore((s) => s.colors);
  const webViewRef = useRef<WebView>(null);
  const [cookieInjectScript, setCookieInjectScript] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const detailedCache = useStudyOSStore((s) => s.detailedAttendanceCache);
  const setScrapedData = useStudyOSStore((s) => s.setScrapedData);
  const hasInjectedPostback = useRef(false);

  useEffect(() => {
    if (visible) {
      if (detailedCache && detailedCache[subjectCode]) {
         setAttendanceData(detailedCache[subjectCode]);
         setLoading(false);
         setErrorMsg('');
         return; // already cached!
      }
      
      setLoading(true);
      setErrorMsg('');
      setAttendanceData([]);
      hasInjectedPostback.current = false;
      setDebugLogs([]);
      
      SecureStore.getItemAsync('culko_cookies').then((cookies) => {
        if (cookies) {
          const parts = cookies.split(';').map((c: string) => c.trim()).filter(Boolean);
          const lines = parts.map((c: string) => `document.cookie = ${JSON.stringify(c + '; path=/')};`).join('\n');
          setCookieInjectScript(lines + '\ntrue;');
        } else {
          setCookieInjectScript('true;');
        }
      });
    }
  }, [visible, subjectCode]);

  const INJECT_SCRIPT = `
    try {
      var isDetailedPage = document.body.innerText.includes('Marked By') || document.body.innerText.includes('Time') || (document.querySelectorAll('table tr')[0] && document.querySelectorAll('table tr')[0].innerText.includes('Time'));
      
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG', message: 'isDetailedPage: ' + isDetailedPage }));

      if (!isDetailedPage) {
        var cleanCode = '${subjectCode}'.replace(/^[A-Z]+_/, '').trim().toUpperCase();
        var buttons = document.querySelectorAll('input[type="button"], input[type="submit"], button, a');
        var clicked = false;
        
        // 1. Try to find button by 'obj' attribute matching code exactly
        for (var i=0; i<buttons.length; i++) {
           var obj = buttons[i].getAttribute('obj');
           if (obj && obj.toUpperCase().includes(cleanCode)) {
              buttons[i].click();
              clicked = true;
              break;
           }
        }
        
        // 2. Try by row text
        if (!clicked) {
           var rows = document.querySelectorAll('tr');
           for (var r=0; r<rows.length; r++) {
              if (rows[r].innerText.toUpperCase().includes(cleanCode)) {
                 var viewBtn = rows[r].querySelector('input[value="View"], input[value="VIEW"], input[type="button"], a');
                 if (viewBtn) {
                    viewBtn.click();
                    clicked = true;
                    break;
                 }
              }
           }
        }
        
        if (clicked) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG', message: 'Button clicked for ' + cleanCode }));
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'POSTBACK_SENT' }));
          
          var checkCount = 0;
          var interval = setInterval(function() {
             var isDetailedNow = document.body.innerText.includes('Marked By') || document.body.innerText.includes('Time') || (document.querySelectorAll('table tr')[0] && document.querySelectorAll('table tr')[0].innerText.includes('Time'));
             if (isDetailedNow) {
                clearInterval(interval);
                extractData();
             }
             checkCount++;
             if (checkCount > 15) {
                clearInterval(interval);
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: 'Timeout waiting for detailed attendance to load' }));
             }
          }, 500);
        } else {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: 'Button not found for: ' + cleanCode }));
        }
      } else {
        extractData();
      }

      function extractData() {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG', message: 'Extracting table rows' }));
        
        var tables = document.querySelectorAll('table');
        var detailTable = null;
        for (var t=0; t<tables.length; t++) {
           if (tables[t].innerText.includes('Marked By') || tables[t].innerText.includes('Time')) {
              detailTable = tables[t];
           }
        }
        
        if (!detailTable) detailTable = tables[tables.length - 1]; // fallback to last table
        
        var rows = detailTable.querySelectorAll('tr');
        var results = [];
        for (var i = 1; i < rows.length; i++) {
          var cells = rows[i].querySelectorAll('td');
          if (cells.length >= 6) { // detail table has fewer columns than summary
            var date = cells[1] ? cells[1].innerText.trim() : '';
            if (date.toUpperCase() === 'TITLE' || date.toUpperCase() === 'COURSE CODE' || !date) continue; // skip header or summary table junk
            
            results.push({
              date: date,
              type: cells[2] ? cells[2].innerText.trim() : '',
              time: cells[3] ? cells[3].innerText.trim() : '',
              status: cells[4] ? cells[4].innerText.trim() : '',
              markedBy: cells[7] ? cells[7].innerText.trim() : (cells[5] ? cells[5].innerText.trim() : '')
            });
          }
        }
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SUCCESS', data: results }));
      }
    } catch(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: e.message }));
    }
    true;
  `;

  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const handleMessage = (event: any) => {
    try {
      const parsed = JSON.parse(event.nativeEvent.data);
      if (parsed.type === 'SUCCESS') {
        setAttendanceData(parsed.data);
        setScrapedData({ detailedAttendanceCache: { ...detailedCache, [subjectCode]: parsed.data } });
        setLoading(false);
      } else if (parsed.type === 'ERROR') {
        setErrorMsg(parsed.message);
        setLoading(false);
      } else if (parsed.type === 'POSTBACK_SENT') {
        hasInjectedPostback.current = true;
      } else if (parsed.type === 'DEBUG') {
        setDebugLogs(prev => [...prev, parsed.message]);
      }
    } catch(e) {}
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={[styles.title, { color: colors.text }]}>Detailed Attendance</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subjectCode} • {subjectName}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.surfaceHigh }]}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>
              {hasInjectedPostback.current ? 'Extracting records...' : 'Fetching details from CUIMS...'}
            </Text>
          </View>
        ) : errorMsg ? (
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Ionicons name="alert-circle-outline" size={48} color="#ef4444" style={{ alignSelf: 'center' }} />
            <Text style={[styles.errorText, { color: colors.text, marginTop: 10, textAlign: 'left', fontSize: 12 }]}>{errorMsg}</Text>
          </ScrollView>
        ) : attendanceData.length === 0 ? (
          <View style={styles.centerContent}>
            <Ionicons name="document-text-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.errorText, { color: colors.textMuted }]}>No records found</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {attendanceData.map((item, index) => {
              const isPresent = item.status.toLowerCase() === 'present';
              const isLeave = item.status.toLowerCase().includes('leave');
              const color = isPresent ? '#22c55e' : isLeave ? '#f59e0b' : '#ef4444';
              return (
                <View key={index} style={[styles.card, { backgroundColor: colors.surface }]}>
                   <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                     <Text style={[styles.date, { color: colors.text }]}>{item.date}</Text>
                     <View style={[styles.badge, { backgroundColor: color + '20' }]}>
                       <Text style={[styles.badgeText, { color }]}>{item.status}</Text>
                     </View>
                   </View>
                   <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                     <Text style={[styles.meta, { color: colors.textMuted }]}>{item.type} • {item.time}</Text>
                   </View>
                   {item.markedBy ? (
                     <Text style={[styles.markedBy, { color: colors.textDim }]}>Marked By: {item.markedBy}</Text>
                   ) : null}
                </View>
              );
            })}
          </ScrollView>
        )}

        {visible && !!cookieInjectScript && !detailedCache[subjectCode] && (
          <View style={{ width: 1, height: 1, opacity: 0, position: 'absolute', left: -1000 }}>
            <WebView
              ref={webViewRef}
              source={{ uri: ATTENDANCE_URL }}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              sharedCookiesEnabled={true}
              thirdPartyCookiesEnabled={true}
              onNavigationStateChange={(navState) => {
                if (!navState.loading) {
                  setTimeout(() => {
                    if (webViewRef.current) {
                      webViewRef.current.injectJavaScript(cookieInjectScript);
                      setTimeout(() => {
                        if (webViewRef.current) {
                          webViewRef.current.injectJavaScript(INJECT_SCRIPT);
                        }
                      }, 1000);
                    }
                  }, 2000);
                }
              }}
              onMessage={handleMessage}
            />
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.xl,
    paddingTop: 60,
    borderBottomWidth: 1,
  },
  title: { fontSize: 20, fontFamily: 'SpaceGrotesk_700Bold' },
  subtitle: { fontSize: 13, marginTop: 4, fontFamily: 'Inter_500Medium' },
  closeBtn: { padding: 8, borderRadius: 20 },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 16, fontSize: 14, fontFamily: 'Inter_500Medium' },
  errorText: { marginTop: 16, fontSize: 16, fontFamily: 'SpaceGrotesk_600SemiBold' },
  
  card: {
    padding: 16,
    borderRadius: Radius.lg,
    marginBottom: 12,
  },
  date: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 12, fontFamily: 'SpaceGrotesk_700Bold', textTransform: 'uppercase' },
  meta: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  markedBy: { fontSize: 11, marginTop: 8, fontStyle: 'italic' }
});
