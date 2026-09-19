import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, ScrollView, RefreshControl, TextInput } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../store/useThemeStore';
import { useStudyOSStore } from '../store/studyosStore';
import { useStudySessionStore } from '../store/studySessionStore';
import { Spacing, Radius } from '../constants/theme';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { useSubscription } from '../hooks/useSubscription';
import { usePaywallStore } from '../store/usePaywallStore';
import { isHolidayOrExam } from '../constants/calendar';
import Slider from '@react-native-community/slider';
import { Svg, Path, Defs, LinearGradient, Stop, Polygon, Circle, G, Text as SvgText } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedStyle, useAnimatedProps, withTiming, withSpring, Easing, withDelay, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { CheckCircle2, XCircle, Stethoscope, Briefcase } from 'lucide-react-native';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);

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
      { scale: withSpring(isDragging.value ? 1.2 : 1) }
    ]
  }));

  return (
    <GestureDetector gesture={composed}>
      <View 
        style={{ height: 16, justifyContent: 'center', paddingHorizontal: 2, marginVertical: 1 }}
        onLayout={(e) => { trackWidth.value = e.nativeEvent.layout.width - 10; }}
      >
        <View style={{ height: 3, backgroundColor: colors.border, borderRadius: 1.5, overflow: 'hidden' }}>
          <Animated.View style={[{ height: '100%', backgroundColor: colors.primary, borderRadius: 1.5 }, fillStyle]} />
        </View>
        <Animated.View style={[{
          position: 'absolute',
          left: 0, 
          width: 10, height: 10,
          borderRadius: 5,
          backgroundColor: '#fff',
          shadowColor: colors.primary, shadowOpacity: 0.8, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
          elevation: 5,
          borderWidth: 1.5,
          borderColor: colors.primary,
        }, thumbStyle]} />
      </View>
    </GestureDetector>
  );
};

