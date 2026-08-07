import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../store/useThemeStore';
import { useStudyOSStore } from '../store/studyosStore';
import { Spacing, Radius } from '../constants/theme';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { useSubscription } from '../hooks/useSubscription';
import { usePaywallStore } from '../store/usePaywallStore';
import { isHolidayOrExam } from '../constants/calendar';
import Slider from '@react-native-community/slider';
import { Svg, Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedStyle, useAnimatedProps, withTiming, withSpring, Easing, withDelay, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { CheckCircle2, XCircle, Stethoscope, Briefcase } from 'lucide-react-native';

const AnimatedPath = Animated.createAnimatedComponent(Path);

const PremiumSlider = ({ value, onValueChange, min = 1, max = 30, colors }: any) => {
  const trackWidth = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const progress = useSharedValue((value - min) / (max - min));

  useEffect(() => {
    if (!isDragging.value) {
      progress.value = withTiming((value - min) / (max - min), { duration: 300 });
    }
  }, [value, min, max]);

  const updateValue = (p: number) => {
    const val = Math.round(min + p * (max - min));
    onValueChange(val);
  };

  const pan = Gesture.Pan()
    .onBegin(() => { isDragging.value = true; })
    .onUpdate((e) => {
      if (trackWidth.value === 0) return;
      const p = Math.max(0, Math.min(1, e.x / trackWidth.value));
      progress.value = p;
      runOnJS(updateValue)(p);
    })
    .onFinalize(() => {
      isDragging.value = false;
      const snapVal = Math.round(min + progress.value * (max - min));
      progress.value = withSpring((snapVal - min) / (max - min), { damping: 15 });
      runOnJS(updateValue)((snapVal - min) / (max - min));
    });

  const tap = Gesture.Tap()
    .onEnd((e) => {
      if (trackWidth.value === 0) return;
      const p = Math.max(0, Math.min(1, e.x / trackWidth.value));
      const snapVal = Math.round(min + p * (max - min));
      progress.value = withSpring((snapVal - min) / (max - min), { damping: 15 });
      runOnJS(onValueChange)(snapVal);
    });

  const composed = Gesture.Race(pan, tap);

  const fillStyle = useAnimatedStyle(() => ({
    width: progress.value * trackWidth.value,
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: progress.value * trackWidth.value },
      { scale: withSpring(isDragging.value ? 1.3 : 1) }
    ]
  }));

  return (
    <GestureDetector gesture={composed}>
      <View 
        style={{ height: 40, justifyContent: 'center', paddingHorizontal: 12, marginVertical: 8 }}
        onLayout={(e) => { trackWidth.value = e.nativeEvent.layout.width - 24; }}
      >
        <View style={{ height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' }}>
          <Animated.View style={[{ height: '100%', backgroundColor: colors.primary, borderRadius: 4 }, fillStyle]} />
        </View>
        <Animated.View style={[{
          position: 'absolute',
          left: 0, 
          width: 24, height: 24,
          borderRadius: 12,
          backgroundColor: '#fff',
          shadowColor: colors.primary, shadowOpacity: 0.8, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
          elevation: 5,
          borderWidth: 2,
          borderColor: colors.primary,
        }, thumbStyle]} />
      </View>
    </GestureDetector>
  );
};

const Speedometer = ({ percentage, colors }: { percentage: number, colors: any }) => {
  const radius = 50;
  const strokeWidth = 10;
  const arcLength = Math.PI * radius;
  const dashOffset = arcLength - (arcLength * percentage) / 100;
  
  const animatedOffset = useSharedValue(arcLength);

  useEffect(() => {
    animatedOffset.value = withDelay(300, withTiming(dashOffset, {
      duration: 1200,
      easing: Easing.out(Easing.cubic),
    }));
  }, [dashOffset]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: animatedOffset.value,
  }));

  const isSafe = percentage >= 75;
  const isWarning = percentage >= 60 && percentage < 75;
  
  const startColor = isSafe ? '#22c55e' : isWarning ? '#f59e0b' : '#ef4444';
  const endColor = isSafe ? '#4ade80' : isWarning ? '#fbbf24' : '#f87171';

  return (
    <View style={{ width: 120, height: 70, alignItems: 'center', justifyContent: 'flex-end', overflow: 'visible' }}>
      <Svg viewBox="0 0 120 70" width="100%" height="100%" style={{ overflow: 'visible' }}>
        <Defs>
          <LinearGradient id="grad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={startColor} stopOpacity="1" />
            <Stop offset="1" stopColor={endColor} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Path 
          d={`M 10 60 A ${radius} ${radius} 0 0 1 110 60`}
          stroke={colors.border} 
          strokeWidth={strokeWidth} 
          strokeLinecap="round" 
          fill="none" 
        />
        <AnimatedPath 
          d={`M 10 60 A ${radius} ${radius} 0 0 1 110 60`}
          stroke="url(#grad)" 
          strokeWidth={strokeWidth} 
          strokeLinecap="round" 
          fill="none" 
          strokeDasharray={arcLength}
          animatedProps={animatedProps}
        />
      </Svg>
      <View style={{ position: 'absolute', bottom: -2, alignItems: 'center' }}>
        <Text style={{ fontSize: 24, fontFamily: 'SpaceGrotesk_700Bold', color: colors.text, textShadowColor: startColor + '60', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 }}>{percentage}%</Text>
      </View>
    </View>
  );
};