const SpeedometerDual = ({ currentPct, attendPct, missPct, colors }: { currentPct: number, attendPct: number, missPct: number | null, colors: any }) => {
  const radius = 50;
  const strokeWidth = 10;
  const arcLength = Math.PI * radius;
  const isSafe = currentPct >= 75;
  const isWarning = currentPct >= 60 && currentPct < 75;
  
  const gradientStart = isSafe ? '#0d9488' : isWarning ? '#f59e0b' : '#ef4444';
  const gradientEnd = isSafe ? '#4ade80' : isWarning ? '#fbbf24' : '#f87171';
  const baseColor = isSafe ? '#22c55e' : isWarning ? '#f59e0b' : '#ef4444';

  const getMarkerTransform = (pct: number) => {
    const angleDeg = -180 + (Math.max(0, Math.min(100, pct)) / 100) * 180;
    const rad = (angleDeg * Math.PI) / 180;
    const x = 60 + Math.cos(rad) * 58;
    const y = 60 + Math.sin(rad) * 58;
    // Bring text closer to the arrow to avoid clipping outside SVG bounds
    const textX = 60 + Math.cos(rad) * 66;
    const textY = 60 + Math.sin(rad) * 66;
    
    // Smart text anchor based on which side of the speedometer the marker is on
    let anchor = "middle";
    if (angleDeg > -80 && angleDeg <= 0) anchor = "start"; // Right half
    else if (angleDeg < -100 && angleDeg >= -180) anchor = "end"; // Left half
    
    return { x, y, textX, textY, rotation: angleDeg + 90, anchor };
  };

  const animatedProgress = useSharedValue(0);
  const needleRot = useSharedValue(-90);
  
  useEffect(() => {
    // Reset to 0 just in case
    animatedProgress.value = 0;
    needleRot.value = -90;
    // Animate smoothly after a longer delay (let the modal slide up first)
    animatedProgress.value = withDelay(600, withTiming(currentPct, { duration: 1500, easing: Easing.out(Easing.cubic) }));
    const target = -90 + (Math.max(0, Math.min(100, currentPct)) / 100) * 180;
    needleRot.value = withDelay(600, withTiming(target, { duration: 1500, easing: Easing.out(Easing.cubic) }));
  }, [currentPct]);
  
  const animatedArcProps = useAnimatedProps(() => {
    const safePct = Math.max(0, Math.min(100, animatedProgress.value));
    return {
      strokeDashoffset: arcLength - (arcLength * safePct) / 100,
    } as any;
  });
  
  const animatedNeedleProps = useAnimatedProps(() => ({
    rotation: needleRot.value,
  } as any));

  const attendMarker = getMarkerTransform(attendPct);
  const missMarker = missPct !== null ? getMarkerTransform(missPct) : null;

  return (
    <View style={{ width: '100%', alignItems: 'center', justifyContent: 'flex-start', overflow: 'visible' }}>
      <View style={{ width: '100%', aspectRatio: 1.6, overflow: 'visible' }}>
        {/* Tighter viewBox so the speedometer draws MUCH larger relative to its container */}
        <Svg viewBox="-12 -5 144 85" width="100%" height="100%" style={{ overflow: 'visible' }}>
          <Defs>
            <LinearGradient id="gradModern" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={isSafe ? "#3b82f6" : gradientStart} stopOpacity="1" />
              <Stop offset="0.5" stopColor={isSafe ? "#06b6d4" : gradientStart} stopOpacity="1" />
              <Stop offset="1" stopColor={isSafe ? "#22c55e" : gradientEnd} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          
          {/* Background Track (Faint, sleek line without dark borders) */}
          <Path d={`M 10 60 A ${radius} ${radius} 0 0 1 110 60`} stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} strokeLinecap="round" fill="none" />
          
          {/* Animated Progress Arc (Glows beautifully without ugly borders underneath) */}
          <AnimatedPath 
            d={`M 10 60 A ${radius} ${radius} 0 0 1 110 60`} 
            stroke="url(#gradModern)" 
            strokeWidth={strokeWidth} 
            strokeLinecap="round" 
            fill="none"
            strokeDasharray={arcLength} 
            animatedProps={animatedArcProps} 
          />

          {/* Tick Marks and Labels */}
          {[0, 20, 40, 60, 80, 100].map((val) => {
            const angleDeg = -180 + (val / 100) * 180;
            const rad = (angleDeg * Math.PI) / 180;
            const tickOut = 44; 
            const tickIn = 39;
            const textR = 25; 
            const x1 = 60 + Math.cos(rad) * tickIn;
            const y1 = 60 + Math.sin(rad) * tickIn;
            const x2 = 60 + Math.cos(rad) * tickOut;
            const y2 = 60 + Math.sin(rad) * tickOut;
            const tx = 60 + Math.cos(rad) * textR;
            const ty = 60 + Math.sin(rad) * textR;
            return (
              <G key={`maj_${val}`}>
                <Path d={`M ${x1} ${y1} L ${x2} ${y2}`} stroke={colors.textMuted} strokeWidth={1.5} opacity={0.6} />
                <SvgText x={tx} y={ty} fill={colors.textMuted} fontSize="9" fontWeight="bold" textAnchor="middle" alignmentBaseline="middle">
                  {val}
                </SvgText>
              </G>
            );
          })}
          
          {/* Minor ticks */}
          {Array.from({length: 21}).map((_, i) => {
            const val = i * 5;
            if (val % 20 === 0) return null;
            const angleDeg = -180 + (val / 100) * 180;
            const rad = (angleDeg * Math.PI) / 180;
            const x1 = 60 + Math.cos(rad) * 42;
            const y1 = 60 + Math.sin(rad) * 42;
            const x2 = 60 + Math.cos(rad) * 44;
            const y2 = 60 + Math.sin(rad) * 44;
            return <Path key={`min_${val}`} d={`M ${x1} ${y1} L ${x2} ${y2}`} stroke={colors.textMuted} strokeWidth={1} opacity={0.3} />;
          })}
          
          {/* Attend Marker */}
          <G x={attendMarker.x} y={attendMarker.y} rotation={attendMarker.rotation} origin="0, 0">
            <Polygon points="-4,-10 4,-10 0,-1" fill="#22c55e" />
          </G>
          <SvgText x={attendMarker.textX} y={attendMarker.textY} fill="#22c55e" fontSize="11" fontWeight="900" textAnchor={attendMarker.anchor as any} alignmentBaseline="middle">
            {attendPct}%
          </SvgText>
          
          {/* Miss Marker */}
          {missMarker && (
            <>
              <G x={missMarker.x} y={missMarker.y} rotation={missMarker.rotation} origin="0, 0">
                <Polygon points="-4,-10 4,-10 0,-1" fill="#ef4444" />
              </G>
              <SvgText x={missMarker.textX} y={missMarker.textY} fill="#ef4444" fontSize="11" fontWeight="900" textAnchor={missMarker.anchor as any} alignmentBaseline="middle">
                {missPct}%
              </SvgText>
            </>
          )}

          {/* Elegant Animated Needle */}
          <AnimatedG origin="60, 60" animatedProps={animatedNeedleProps}>
            <Path d="M 59,60 L 61,60 L 60.5,18 L 59.5,18 Z" fill={isSafe ? "#06b6d4" : baseColor} />
            <Path d="M 59,60 L 61,60 L 60.5,18 L 59.5,18 Z" fill={isSafe ? "#06b6d4" : baseColor} opacity={0.6} stroke={isSafe ? "#06b6d4" : baseColor} strokeWidth={2} />
            <Circle cx="60" cy="60" r="4.5" fill={colors.surface} stroke={isSafe ? "#06b6d4" : baseColor} strokeWidth="2.5" />
          </AnimatedG>
        </Svg>
      </View>
      
      {/* Transparent Text below with Text Glow */}
      <View style={{ marginTop: -15, alignItems: 'center' }}>
        <Text style={{ 
          color: baseColor,
          textShadowColor: baseColor,
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 8
        }}>
          <Text style={{ fontSize: 26, fontFamily: 'SpaceGrotesk_700Bold' }}>{currentPct}</Text>
          <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', opacity: 0.8 }}>%</Text>
        </Text>
        <Text style={{ fontSize: 9, color: colors.textMuted, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5, marginTop: 2 }}>
          ATTENDANCE
        </Text>
      </View>
    </View>
  );
};

const Speedometer = ({ percentage, colors }: { percentage: number, colors: any }) => {
  const radius = 50;
  const strokeWidth = 10;
  const arcLength = Math.PI * radius;
  const dashOffset = arcLength - (arcLength * Math.max(0, Math.min(100, percentage))) / 100;
  
  const animatedOffset = useSharedValue(arcLength);
  const needleRotation = useSharedValue(-180);

  useEffect(() => {
    animatedOffset.value = withDelay(300, withTiming(dashOffset, {
      duration: 1200,
      easing: Easing.out(Easing.cubic),
    }));
    needleRotation.value = withDelay(300, withTiming(-180 + (Math.max(0, Math.min(100, percentage)) / 100) * 180, {
      duration: 1200,
      easing: Easing.out(Easing.cubic),
    }));
  }, [dashOffset, percentage]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: animatedOffset.value,
  }));

  const needleStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: 60 },
      { translateY: 60 },
      { rotate: `${needleRotation.value}deg` },
      { translateX: -60 },
      { translateY: -60 }
    ]
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
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, width: 120, height: 70 }, needleStyle]}>
        <Svg viewBox="0 0 120 70">
          <Polygon points="56,60 64,60 60,18" fill={colors.text} />
          <Circle cx="60" cy="60" r="6" fill={colors.text} />
          <Circle cx="60" cy="60" r="3" fill={colors.background} />
        </Svg>
      </Animated.View>
      <View style={{ position: 'absolute', bottom: -12, alignItems: 'center', backgroundColor: colors.background, paddingHorizontal: 6, borderRadius: 10 }}>
        <Text style={{ fontSize: 18, fontFamily: 'SpaceGrotesk_700Bold', color: colors.text, textShadowColor: startColor + '60', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 }}>{percentage}%</Text>
      </View>
    </View>
  );
};