const MiniStatBox = ({ label, value, colors, color, icon: Icon }: any) => (
  <View style={{ 
      width: '47%', 
      marginBottom: 6, 
      backgroundColor: colors.surface,
      padding: 6,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      elevation: 1,
      shadowColor: color, shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }
  }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2, gap: 4 }}>
      <Icon size={10} color={color} />
      <Text style={{ color: colors.textMuted, fontSize: 10, fontFamily: 'Inter_500Medium' }}>{label}</Text>
    </View>
    <Text style={{ color: color || colors.text, fontSize: 14, fontFamily: 'SpaceGrotesk_700Bold' }}>{value}</Text>
  </View>
);

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
  const [isPredicting, setIsPredicting] = useState(false);
  const [predictDays, setPredictDays] = useState(3);
  const router = useRouter();
  const { isSubscriptionRequired } = useSubscription();

  const handleSetPredictDays = (val: number) => {
    if (val > 3 && isSubscriptionRequired) {
      setPredictDays(3);
      usePaywallStore.getState().showPaywall("Attendance prediction beyond 3 days is a Pro feature. Upgrade to plan your bunks for the entire semester.");
      return;
    }
    setPredictDays(val);
  };
  
  const detailedCache = useStudyOSStore((s) => s.detailedAttendanceCache);
  const setScrapedData = useStudyOSStore((s) => s.setScrapedData);
  const subjects = useStudyOSStore((s) => s.subjects);
  const timetable = useStudyOSStore((s) => s.timetable);
  const hasInjectedPostback = useRef(false);
  const cacheHit = useRef(false);
  const postbackStarted = useRef(false);
  const navAttempts = useRef(0);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) return;

    // Only use cache if it has actual records
    const cachedData = detailedCache?.[subjectCode];
    if (cachedData && Array.isArray(cachedData) && cachedData.length > 0) {
      cacheHit.current = true;
      setAttendanceData(cachedData);
      setLoading(false);
      setErrorMsg('');
      return;
    }
    cacheHit.current = false;

    setLoading(true);
    setErrorMsg('');
    setAttendanceData([]);
    setDebugLogs([]);

    postbackStarted.current = false;
    navAttempts.current = 0;
    setCookieInjectScript(null);

    (async () => {
      try {
        const cookies = await SecureStore.getItemAsync('culko_cookies');
        if (!cookies) {
          setErrorMsg('Session expired. Please re-login.');
          setLoading(false);
          return;
        }
        const parts = cookies.split(';').map((c) => c.trim()).filter(Boolean);
        const lines = parts.map((c) => `document.cookie = ${JSON.stringify(c + '; path=/')};`).join('\n');
        setCookieInjectScript(lines + '\ntrue;');
      } catch (e) {
        setErrorMsg('Failed to load session. Please re-sync.');
        setLoading(false);
      }
    })();
  }, [visible, subjectCode]);

  const buildInjectScript = (subjectCode: string) => `
    try {
      var isDetailedPage = document.body.innerText.includes('Marked By') || document.body.innerText.includes('Time') || (document.querySelectorAll('table tr')[0] && document.querySelectorAll('table tr')[0].innerText.includes('Time'));
      
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG', message: 'isDetailedPage: ' + isDetailedPage }));

      if (!isDetailedPage) {
        var cleanCode = (${JSON.stringify(subjectCode)}).replace(/^[A-Z]+_/, '').trim().toUpperCase();
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
             if (checkCount > 20) {
                clearInterval(interval);
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: 'Timeout waiting for detailed attendance to load' }));
             }
          }, 300);
        } else {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: 'Button not found for: ' + cleanCode }));
        }
      } else {
        extractData();
      }

      function extractData() {
        var tables = document.querySelectorAll('table');
        var detailTable = null;
        for (var t=0; t<tables.length; t++) {
           if (tables[t].innerText.includes('Marked By') || tables[t].innerText.includes('Time')) {
              detailTable = tables[t];
           }
        }
        
        if (!detailTable) detailTable = tables[tables.length - 1]; // fallback to last table
        
        if (!detailTable) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: 'No table found on page' }));
          return;
        }
        
        var rows = detailTable.querySelectorAll('tr');
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG', message: 'Total rows found: ' + rows.length }));
        var results = [];
        for (var i = 1; i < rows.length; i++) {
          var cells = rows[i].querySelectorAll('td');
          if (cells.length >= 4) { // relaxed from 6 to 4
            var date = cells[1] ? cells[1].innerText.trim() : (cells[0] ? cells[0].innerText.trim() : '');
            if (!date || date.toUpperCase() === 'TITLE' || date.toUpperCase() === 'COURSE CODE' || date.toUpperCase() === 'DATE') continue;
            
            results.push({
              date: date,
              type: cells[2] ? cells[2].innerText.trim() : '',
              time: cells[3] ? cells[3].innerText.trim() : '',
              status: cells[4] ? cells[4].innerText.trim() : (cells[2] ? cells[2].innerText.trim() : ''),
              markedBy: cells[7] ? cells[7].innerText.trim() : (cells[5] ? cells[5].innerText.trim() : '')
            });
          }
        }
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG', message: 'Extracted records: ' + results.length }));
        if (results.length === 0) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: 'Table found but no valid rows. Rows total: ' + rows.length }));
        } else {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SUCCESS', data: results }));
        }
      }
    } catch(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: e.message }));
    }
    true;
  `;


  const handleMessage = (event: any) => {
    try {
      const parsed = JSON.parse(event.nativeEvent.data);
      if (parsed.type === 'SUCCESS') {
        setAttendanceData(parsed.data);
        setScrapedData({ detailedAttendanceCache: { ...(detailedCache || {}), [subjectCode]: parsed.data } });
        setLoading(false);
      } else if (parsed.type === 'ERROR') {
        setErrorMsg(parsed.message);
        setLoading(false);
      } else if (parsed.type === 'POSTBACK_SENT') {
        hasInjectedPostback.current = true;
      } else if (parsed.type === 'DEBUG') {
        setDebugLogs((prev: string[]) => [...prev, parsed.message]);
      }
    } catch(e) {}
  };

  const calculatePrediction = () => {
    const safeSubjects = Array.isArray(subjects) ? subjects : [];
    const currentSubject = safeSubjects.find(s => s.code === subjectCode);
    if (!currentSubject) return { count: 0, attendedPct: 0, bunkedPct: 0, currentPct: 0 };
    let count = 0;
    const today = new Date();
    const daysArr = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    for (let i = 1; i <= predictDays; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      
      if (!isHolidayOrExam(d)) {
        const dayStr = daysArr[d.getDay()];
        const daySlots = (timetable || {})[dayStr];
        const safeDaySlots = Array.isArray(daySlots) ? daySlots : [];
        const matchedSlots = safeDaySlots.filter((slot: any) => 
           String(slot?.subjectName || '').includes(subjectCode) || String(slot?.subjectName || '').includes(subjectName)
        );
        count += matchedSlots.length;
      }
    }
    
    const currTotal = currentSubject.totalClasses || 0;
    const currAttended = currentSubject.attendedClasses || 0;
    
    const newTotal = currTotal + count;
    const attendedPct = newTotal === 0 ? 0 : Math.round(((currAttended + count) / newTotal) * 100);
    const bunkedPct = newTotal === 0 ? 0 : Math.round((currAttended / newTotal) * 100);
    const currentPct = currTotal === 0 ? 0 : Math.round((currAttended / currTotal) * 100);
    
    return { count, attendedPct, currentPct };
  };

  const prediction = isPredicting ? calculatePrediction() : null;

  let presentCount = 0;
  let absentCount = 0;
  let dutyLeaveCount = 0;
  let medicalLeaveCount = 0;

  const safeAttendanceData = Array.isArray(attendanceData) ? attendanceData : [];

  safeAttendanceData.forEach(item => {
    const s = String(item?.status || '').toLowerCase();
    if (s.includes('present')) presentCount++;
    else if (s.includes('absent')) absentCount++;
    else if (s.includes('duty') || s === 'dl') dutyLeaveCount++;
    else if (s.includes('medical') || s === 'ml') medicalLeaveCount++;
  });
  
  const safeSubjects2 = Array.isArray(subjects) ? subjects : [];
  const currentSubject = safeSubjects2.find(s => s.code === subjectCode);
  const totalClasses = currentSubject?.totalClasses || 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={[styles.title, { color: colors.text }]}>Detailed Attendance</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subjectCode} • {subjectName}</Text>
          </View>
          <TouchableOpacity onPress={() => setIsPredicting(!isPredicting)} style={[styles.closeBtn, { backgroundColor: isPredicting ? colors.primary + '20' : colors.surfaceHigh, marginRight: 8 }]}>
            <Ionicons name="analytics" size={24} color={isPredicting ? colors.primary : colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.surfaceHigh }]}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        {isPredicting && prediction && (
          <View style={{ padding: 16, backgroundColor: colors.surfaceHigh, borderBottomWidth: 1, borderBottomColor: colors.border }}>
             
             <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
               <View style={{ alignItems: 'center', width: 120 }}>
                 <Speedometer percentage={prediction.attendedPct} colors={colors} />
               </View>

               <View style={{ flex: 1, paddingLeft: 12 }}>
                 <View style={{ marginBottom: 8 }}>
                   <Text style={{ color: colors.textMuted, fontSize: 10, fontFamily: 'Inter_500Medium', marginBottom: 2 }}>Total Classes</Text>
                   <Text style={{ color: colors.text, fontSize: 20, fontFamily: 'SpaceGrotesk_700Bold' }}>{totalClasses}</Text>
                 </View>
                 
                 <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                    <MiniStatBox label="Present" value={presentCount} colors={colors} color="#22c55e" icon={CheckCircle2} />
                    <MiniStatBox label="Absent" value={absentCount} colors={colors} color="#ef4444" icon={XCircle} />
                    <MiniStatBox label="Duty L." value={dutyLeaveCount} colors={colors} color="#3b82f6" icon={Briefcase} />
                    <MiniStatBox label="Med L." value={medicalLeaveCount} colors={colors} color="#f59e0b" icon={Stethoscope} />
                 </View>
               </View>
             </View>
             
             <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border, marginTop: 8 }}>
               <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
                 <View>
                   <Text style={{ color: colors.textMuted, fontSize: 10, fontFamily: 'Inter_500Medium', marginBottom: 2 }}>Target Days</Text>
                   <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                     <Text style={{ color: colors.primary, fontSize: 24, fontFamily: 'SpaceGrotesk_700Bold' }}>{predictDays}</Text>
                     <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: 'Inter_500Medium' }}>days</Text>
                   </View>
                 </View>
                 <View style={{ alignItems: 'flex-end' }}>
                   <Text style={{ color: colors.textMuted, fontSize: 10, fontFamily: 'Inter_500Medium', marginBottom: 2 }}>Expected Classes</Text>
                   <Text style={{ color: colors.text, fontSize: 18, fontFamily: 'SpaceGrotesk_700Bold' }}>{prediction.count}</Text>
                 </View>
               </View>
               
               <PremiumSlider
                 min={1}
                 max={30}
                 value={predictDays}
                 onValueChange={(val: number) => handleSetPredictDays(val)}
                 colors={colors}
               />
               
               <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
                 {[3, 7, 14, 30].map(d => (
                   <TouchableOpacity 
                     key={d} 
                     onPress={() => handleSetPredictDays(d)}
                     style={{ 
                       paddingVertical: 6, 
                       paddingHorizontal: 16, 
                       borderRadius: 20, 
                       backgroundColor: predictDays === d ? colors.primary : colors.background,
                       borderWidth: 1,
                       borderColor: predictDays === d ? colors.primary : colors.border
                     }}>
                     <Text style={{ color: predictDays === d ? '#fff' : colors.textMuted, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>
                       {d === 7 ? '1W' : d === 14 ? '2W' : d === 30 ? '1M' : `${d}D`}
                     </Text>
                   </TouchableOpacity>
                 ))}
               </View>
             </View>
          </View>
        )}

        {visible && !cacheHit.current && cookieInjectScript !== null && (
          <View style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }}>
            <WebView
              ref={webViewRef}
              source={{ uri: ATTENDANCE_URL }}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              sharedCookiesEnabled={true}
              thirdPartyCookiesEnabled={true}
              onNavigationStateChange={(navState: any) => {
                console.log('[DetailModal] Nav:', navState.url, 'loading:', navState.loading);
                if (cacheHit.current) return;
                if (!navState.loading) {
                  if (
                    navState.url.includes('Login') ||
                    navState.url.includes('login') ||
                    navState.url.includes('Default.aspx')
                  ) {
                    console.log('[DetailModal] Session expired — redirected to login');
                    setErrorMsg('Session expired. Please re-login.');
                    setLoading(false);
                    return;
                  }
                  // First real load: inject cookies, then scrape script
                  if (navAttempts.current === 0) {
                    navAttempts.current = 1;
                    setTimeout(() => {
                      if (!cacheHit.current) {
                        webViewRef.current?.injectJavaScript(cookieInjectScript);
                        setTimeout(() => {
                          webViewRef.current?.injectJavaScript(buildInjectScript(subjectCode));
                        }, 600);
                      }
                    }, 800);
                  }
                }
              }}
              onError={(e: any) => {
                console.log('[DetailModal] Error:', e.nativeEvent.description);
                if (!cacheHit.current) {
                  setErrorMsg('Failed to load attendance page. Please re-sync.');
                  setLoading(false);
                }
              }}
              onHttpError={(e: any) => {
                console.log('[DetailModal] HTTP Error:', e.nativeEvent.statusCode);
              }}
              onMessage={handleMessage}
            />
          </View>
        )}

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
            {debugLogs.length > 0 && (
              <View style={{ marginTop: 12, backgroundColor: colors.surfaceHigh, borderRadius: 8, padding: 10 }}>
                <Text style={{ color: colors.textMuted, fontSize: 10, fontFamily: 'Inter_500Medium' }}>Debug Info:</Text>
                {debugLogs.map((log, i) => (
                  <Text key={i} style={{ color: colors.textDim, fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 2 }}>• {log}</Text>
                ))}
              </View>
            )}
          </ScrollView>
        ) : (!safeAttendanceData || safeAttendanceData.length === 0) ? (
          <View style={styles.centerContent}>
            <Ionicons name="document-text-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.errorText, { color: colors.textMuted }]}>No records found</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {safeAttendanceData.map((item, index) => {
              const isPresent = String(item?.status || '').toLowerCase() === 'present';
              const isLeave = String(item?.status || '').toLowerCase().includes('leave');
              const color = isPresent ? '#22c55e' : isLeave ? '#f59e0b' : '#ef4444';
              return (
                <View key={index} style={[styles.card, { backgroundColor: colors.surface }]}>
                   <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                     <Text style={[styles.date, { color: colors.text }]}>{item?.date}</Text>
                     <View style={[styles.badge, { backgroundColor: color + '20' }]}>
                       <Text style={[styles.badgeText, { color }]}>{item?.status}</Text>
                     </View>
                   </View>
                   <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                     <Text style={[styles.meta, { color: colors.textMuted }]}>{item?.type} • {item?.time}</Text>
                   </View>
                   {item?.markedBy ? (
                     <Text style={[styles.markedBy, { color: colors.textDim }]}>Marked By: {item.markedBy}</Text>
                   ) : null}
                </View>
              );
            })}
          </ScrollView>
        )}


      </View>
      </GestureHandlerRootView>
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