const MiniStatBox = ({ label, value, colors, color, icon: Icon }: any) => (
  <View style={{ 
      flex: 1,
      marginBottom: 3, 
      backgroundColor: colors.surface,
      paddingVertical: 4,
      paddingHorizontal: 6,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6
  }}>
    <View style={{ backgroundColor: color + '15', padding: 4, borderRadius: 4 }}>
      <Icon size={12} color={color} />
    </View>
    <View>
      <Text style={{ fontSize: 9, color: colors.textMuted, fontFamily: 'Inter_500Medium' }}>{label}</Text>
      <Text style={{ fontSize: 13, color: colors.text, fontFamily: 'SpaceGrotesk_700Bold' }}>{value}</Text>
    </View>
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
  const [missedClassesInput, setMissedClassesInput] = useState('');
  const { setSessionExpired } = useStudySessionStore();
  const router = useRouter();
  const { isSubscriptionRequired } = useSubscription();

  useEffect(() => {
    if (!visible) {
      setIsPredicting(false);
      setPredictDays(3);
    }
  }, [visible]);

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
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Pull-to-refresh: bust cache for this subject and re-fetch from portal
  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Remove only this subject's cache so fresh data is fetched
    const currentCache = useStudyOSStore.getState().detailedAttendanceCache || {};
    const { [subjectCode]: _removed, ...rest } = currentCache;
    await setScrapedData({ detailedAttendanceCache: rest });

    cacheHit.current = false;
    hasInjectedPostback.current = false;
    postbackStarted.current = false;
    navAttempts.current = 0;
    setAttendanceData([]);
    setErrorMsg('');
    setDebugLogs([]);
    setLoading(true);

    // Re-load cookie and trigger webview fetch
    try {
      const cookies = await SecureStore.getItemAsync('culko_cookies');
      if (!cookies) {
        setErrorMsg('Session expired. Please re-login.');
        setLoading(false);
        setIsRefreshing(false);
        return;
      }
      const parts = cookies.split(';').map((c) => c.trim()).filter(Boolean);
      const lines = parts.map((c) => `document.cookie = ${JSON.stringify(c + '; path=/')};`).join('\n');
      setCookieInjectScript(null);
      // Small delay then set new script to trigger webview reload
      setTimeout(() => {
        setCookieInjectScript(lines + '\ntrue;');
        setIsRefreshing(false);
      }, 200);
    } catch (e) {
      setErrorMsg('Failed to refresh. Please try again.');
      setLoading(false);
      setIsRefreshing(false);
    }
  };


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
    const currentPct = currTotal === 0 ? 0 : Math.round((currAttended / currTotal) * 100);
    const attendedAllPct = newTotal === 0 ? 0 : Math.round(((currAttended + count) / newTotal) * 100);
    
    const parsedMissed = parseInt(missedClassesInput, 10) || 0;
    const validMissed = Math.min(Math.max(0, parsedMissed), count);
    const attendedWithMiss = count - validMissed;
    const missedPct = newTotal === 0 ? 0 : Math.round(((currAttended + attendedWithMiss) / newTotal) * 100);
    
    return { count, currentPct, attendedAllPct, missedPct, validMissed };
  };

  const prediction = isPredicting ? calculatePrediction() : null;

  let presentCount = 0;
  let absentCount = 0;
  let dutyLeaveCount = 0;
  let medicalLeaveCount = 0;

  const safeAttendanceData = Array.isArray(attendanceData) ? attendanceData : [];

  safeAttendanceData.forEach(item => {
    const s = String(item?.status || '').toUpperCase().trim();
    if (s === 'P' || s.includes('PRESENT')) presentCount++;
    else if (s === 'A' || s.includes('ABSENT')) absentCount++;
    else if (s === 'DL' || s.includes('DUTY')) dutyLeaveCount++;
    else if (s === 'ML' || s.includes('MEDICAL')) medicalLeaveCount++;
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
          <View style={{ padding: 8, paddingBottom: 16, backgroundColor: colors.surfaceHigh, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              {/* Row: Speedometer + Stat Tiles */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                {/* Speedometer - shows current attendance always via needle */}
                <View style={{ flex: 1.35, alignItems: 'center' }}>
                  <SpeedometerDual
                    currentPct={prediction.currentPct ?? 0}
                    attendPct={prediction.attendedAllPct ?? 0}
                    missPct={parseInt(missedClassesInput, 10) > 0 ? (prediction.missedPct ?? null) : null}
                    colors={colors}
                  />
                </View>

                {/* Stat tiles */}
                <View style={{ flex: 1, paddingLeft: 6 }}>
                  <View style={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
                    <MiniStatBox label="Present" value={presentCount} colors={colors} color="#22c55e" icon={CheckCircle2} />
                    <MiniStatBox label="Absent" value={absentCount} colors={colors} color="#ef4444" icon={XCircle} />
                  </View>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    <MiniStatBox label="Med L." value={medicalLeaveCount} colors={colors} color="#f59e0b" icon={Stethoscope} />
                    <MiniStatBox label="Duty L." value={dutyLeaveCount} colors={colors} color="#3b82f6" icon={Briefcase} />
                  </View>
                </View>
              </View>

              {/* Slider + Quick presets */}
              <View style={{ backgroundColor: colors.surface, borderRadius: 8, padding: 8, borderWidth: 1, borderColor: colors.border, marginTop: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                    <Text style={{ color: colors.primary, fontSize: 16, fontFamily: 'SpaceGrotesk_700Bold' }}>{predictDays}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: 'Inter_500Medium' }}>days</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginLeft: 4 }}>|</Text>
                    <Text style={{ color: colors.text, fontSize: 12, fontFamily: 'Inter_600SemiBold', marginLeft: 4 }}>{prediction.count} classes expected</Text>
                  </View>
                  {/* Miss input */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: 'Inter_500Medium' }}>Miss:</Text>
                    <TextInput
                      value={missedClassesInput}
                      onChangeText={(v) => {
                        const n = parseInt(v, 10);
                        if (v === '') { setMissedClassesInput(''); return; }
                        if (!isNaN(n)) setMissedClassesInput(String(Math.min(n, prediction.count)));
                      }}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                      style={{ width: 44, height: 26, borderRadius: 6, borderWidth: 1, borderColor: parseInt(missedClassesInput, 10) > 0 ? '#ef4444' : colors.border, backgroundColor: colors.background, color: colors.text, fontSize: 13, fontFamily: 'SpaceGrotesk_700Bold', textAlign: 'center', paddingVertical: 0 }}
                      maxLength={2}
                    />
                  </View>
                </View>

                <PremiumSlider min={1} max={30} value={predictDays} onValueChange={(val: number) => handleSetPredictDays(val)} colors={colors} />

                {/* Result row */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {[3, 7, 14, 30].map(d => (
                      <TouchableOpacity key={d} onPress={() => handleSetPredictDays(d)} style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: predictDays === d ? colors.primary : colors.background, borderWidth: 1, borderColor: predictDays === d ? colors.primary : colors.border }}>
                        <Text style={{ color: predictDays === d ? '#fff' : colors.textMuted, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>
                          {d === 7 ? '1W' : d === 14 ? '2W' : d === 30 ? '1M' : `${d}D`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: '#22c55e', fontSize: 14, fontFamily: 'SpaceGrotesk_700Bold' }}>{prediction.attendedAllPct}%</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 10 }}>if attend all</Text>
                    </View>
                    {parseInt(missedClassesInput, 10) > 0 && (
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ color: '#ef4444', fontSize: 14, fontFamily: 'SpaceGrotesk_700Bold' }}>{prediction.missedPct}%</Text>
                        <Text style={{ color: colors.textMuted, fontSize: 10 }}>if miss {prediction.validMissed}</Text>
                      </View>
                    )}
                  </View>
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
                    setLoading(false);
                    setSessionExpired(true);
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
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
          >
            {safeAttendanceData.map((item, index) => {
              const rawStatus = String(item?.status || '').toUpperCase().trim();
                let displayStatus = rawStatus;
                let color = '#ef4444'; // Default absent

                if (rawStatus === 'P' || rawStatus === 'PRESENT') {
                  displayStatus = 'Present';
                  color = '#22c55e';
                } else if (rawStatus === 'A' || rawStatus === 'ABSENT') {
                  displayStatus = 'Absent';
                  color = '#ef4444';
                } else if (rawStatus === 'ML') {
                  displayStatus = 'Medical Leave';
                  color = '#3b82f6';
                } else if (rawStatus === 'DL') {
                  displayStatus = 'Duty Leave';
                  color = '#8b5cf6';
                } else if (rawStatus === 'L' || rawStatus.includes('LEAVE')) {
                  displayStatus = 'Leave';
                  color = '#f59e0b';
                } else if (rawStatus) {
                  color = '#f59e0b';
                }

                return (
                  <View key={index} style={[styles.card, { backgroundColor: colors.surface }]}>
                     <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                       <Text style={[styles.date, { color: colors.text }]}>{item?.date}</Text>
                       <View style={[styles.badge, { backgroundColor: color + '20' }]}>
                         <Text style={[styles.badgeText, { color }]}>{displayStatus}</Text>
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



