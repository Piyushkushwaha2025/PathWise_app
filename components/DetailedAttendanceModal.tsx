import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, ScrollView, RefreshControl, TextInput, BackHandler, InteractionManager, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../store/useThemeStore';
import { useStudyOSStore } from '../store/studyosStore';
import { useStudySessionStore } from '../store/studySessionStore';
import { Spacing, Radius } from '../constants/theme';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useSubscription } from '../hooks/useSubscription';
import { usePaywallStore } from '../store/usePaywallStore';
import { isHolidayOrExam } from '../constants/calendar';
import Slider from '@react-native-community/slider';
import { Svg, Path, Defs, LinearGradient as SvgLinearGradient, Stop, Polygon, Circle, G, Text as SvgText } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, useAnimatedProps, withTiming, withSpring, Easing, withDelay, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Calendar } from 'react-native-calendars';
import { CheckCircle2, XCircle, Stethoscope, Briefcase, Clock, Calendar as CalendarIcon, User, Sparkles, BookOpen, FlaskConical } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { AttendanceRingWidget } from './AttendanceRingWidget';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);

const PremiumSlider = ({ value, onValueChange, min = 1, max = 30, colors, dots = 0 }: any) => {
  const range = Math.max(0.0001, max - min);
  const trackWidth = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const progress = useSharedValue((value - min) / range);

  useEffect(() => {
    if (!isDragging.value) {
      progress.value = withTiming((value - min) / range, { duration: 300 });
    }
  }, [value, min, max]);

  const updateValue = (p: number) => {
    const val = Math.round(min + p * range);
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
      const snapVal = Math.round(min + progress.value * range);
      progress.value = withSpring((snapVal - min) / range, { damping: 15 });
      runOnJS(updateValue)((snapVal - min) / range);
    });

  const tap = Gesture.Tap()
    .onEnd((e) => {
      if (trackWidth.value === 0) return;
      const p = Math.max(0, Math.min(1, e.x / trackWidth.value));
      const snapVal = Math.round(min + p * range);
      progress.value = withSpring((snapVal - min) / range, { damping: 15 });
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
        style={{ height: 24, justifyContent: 'center', paddingHorizontal: 2, marginVertical: 1 }}
        onLayout={(e) => { trackWidth.value = e.nativeEvent.layout.width - 10; }}
      >
        <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'visible' }}>
          <Animated.View style={[{ height: '100%', backgroundColor: colors.primary, borderRadius: 2 }, fillStyle]} />
          
          {dots > 0 && Array.from({length: dots}).map((_, i) => {
             const leftPct = (i / Math.max(1, (dots - 1))) * 100;
             return (
               <View key={i} style={{ position: 'absolute', left: `${leftPct}%`, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary, top: -1, marginLeft: -3 }} />
             )
          })}
        </View>
        <Animated.View style={[{
          position: 'absolute',
          left: 0, 
          width: 16, height: 16,
          borderRadius: 8,
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
            <SvgLinearGradient id="gradModern" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={isSafe ? "#3b82f6" : gradientStart} stopOpacity="1" />
              <Stop offset="0.5" stopColor={isSafe ? "#06b6d4" : gradientStart} stopOpacity="1" />
              <Stop offset="1" stopColor={isSafe ? "#22c55e" : gradientEnd} stopOpacity="1" />
            </SvgLinearGradient>
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
          <SvgLinearGradient id="grad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={startColor} stopOpacity="1" />
            <Stop offset="1" stopColor={endColor} stopOpacity="1" />
          </SvgLinearGradient>
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
  <View
    style={{
      flex: 1,
      backgroundColor: colors.surface,
      paddingVertical: 7,
      paddingHorizontal: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      position: 'relative',
      overflow: 'hidden',
    }}
  >
    {/* Left Icon with tinted container */}
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        backgroundColor: color + '15',
        borderWidth: 1,
        borderColor: color + '30',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon size={14} color={color} />
    </View>

    {/* Label & Value */}
    <View style={{ flex: 1 }}>
      <Text
        style={{
          fontSize: 9.5,
          color: colors.textMuted,
          fontFamily: 'Inter_600SemiBold',
          textTransform: 'uppercase',
          letterSpacing: 0.2,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: 16,
          color: colors.text,
          fontFamily: 'SpaceGrotesk_700Bold',
          lineHeight: 19,
        }}
      >
        {value}
      </Text>
    </View>

    {/* Subtle indicator dot */}
    <View
      style={{
        position: 'absolute',
        top: 5,
        right: 5,
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: color,
        opacity: 0.8,
      }}
    />
  </View>
);

const parseTimeBounds = (timeStr: string) => {
  if (!timeStr) return { start: 0, end: 0 };
  try {
    const parts = timeStr.split('-');
    const parseSingle = (part: string) => {
      if (!part) return 0;
      const originalPart = part.trim();
      const cleanPart = originalPart.replace(/AM|PM/gi, '').trim();
      let [hoursStr, minutesStr] = cleanPart.split(':');
      let hours = parseInt((hoursStr || '').replace(/\D/g, ''), 10) || 0;
      let minutes = parseInt((minutesStr || '').replace(/\D/g, ''), 10) || 0;
      
      const isExplicitPM = /PM/i.test(originalPart);
      const isExplicitAM = /AM/i.test(originalPart);
      
      if (isExplicitPM && hours < 12) {
        hours += 12;
      } else if (!isExplicitAM && !isExplicitPM && hours >= 1 && hours <= 7) {
        hours += 12;
      }
      return hours * 60 + minutes;
    };
    const start = parseSingle(parts[0]);
    let end = parts[1] ? parseSingle(parts[1]) : start + 50;
    if (end < start && end !== 0) end += 12 * 60;
    return { start: isNaN(start) ? 0 : start, end: isNaN(end) ? 0 : end };
  } catch (e) {
    return { start: 0, end: 0 };
  }
};

const getSlotClassType = (slot: any): 'Practical' | 'Lecture' => {
  if (!slot) return 'Lecture';
  if (slot.type) {
    const t = String(slot.type).toLowerCase();
    if (t.includes('prac') || t.includes('lab') || t === 'p') return 'Practical';
    if (t.includes('lec') || t.includes('theory') || t === 'l') return 'Lecture';
  }
  const rawName = String(slot.subjectName || '');
  if (/\b(lab|practical|practicle)\b/i.test(rawName) || rawName.includes('(Lab)')) {
    return 'Practical';
  }
  const codeWord = rawName.split(' ')[0] || '';
  if (/[A-Z0-9]+P-\d+/i.test(codeWord)) {
    return 'Practical';
  }
  if (slot.time) {
    const bounds = parseTimeBounds(slot.time);
    if ((bounds.end - bounds.start) >= 60) {
      return 'Practical';
    }
  }
  return 'Lecture';
};

function formatMarkedBy(raw: string): { teacher: string; uid: string; markedDate: string } {
  if (!raw) return { teacher: '', uid: '', markedDate: '' };
  const onDatedSplit = raw.split(/on dated:/i);
  const teacherPart = onDatedSplit[0] || '';
  const datePart = onDatedSplit[1] || '';

  const teacherSplit = teacherPart.split('::');
  const teacher = (teacherSplit[0] || '').trim();
  const uid = (teacherSplit[1] || '').trim();
  const markedDate = datePart.trim();

  return { teacher, uid, markedDate };
}

function calculateBunkMargin(attended: number, total: number, targetPct = 75): {
  type: 'safe' | 'shortage' | 'exact';
  count: number;
  text: string;
} {
  if (total === 0) return { type: 'exact', count: 0, text: 'No classes held yet' };
  const currentPct = (attended / total) * 100;

  if (currentPct >= targetPct) {
    const safeBunks = Math.floor((attended / (targetPct / 100)) - total);
    return {
      type: 'safe',
      count: Math.max(0, safeBunks),
      text: safeBunks > 0 ? `Can bunk next ${safeBunks} class${safeBunks > 1 ? 'es' : ''} safely` : 'On track for 75% attendance',
    };
  } else {
    const needed = Math.ceil((targetPct * total - 100 * attended) / (100 - targetPct));
    return {
      type: 'shortage',
      count: Math.max(1, needed),
      text: `Attend next ${needed} class${needed > 1 ? 'es' : ''} to reach ${targetPct}%`,
    };
  }
}

interface Props {
  visible: boolean;
  onClose: () => void;
  subjectCode: string;
  subjectName: string;
  viewActionTarget: string | undefined;
  asModal?: boolean;
  initialPredicting?: boolean;
}

const ATTENDANCE_URL = 'https://student.culko.in/frmStudentCourseWiseAttendanceSummary.aspx?type=etgkYfqBdH1fSfc255iYGw==';

export function DetailedAttendanceModal({
  visible,
  onClose,
  subjectCode,
  subjectName,
  viewActionTarget,
  asModal = true,
  initialPredicting = false,
}: Props) {
  const colors = useThemeStore((s) => s.colors);
  const webViewRef = useRef<WebView>(null);
  const [cookieInjectScript, setCookieInjectScript] = useState<string | null>(null);
  const [rawCookie, setRawCookie] = useState<string | null>(null);

  const detailedCache = useStudyOSStore((s) => s.detailedAttendanceCache);
  const setScrapedData = useStudyOSStore((s) => s.setScrapedData);
  const subjects = useStudyOSStore((s) => s.subjects);
  const timetable = useStudyOSStore((s) => s.timetable);

  // Synchronous cache lookup helper with multi-tier matching
  const findCachedData = useCallback(() => {
    if (!detailedCache || typeof detailedCache !== 'object') return null;

    // 1. Direct key match on subjectCode
    if (subjectCode && Array.isArray(detailedCache[subjectCode]) && detailedCache[subjectCode].length > 0) {
      return detailedCache[subjectCode];
    }
    // 2. Direct key match on subjectName
    if (subjectName && Array.isArray(detailedCache[subjectName]) && detailedCache[subjectName].length > 0) {
      return detailedCache[subjectName];
    }

    // 3. Clean alphanumeric code match (e.g. 25CST-208 vs 25CST208)
    const cleanCode = (subjectCode || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (cleanCode.length >= 3) {
      for (const key of Object.keys(detailedCache)) {
        const cleanKey = key.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        if (cleanKey && (cleanKey === cleanCode || cleanKey.includes(cleanCode) || cleanCode.includes(cleanKey))) {
          if (Array.isArray(detailedCache[key]) && detailedCache[key].length > 0) return detailedCache[key];
        }
      }
    }

    // 4. Normalized name match (stripping (Theory), (Practical), (Lab), and special chars)
    if (subjectName) {
      const normalize = (str: string) => str.replace(/\([^)]*\)/g, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().trim();
      const cleanSubj = normalize(subjectName);
      if (cleanSubj.length >= 3) {
        for (const key of Object.keys(detailedCache)) {
          const cleanKey = normalize(key);
          if (cleanKey.length >= 3 && (cleanKey === cleanSubj || cleanKey.includes(cleanSubj) || cleanSubj.includes(cleanKey))) {
            if (Array.isArray(detailedCache[key]) && detailedCache[key].length > 0) return detailedCache[key];
          }
        }
      }
    }

    // 5. Cross-reference with subjects store list
    const matchedSubject = (subjects || []).find((s: any) =>
      (subjectCode && s.code === subjectCode) ||
      (subjectName && s.name === subjectName)
    );
    if (matchedSubject) {
      if (matchedSubject.code && Array.isArray(detailedCache[matchedSubject.code]) && detailedCache[matchedSubject.code].length > 0) {
        return detailedCache[matchedSubject.code];
      }
      if (matchedSubject.name && Array.isArray(detailedCache[matchedSubject.name]) && detailedCache[matchedSubject.name].length > 0) {
        return detailedCache[matchedSubject.name];
      }
    }

    return null;
  }, [detailedCache, subjectCode, subjectName, subjects]);

  // Synchronously initialize attendanceData & loading state so cached records appear instantly (0ms)
  const initialCache = findCachedData();
  const [loading, setLoading] = useState<boolean>(!initialCache);
  const [errorMsg, setErrorMsg] = useState('');
  const [attendanceData, setAttendanceData] = useState<any[]>(initialCache || []);
  const [isPredicting, setIsPredicting] = useState(initialPredicting);
  const [predictDays, setPredictDays] = useState(3);
  const [missedClassesInput, setMissedClassesInput] = useState('');
  const [expectedClassFilter, setExpectedClassFilter] = useState<'all' | 'lecture' | 'practical'>('all');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PRESENT' | 'ABSENT' | 'LEAVE'>('ALL');
  const { setSessionExpired } = useStudySessionStore();
  const router = useRouter();
  const { isSubscriptionRequired } = useSubscription();

  const hasInjectedPostback = useRef(false);
  const cacheHit = useRef(!!initialCache);
  const postbackStarted = useRef(false);
  const navAttempts = useRef(0);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleSetPredictDays = (val: number) => {
    if (val > 3 && isSubscriptionRequired) {
      setPredictDays(3);
      usePaywallStore.getState().showPaywall("Attendance prediction beyond 3 days is a Pro feature. Upgrade to plan your bunks for the entire semester.");
      return;
    }
    setPredictDays(val);
  };

  // High-speed direct API fetch to student portal GetFullReport endpoint (<500ms)
  const loadAttendanceData = async () => {
    try {
      let target = viewActionTarget;
      if (!target || !target.includes('|')) {
        const matched = (subjects || []).find((s: any) =>
          (subjectCode && s.code === subjectCode) ||
          (subjectName && s.name === subjectName)
        );
        if (matched?.viewActionTarget) target = matched.viewActionTarget;
      }

      let cookies = await SecureStore.getItemAsync('culko_cookies');
      if (!cookies) {
        cookies = await AsyncStorage.getItem('culko_cookies');
      }

      let uidVal = '';
      let chkVal = '';
      if (target && target.includes('|')) {
        [uidVal, chkVal] = target.split('|');
      } else {
        const profile = useStudyOSStore.getState().profile;
        if (profile?.uid) {
          uidVal = profile.uid;
          chkVal = subjectCode || '';
        }
      }

      if (uidVal && chkVal && cookies) {
        const res = await fetch('https://student.culko.in/frmStudentCourseWiseAttendanceSummary.aspx/GetFullReport', {
          method: 'POST',
          headers: {
            'Cookie': cookies,
            'Content-Type': 'application/json; charset=utf-8',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          body: JSON.stringify({
            course: chkVal,
            UID: uidVal,
            fromDate: '0',
            toDate: '0',
            type: '0',
            Session: '',
          }),
        });

        if (res.ok) {
          const resJson = await res.json();
          if (resJson?.d?.Result) {
            const rawRecords = JSON.parse(resJson.d.Result);
            if (Array.isArray(rawRecords) && rawRecords.length > 0) {
              const records = rawRecords.map((r: any) => ({
                date: r["AttDate"] || '',
                type: r["AttendanceType"] || '',
                time: r["Timing"] || '',
                status: r["AttendanceCode"] || '',
                markedBy: r["Name"] || '',
              }));

              cacheHit.current = true;
              setAttendanceData(records);
              const currentCache = useStudyOSStore.getState().detailedAttendanceCache || {};
              setScrapedData({
                detailedAttendanceCache: {
                  ...currentCache,
                  [subjectCode]: records,
                  ...(subjectName ? { [subjectName]: records } : {}),
                },
              });
              setLoading(false);
              return;
            }
          }
        }
      }
    } catch (apiErr) {
      console.log('[DetailModal] Direct API fetch error, will fallback to WebView:', apiErr);
    }

    // Headless WebView Fallback
    try {
      let cookies = await SecureStore.getItemAsync('culko_cookies');
      if (!cookies) {
        cookies = await AsyncStorage.getItem('culko_cookies');
      }
      if (!cookies) {
        setErrorMsg('Session expired. Please re-login.');
        setLoading(false);
        return;
      }
      setRawCookie(cookies);
      const parts = cookies.split(';').map((c) => c.trim()).filter(Boolean);
      const lines = parts.map((c) => `document.cookie = ${JSON.stringify(c + '; path=/')};`).join('\n');
      setCookieInjectScript(lines + '\ntrue;');
    } catch (e) {
      setErrorMsg('Failed to load attendance records.');
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible) {
      setIsPredicting(false);
      setPredictDays(3);
      setExpectedClassFilter('all');
      return;
    }
    if (initialPredicting) {
      setIsPredicting(true);
    }
    const backAction = () => {
      onClose();
      return true;
    };
    const handler = BackHandler.addEventListener('hardwareBackPress', backAction);

    // Fast check: if cache hit, display immediately
    const cached = findCachedData();
    if (cached && cached.length > 0) {
      cacheHit.current = true;
      setAttendanceData(cached);
      setLoading(false);
      setErrorMsg('');
      return () => handler.remove();
    }

    // Cache miss: initiate fast fetch
    cacheHit.current = false;
    setLoading(true);
    setErrorMsg('');
    setAttendanceData([]);
    loadAttendanceData();

    return () => handler.remove();
  }, [visible, subjectCode, subjectName, initialPredicting, onClose, findCachedData]);

  // Pull-to-refresh: bust cache for this subject and re-fetch from portal instantly
  const handleRefresh = async () => {
    setIsRefreshing(true);
    const currentCache = useStudyOSStore.getState().detailedAttendanceCache || {};
    const { [subjectCode]: _removed1, [subjectName]: _removed2, ...rest } = currentCache;
    await setScrapedData({ detailedAttendanceCache: rest });

    cacheHit.current = false;
    hasInjectedPostback.current = false;
    postbackStarted.current = false;
    navAttempts.current = 0;
    setErrorMsg('');
    setDebugLogs([]);
    setLoading(true);

    await loadAttendanceData();
    setIsRefreshing(false);
  };

  const buildInjectScript = (code: string, name?: string, target?: string) => `
    try {
      var isDetailedPage = document.body.innerText.includes('Marked By') || document.body.innerText.includes('Time') || (document.querySelectorAll('table tr')[0] && document.querySelectorAll('table tr')[0].innerText.includes('Time'));

      if (!isDetailedPage) {
        var cleanCode = (${JSON.stringify(code || '')}).replace(/^[A-Z]+_/, '').trim().toUpperCase();
        var cleanName = (${JSON.stringify(name || '')}).trim().toUpperCase();
        var targetName = (${JSON.stringify(target || '')}).trim();
        var clicked = false;

        // 0. Fast direct JSON endpoint if targetName is UID|chk
        if (targetName && targetName.indexOf('|') > -1) {
           var targetParts = targetName.split('|');
           var pageUrl = window.location.href.split('?')[0] + '/GetFullReport';
           var Sel_Session = (document.querySelector('#ddlSession') && document.querySelector('#ddlSession').value) || (document.querySelector('#hfdbSelSes') && document.querySelector('#hfdbSelSes').value) || '';
           var typeFilter = (document.querySelector('#drpfilter') && document.querySelector('#drpfilter').value) || '0';

           var xhr = new XMLHttpRequest();
           xhr.open('POST', pageUrl, true);
           xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
           xhr.onreadystatechange = function() {
              if (xhr.readyState === 4 && xhr.status === 200) {
                 try {
                    var response = JSON.parse(xhr.responseText);
                    var objData = JSON.parse(response.d.Result);
                    var records = [];
                    for(var j=0; j<objData.length; j++) {
                       var r = objData[j];
                       records.push({
                          date: r["AttDate"] || '',
                          type: r["AttendanceType"] || '',
                          time: r["Timing"] || '',
                          status: r["AttendanceCode"] || '',
                          markedBy: r["Name"] || ''
                       });
                    }
                    if (records.length > 0) {
                       window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SUCCESS', data: records }));
                    }
                 } catch(e) {}
              }
           };
           xhr.send(JSON.stringify({
              course: targetParts[1],
              UID: targetParts[0],
              fromDate: "0",
              toDate: "0",
              type: typeFilter,
              Session: Sel_Session
           }));
           clicked = true;
        } else if (targetName) {
           var targetBtn = document.querySelector('[name="' + targetName + '"]') || document.getElementById(targetName) || document.getElementById(targetName.replace(/\\$/g, '_'));
           if (targetBtn) {
              targetBtn.click();
              clicked = true;
           } else if (typeof window.__doPostBack === 'function') {
              window.__doPostBack(targetName, '');
              clicked = true;
           }
        }

        // 1. Try to find button by 'obj' attribute matching code or name
        if (!clicked) {
          var buttons = document.querySelectorAll('input[type="button"], input[type="submit"], button, a');
          for (var i=0; i<buttons.length; i++) {
             var obj = buttons[i].getAttribute('obj');
             if (obj) {
                var upperObj = obj.toUpperCase();
                if ((cleanCode && upperObj.includes(cleanCode)) || (cleanName && upperObj.includes(cleanName))) {
                   buttons[i].click();
                   clicked = true;
                   break;
                }
             }
          }
        }

        // 2. Try by row text matching code or subject name
        if (!clicked) {
           var rows = document.querySelectorAll('tr');
           for (var r=0; r<rows.length; r++) {
              var rowText = rows[r].innerText.toUpperCase();
              var matchesCode = cleanCode && rowText.includes(cleanCode);
              var matchesName = cleanName && rowText.includes(cleanName);
              if (matchesCode || matchesName) {
                 var viewBtn = rows[r].querySelector('input[value="View"], input[value="VIEW"], input[type="button"], input[type="submit"], a, button');
                 if (viewBtn) {
                    viewBtn.click();
                    clicked = true;
                    break;
                 }
              }
           }
        }

        if (clicked) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'POSTBACK_SENT' }));
          
          var checkCount = 0;
          var interval = setInterval(function() {
             var isDetailedNow = document.body.innerText.includes('Marked By') || document.body.innerText.includes('Time') || (document.querySelectorAll('table tr')[0] && document.querySelectorAll('table tr')[0].innerText.includes('Time'));
             if (isDetailedNow) {
                clearInterval(interval);
                extractData();
             }
             checkCount++;
             if (checkCount > 60) {
                clearInterval(interval);
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: 'Unable to load detailed attendance records for this subject right now. Please try again.' }));
             }
          }, 300);
        } else {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: 'Attendance records for ' + (cleanName || cleanCode) + ' could not be found on portal.' }));
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
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: 'No attendance records table found.' }));
          return;
        }
        
        var rows = detailTable.querySelectorAll('tr');
        var results = [];
        for (var i = 1; i < rows.length; i++) {
          var cells = rows[i].querySelectorAll('td');
          if (cells.length >= 4) {
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
        if (results.length === 0) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: 'No detailed records found for this course.' }));
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
    if (!currentSubject) {
      return {
        count: 0,
        lectureCount: 0,
        practicalCount: 0,
        currentPct: 0,
        attendedAllPct: 0,
        missedPct: null as number | null,
        validMissed: 0,
        currAttended: 0,
        currTotal: 0,
        newTotal: 0,
        predictedAttendedWithMiss: 0,
        expectedClasses: [],
      };
    }
    let count = 0;
    let lectureCount = 0;
    let practicalCount = 0;
    const expectedClasses: { date: Date, slot: any, classType: 'Practical' | 'Lecture' }[] = [];
    const today = new Date();
    const daysArr = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    const baseCode = (subjectCode || '').split(' ')[0].trim();

    for (let i = 1; i <= predictDays; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      
      if (!isHolidayOrExam(d)) {
        const dayStr = daysArr[d.getDay()];
        const daySlots = (timetable || {})[dayStr];
        const safeDaySlots = Array.isArray(daySlots) ? daySlots : [];
        const matchedSlots = safeDaySlots.filter((slot: any) => {
           const sName = String(slot?.subjectName || '').trim();
           return (baseCode && sName.includes(baseCode)) ||
                  (subjectCode && sName.includes(subjectCode)) ||
                  (subjectName && sName.includes(subjectName));
        });
        matchedSlots.forEach((slot: any) => {
           const classType = getSlotClassType(slot);
           if (classType === 'Practical') practicalCount++;
           else lectureCount++;
           expectedClasses.push({ date: new Date(d), slot, classType });
        });
        count += matchedSlots.length;
      }
    }
    
    const currTotal = Number(currentSubject.totalClasses || 0);
    const currAttended = Number(currentSubject.attendedClasses || 0);
    
    const newTotal = currTotal + count;
    const currentPct = currTotal === 0 ? 0 : Math.round((currAttended / currTotal) * 100);
    const attendedAllPct = newTotal === 0 ? 0 : Math.round(((currAttended + count) / newTotal) * 100);
    
    const parsedMissed = parseInt(missedClassesInput, 10) || 0;
    const validMissed = Math.min(Math.max(0, parsedMissed), count);
    const predictedAttendedWithMiss = currAttended + Math.max(0, count - validMissed);
    const missedPct = validMissed > 0
      ? (newTotal === 0 ? 0 : Math.round((predictedAttendedWithMiss / newTotal) * 100))
      : null;
    
    return {
      count,
      lectureCount,
      practicalCount,
      currentPct,
      attendedAllPct,
      missedPct,
      validMissed,
      currAttended,
      currTotal,
      newTotal,
      predictedAttendedWithMiss,
      expectedClasses,
    };
  };

  const prediction = isPredicting ? calculatePrediction() : null;

  const filteredExpectedClasses = (prediction?.expectedClasses || []).filter((ec: any) => {
    if (expectedClassFilter === 'lecture') return ec.classType === 'Lecture';
    if (expectedClassFilter === 'practical') return ec.classType === 'Practical';
    return true;
  });

  const safeAttendanceData = Array.isArray(attendanceData) ? attendanceData : [];



  let presentCount = 0;
  let absentCount = 0;
  let dutyLeaveCount = 0;
  let medicalLeaveCount = 0;

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

  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === 'black';

  const filteredAttendanceData = useMemo(() => {
    if (statusFilter === 'ALL') return safeAttendanceData;
    return safeAttendanceData.filter((item) => {
      const s = String(item?.status || '').toUpperCase().trim();
      if (statusFilter === 'PRESENT') return s === 'P' || s.includes('PRESENT');
      if (statusFilter === 'ABSENT') return s === 'A' || s.includes('ABSENT');
      if (statusFilter === 'LEAVE') return s === 'DL' || s === 'ML' || s.includes('LEAVE') || s.includes('DUTY') || s.includes('MEDICAL');
      return true;
    });
  }, [safeAttendanceData, statusFilter]);

  const attendedFromStore = currentSubject?.attendedClasses != null
    ? Number(currentSubject.attendedClasses)
    : (presentCount + dutyLeaveCount + medicalLeaveCount);
  const totalFromStore = currentSubject?.totalClasses != null
    ? Number(currentSubject.totalClasses)
    : safeAttendanceData.length;

  const rawPct = currentSubject?.attendancePercentage != null
    ? parseFloat(String(currentSubject.attendancePercentage).replace('%', ''))
    : null;
  const officialPct = (rawPct !== null && !isNaN(rawPct))
    ? Math.round(rawPct)
    : (totalFromStore > 0 ? Math.round((attendedFromStore / totalFromStore) * 100) : 0);

  const bunkMargin = calculateBunkMargin(attendedFromStore, totalFromStore, 75);
  const pctColor = officialPct >= 75 ? '#22c55e' : officialPct >= 65 ? '#f59e0b' : '#ef4444';

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Modern Frosted Header */}
        <View style={[styles.header, { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', backgroundColor: colors.background }]}>
          <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', marginRight: 10 }]}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>

          <View style={{ flex: 1, paddingRight: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>Attendance</Text>
              <View style={[styles.codeBadge, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '30' }]}>
                <Text style={[styles.codeBadgeText, { color: colors.primary }]}>{subjectCode}</Text>
              </View>
            </View>
            <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
              {subjectName}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity 
              onPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                setIsPredicting(!isPredicting);
              }} 
              style={[
                styles.predictToggleBtn, 
                { 
                  backgroundColor: isPredicting ? colors.primary : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                  borderColor: isPredicting ? colors.primary : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'),
                }
              ]}
            >
              <Sparkles size={12} color={isPredicting ? '#ffffff' : colors.primary} />
              <Text style={[styles.predictToggleText, { color: isPredicting ? '#ffffff' : colors.text }]}>
                {isPredicting ? 'Records' : 'Predict'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={handleRefresh} 
              disabled={isRefreshing || loading}
              style={[
                styles.iconBtn, 
                { 
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                }
              ]}
            >
              {isRefreshing ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="refresh" size={16} color={colors.text} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {isPredicting && prediction && (
          <View
            style={{
              padding: 12,
              paddingBottom: 16,
              backgroundColor: isDark ? '#101014' : colors.surfaceHigh,
              borderBottomWidth: 1,
              borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            }}
          >
            {/* Row: Speedometer + Stat Tiles */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 4 }}>
              {/* Circular Gauge */}
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <AttendanceRingWidget
                  currentPct={prediction.currentPct ?? 0}
                  predictPct={(prediction.validMissed ?? 0) > 0 ? (prediction.missedPct ?? 0) : (prediction.attendedAllPct ?? 0)}
                  currentAttended={prediction.currAttended ?? 0}
                  currentTotal={prediction.currTotal ?? 0}
                  predictAttended={(prediction.validMissed ?? 0) > 0 ? (prediction.predictedAttendedWithMiss ?? 0) : ((prediction.currAttended ?? 0) + (prediction.count ?? 0))}
                  predictTotal={prediction.newTotal ?? 0}
                  predictType={(prediction.validMissed ?? 0) > 0 ? 'miss' : 'attend'}
                  colors={colors}
                  size={144}
                />
              </View>

              {/* Bento Stat tiles */}
              <View style={{ flex: 1.15, paddingLeft: 8 }}>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                  <MiniStatBox label="Present" value={presentCount} colors={colors} color="#22c55e" icon={CheckCircle2} />
                  <MiniStatBox label="Absent" value={absentCount} colors={colors} color="#ef4444" icon={XCircle} />
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <MiniStatBox label="Med L." value={medicalLeaveCount} colors={colors} color="#f59e0b" icon={Stethoscope} />
                  <MiniStatBox label="Duty L." value={dutyLeaveCount} colors={colors} color="#3b82f6" icon={Briefcase} />
                </View>
              </View>
            </View>

                {/* Predict control panel */}
                {/* Modernized Predict Control Panel */}
                <View
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: Radius.lg,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                    marginTop: 8,
                  }}
                >
                  {/* Header Row: Days indicator + Missed Input */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ backgroundColor: colors.primary + '18', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                        <Text style={{ color: colors.primary, fontSize: 13, fontFamily: 'SpaceGrotesk_700Bold' }}>
                          Next {predictDays} Days
                        </Text>
                      </View>
                      <Text style={{ color: colors.textMuted, fontSize: 11.5, fontFamily: 'Inter_500Medium' }}>
                        {prediction.count} classes ({prediction.lectureCount}L • {prediction.practicalCount}P)
                      </Text>
                    </View>

                    {/* Miss input chip */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ color: colors.textMuted, fontSize: 11.5, fontFamily: 'Inter_500Medium' }}>Miss:</Text>
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
                        style={{
                          width: 42,
                          height: 28,
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: parseInt(missedClassesInput, 10) > 0 ? '#ef4444' : isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)',
                          backgroundColor: parseInt(missedClassesInput, 10) > 0 ? '#ef444415' : colors.background,
                          color: parseInt(missedClassesInput, 10) > 0 ? '#ef4444' : colors.text,
                          fontSize: 13,
                          fontFamily: 'SpaceGrotesk_700Bold',
                          textAlign: 'center',
                          paddingVertical: 0,
                        }}
                        maxLength={2}
                      />
                    </View>
                  </View>

                  <PremiumSlider min={1} max={30} value={predictDays} onValueChange={(val: number) => handleSetPredictDays(val)} colors={colors} />

                  {/* Outcome Cards Row */}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <View
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        padding: 8,
                        borderRadius: 8,
                        backgroundColor: 'rgba(34, 197, 94, 0.08)',
                        borderWidth: 1,
                        borderColor: 'rgba(34, 197, 94, 0.25)',
                      }}
                    >
                      <CheckCircle2 size={16} color="#22c55e" />
                      <View>
                        <Text style={{ color: '#22c55e', fontSize: 15, fontFamily: 'SpaceGrotesk_700Bold', lineHeight: 18 }}>
                          {prediction.attendedAllPct}%
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: 9.5, fontFamily: 'Inter_500Medium' }}>
                          If attend all classes
                        </Text>
                      </View>
                    </View>

                    {(prediction?.validMissed ?? 0) > 0 && (
                      <View
                        style={{
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                          padding: 8,
                          borderRadius: 8,
                          backgroundColor: 'rgba(239, 68, 68, 0.08)',
                          borderWidth: 1,
                          borderColor: 'rgba(239, 68, 68, 0.25)',
                        }}
                      >
                        <XCircle size={16} color="#ef4444" />
                        <View>
                          <Text style={{ color: '#ef4444', fontSize: 15, fontFamily: 'SpaceGrotesk_700Bold', lineHeight: 18 }}>
                            {prediction.missedPct}%
                          </Text>
                          <Text style={{ color: colors.textMuted, fontSize: 9.5, fontFamily: 'Inter_500Medium' }}>
                            If miss {prediction.validMissed} class{prediction.validMissed > 1 ? 'es' : ''}
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                </View>
          </View>
        )}

        {visible && !cacheHit.current && cookieInjectScript !== null && (
          <View style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }}>
            <WebView
              ref={webViewRef}
              source={{ 
                uri: ATTENDANCE_URL,
                ...(rawCookie ? { headers: { Cookie: rawCookie } } : {})
              }}
              injectedJavaScriptBeforeContentLoaded={cookieInjectScript || undefined}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              sharedCookiesEnabled={true}
              thirdPartyCookiesEnabled={true}
              onNavigationStateChange={(navState: any) => {
                console.log('[DetailModal] Nav:', navState.url, 'loading:', navState.loading);
                if (cacheHit.current) return;
                if (!navState.loading) {
                  const url = (navState.url || '').toLowerCase();
                  if (url.includes('error.html') || url.includes('servererror')) {
                    console.log('[DetailModal] Transient server error page — ignoring');
                    setLoading(false);
                    return;
                  }
                  if (url.includes('login.aspx') || url.includes('/login')) {
                    console.log('[DetailModal] Session expired — redirected to login');
                    setLoading(false);
                    setSessionExpired(true);
                    return;
                  }
                  // First real load: inject cookies, then scrape script immediately
                  if (navAttempts.current === 0) {
                    navAttempts.current = 1;
                    webViewRef.current?.injectJavaScript(cookieInjectScript);
                    setTimeout(() => {
                      if (!cacheHit.current) {
                        webViewRef.current?.injectJavaScript(buildInjectScript(subjectCode, subjectName, viewActionTarget));
                      }
                    }, 200);
                  } else if (hasInjectedPostback.current) {
                    setTimeout(() => {
                      if (!cacheHit.current) {
                        webViewRef.current?.injectJavaScript(buildInjectScript(subjectCode, subjectName, viewActionTarget));
                      }
                    }, 200);
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
            {isPredicting ? (
              <View style={{ marginTop: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16, color: colors.text }}>Expected Classes</Text>
                  {prediction && prediction.count > 0 && (
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <View style={{ backgroundColor: (colors.primary || '#3b82f6') + '15', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: (colors.primary || '#3b82f6') + '30' }}>
                        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: colors.primary || '#3b82f6' }}>{prediction.lectureCount} Lec</Text>
                      </View>
                      <View style={{ backgroundColor: '#8b5cf618', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: '#8b5cf635' }}>
                        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: '#8b5cf6' }}>{prediction.practicalCount} Prac</Text>
                      </View>
                    </View>
                  )}
                </View>

                {/* Quick filter tabs if both lecture and practical exist */}
                {prediction && prediction.count > 0 && prediction.lectureCount > 0 && prediction.practicalCount > 0 && (
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                    <TouchableOpacity
                      onPress={() => setExpectedClassFilter('all')}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 14,
                        backgroundColor: expectedClassFilter === 'all' ? colors.primary : colors.surface,
                        borderWidth: 1,
                        borderColor: expectedClassFilter === 'all' ? colors.primary : colors.border,
                      }}
                    >
                      <Text style={{ fontSize: 10.5, fontFamily: 'Inter_600SemiBold', color: expectedClassFilter === 'all' ? '#fff' : colors.textMuted }}>
                        All ({prediction.count})
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setExpectedClassFilter('lecture')}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 14,
                        backgroundColor: expectedClassFilter === 'lecture' ? (colors.primary || '#3b82f6') : colors.surface,
                        borderWidth: 1,
                        borderColor: expectedClassFilter === 'lecture' ? (colors.primary || '#3b82f6') : colors.border,
                      }}
                    >
                      <Text style={{ fontSize: 10.5, fontFamily: 'Inter_600SemiBold', color: expectedClassFilter === 'lecture' ? '#fff' : colors.textMuted }}>
                        Lectures ({prediction.lectureCount})
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setExpectedClassFilter('practical')}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 14,
                        backgroundColor: expectedClassFilter === 'practical' ? '#8b5cf6' : colors.surface,
                        borderWidth: 1,
                        borderColor: expectedClassFilter === 'practical' ? '#8b5cf6' : colors.border,
                      }}
                    >
                      <Text style={{ fontSize: 10.5, fontFamily: 'Inter_600SemiBold', color: expectedClassFilter === 'practical' ? '#fff' : colors.textMuted }}>
                        Practicals ({prediction.practicalCount})
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {filteredExpectedClasses.length === 0 ? (
                  <Text style={{ color: colors.textMuted, fontSize: 14, fontFamily: 'Inter_500Medium' }}>
                    {prediction?.expectedClasses?.length === 0 
                      ? `No classes scheduled for the next ${predictDays} days.`
                      : `No ${expectedClassFilter} classes scheduled.`}
                  </Text>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-start' }}>
                    {filteredExpectedClasses.map((ec: any, i: number) => {
                      const dateStr = ec.date.getDate() + ' ' + ec.date.toLocaleDateString('en-GB', { month: 'short' });
                      const dayStr = ec.date.toLocaleDateString('en-GB', { weekday: 'short' });
                      const timeStr = ec.slot?.time || 'Sch';
                      const ampm = timeStr.toUpperCase().includes('PM') ? 'PM' : 'AM';
                      const startTime = timeStr.split('-')[0].trim() + ' ' + ampm;
                      
                      const isPractical = ec.classType === 'Practical';
                      const typeBadgeText = isPractical ? 'PRAC' : 'LEC';
                      const typeBadgeColor = isPractical ? '#8b5cf6' : (colors.primary || '#3b82f6');
                      
                      const originalIndex = prediction?.expectedClasses ? (prediction.expectedClasses as any[]).indexOf(ec) : i;
                      const isMiss = parseInt(missedClassesInput, 10) > 0 && originalIndex < (prediction?.validMissed ?? 0);
                      const badgeColor = isMiss ? '#ef4444' : '#22c55e';
                      const badgeText = isMiss ? 'MISS' : 'EXP';
                      
                      return (
                        <View key={i} style={{ width: '23%', marginBottom: 6 }}>
                          <View style={{ 
                             backgroundColor: isPractical ? (badgeColor + '08') : (badgeColor + '10'), 
                             borderColor: isPractical ? '#8b5cf645' : (badgeColor + '30'),
                             borderWidth: 1,
                             paddingVertical: 6,
                             paddingHorizontal: 3,
                             alignItems: 'center',
                             justifyContent: 'center',
                             borderRadius: Radius.md,
                             height: 64
                          }}>
                             <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingHorizontal: 2, marginBottom: 3 }}>
                               <Text style={{ fontFamily: 'Inter_700Bold', color: badgeColor, fontSize: 8 }}>{badgeText}</Text>
                               <View style={{ 
                                 backgroundColor: typeBadgeColor + '20', 
                                 paddingHorizontal: 3, 
                                 paddingVertical: 1, 
                                 borderRadius: 4 
                               }}>
                                 <Text style={{ fontFamily: 'Inter_700Bold', color: typeBadgeColor, fontSize: 7.5 }}>{typeBadgeText}</Text>
                               </View>
                             </View>
                             
                             <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', color: colors.text, fontSize: 11 }} numberOfLines={1}>{dateStr}</Text>
                             
                             <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                               <Text style={{ fontFamily: 'Inter_600SemiBold', color: colors.textDim, fontSize: 7.5 }} numberOfLines={1}>{startTime}</Text>
                             </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            ) : (
              <View>
                {/* Hero Overview Card */}
                <LinearGradient
                  colors={isDark ? ['#1e1e24', '#121216'] : ['#f8fafc', '#ffffff']}
                  style={[
                    styles.heroCard,
                    {
                      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                      shadowColor: pctColor,
                    },
                  ]}
                >
                  <View style={styles.heroMainRow}>
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                        <Text style={[styles.heroPctNum, { color: pctColor }]}>{officialPct}</Text>
                        <Text style={[styles.heroPctSymbol, { color: pctColor }]}>%</Text>
                      </View>
                      <View
                        style={[
                          styles.heroStatusPill,
                          {
                            backgroundColor: officialPct >= 75 ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                            borderColor: officialPct >= 75 ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)',
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.heroStatusDot,
                            { backgroundColor: officialPct >= 75 ? '#22c55e' : '#ef4444' },
                          ]}
                        />
                        <Text
                          style={[
                            styles.heroStatusText,
                            { color: officialPct >= 75 ? '#22c55e' : '#ef4444' },
                          ]}
                        >
                          {officialPct >= 75 ? 'Above 75% Safe' : 'Below 75% Alert'}
                        </Text>
                      </View>
                    </View>

                    <View style={{ alignItems: 'flex-end', flex: 1, paddingLeft: 16 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                        <Text style={[styles.heroClassesRatio, { color: colors.text }]}>
                          {attendedFromStore}
                        </Text>
                        <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.textMuted }}>
                          / {totalFromStore}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: colors.textDim, marginBottom: 6 }}>
                        Total Classes Attended
                      </Text>

                      <View
                        style={[
                          styles.heroAdvicePill,
                          {
                            backgroundColor: bunkMargin.type === 'safe' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            borderColor: bunkMargin.type === 'safe' ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.heroAdviceText,
                            { color: bunkMargin.type === 'safe' ? '#22c55e' : '#ef4444' },
                          ]}
                          numberOfLines={1}
                        >
                          {bunkMargin.text}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.heroDivider,
                      { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)' },
                    ]}
                  />

                  <View style={styles.heroMiniStatsRow}>
                    <View style={styles.heroMiniStat}>
                      <View style={[styles.miniStatIconBox, { backgroundColor: 'rgba(34, 197, 94, 0.12)' }]}>
                        <CheckCircle2 size={13} color="#22c55e" />
                      </View>
                      <View>
                        <Text style={[styles.miniStatVal, { color: colors.text }]}>{presentCount}</Text>
                        <Text style={[styles.miniStatLbl, { color: colors.textMuted }]}>Present</Text>
                      </View>
                    </View>

                    <View style={styles.heroMiniStat}>
                      <View style={[styles.miniStatIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                        <XCircle size={13} color="#ef4444" />
                      </View>
                      <View>
                        <Text style={[styles.miniStatVal, { color: colors.text }]}>{absentCount}</Text>
                        <Text style={[styles.miniStatLbl, { color: colors.textMuted }]}>Absent</Text>
                      </View>
                    </View>

                    <View style={styles.heroMiniStat}>
                      <View style={[styles.miniStatIconBox, { backgroundColor: 'rgba(139, 92, 246, 0.12)' }]}>
                        <Briefcase size={13} color="#8b5cf6" />
                      </View>
                      <View>
                        <Text style={[styles.miniStatVal, { color: colors.text }]}>{dutyLeaveCount}</Text>
                        <Text style={[styles.miniStatLbl, { color: colors.textMuted }]}>Duty L.</Text>
                      </View>
                    </View>

                    <View style={styles.heroMiniStat}>
                      <View style={[styles.miniStatIconBox, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
                        <Stethoscope size={13} color="#f59e0b" />
                      </View>
                      <View>
                        <Text style={[styles.miniStatVal, { color: colors.text }]}>{medicalLeaveCount}</Text>
                        <Text style={[styles.miniStatLbl, { color: colors.textMuted }]}>Med L.</Text>
                      </View>
                    </View>
                  </View>
                </LinearGradient>

                {/* Filter Section */}
                <View style={styles.filterSection}>
                  <View style={styles.filterHeaderRow}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Attendance History</Text>
                    <Text style={[styles.recordsCount, { color: colors.textMuted }]}>
                      {filteredAttendanceData.length} records
                    </Text>
                  </View>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScrollRow}>
                    {(
                      [
                        { key: 'ALL', label: 'All', count: safeAttendanceData.length, color: colors.primary },
                        { key: 'PRESENT', label: 'Present', count: presentCount, color: '#22c55e' },
                        { key: 'ABSENT', label: 'Absent', count: absentCount, color: '#ef4444' },
                        { key: 'LEAVE', label: 'Leaves', count: dutyLeaveCount + medicalLeaveCount, color: '#8b5cf6' },
                      ] as const
                    ).map((filter) => {
                      const active = statusFilter === filter.key;
                      return (
                        <TouchableOpacity
                          key={filter.key}
                          onPress={() => {
                            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                            setStatusFilter(filter.key);
                          }}
                          style={[
                            styles.filterPill,
                            active
                              ? { backgroundColor: filter.color, borderColor: filter.color }
                              : {
                                  backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                                  borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                                },
                          ]}
                        >
                          <Text
                            style={[
                              styles.filterPillText,
                              { color: active ? '#ffffff' : colors.textMuted },
                            ]}
                          >
                            {filter.label}
                          </Text>
                          <View
                            style={[
                              styles.filterCountBadge,
                              {
                                backgroundColor: active
                                  ? 'rgba(255,255,255,0.25)'
                                  : isDark
                                  ? 'rgba(255,255,255,0.08)'
                                  : 'rgba(0,0,0,0.06)',
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.filterCountText,
                                { color: active ? '#ffffff' : colors.text },
                              ]}
                            >
                              {filter.count}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Attendance Cards or Loading / Error / Empty Filter State */}
                {loading ? (
                  <View style={[styles.loadingRecordsCard, { backgroundColor: colors.surface, borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginBottom: 12 }} />
                    <Text style={[styles.loadingRecordsTitle, { color: colors.text }]}>Fetching Class-by-Class Records...</Text>
                    <Text style={[styles.loadingRecordsSub, { color: colors.textMuted }]}>
                      {hasInjectedPostback.current ? 'Extracting records from attendance sheet...' : 'Connecting to student portal for lecture dates and timestamps...'}
                    </Text>
                  </View>
                ) : errorMsg ? (
                  <View style={[styles.emptyFilterCard, { backgroundColor: colors.surface, borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
                    <Ionicons name="alert-circle-outline" size={40} color="#ef4444" style={{ marginBottom: 8 }} />
                    <Text style={[styles.emptyFilterTitle, { color: colors.text }]}>Unable to load records</Text>
                    <Text style={[styles.emptyFilterSubtitle, { color: colors.textMuted }]}>{errorMsg}</Text>
                    <TouchableOpacity onPress={handleRefresh} style={{ marginTop: 14, backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 10 }}>
                      <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Tap to Retry</Text>
                    </TouchableOpacity>
                  </View>
                ) : filteredAttendanceData.length === 0 ? (
                  <View style={[styles.emptyFilterCard, { backgroundColor: colors.surface, borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
                    {statusFilter === 'ABSENT' ? (
                      <>
                        <CheckCircle2 size={32} color="#22c55e" style={{ marginBottom: 8 }} />
                        <Text style={[styles.emptyFilterTitle, { color: colors.text }]}>Zero Absents!</Text>
                        <Text style={[styles.emptyFilterSubtitle, { color: colors.textMuted }]}>
                          You haven't missed any recorded lectures or labs for this course. Keep it up!
                        </Text>
                      </>
                    ) : (
                      <>
                        <CalendarIcon size={32} color={colors.textMuted} style={{ marginBottom: 8 }} />
                        <Text style={[styles.emptyFilterTitle, { color: colors.text }]}>No records found</Text>
                        <Text style={[styles.emptyFilterSubtitle, { color: colors.textMuted }]}>
                          No attendance records match the selected "{statusFilter.toLowerCase()}" filter.
                        </Text>
                      </>
                    )}
                  </View>
                ) : (
                  filteredAttendanceData.map((item, index) => {
                    const rawStatus = String(item?.status || '').toUpperCase().trim();
                    let displayStatus = rawStatus;
                    let color = '#ef4444';
                    let StatusIcon = XCircle;

                    if (rawStatus === 'P' || rawStatus === 'PRESENT') {
                      displayStatus = 'Present';
                      color = '#22c55e';
                      StatusIcon = CheckCircle2;
                    } else if (rawStatus === 'A' || rawStatus === 'ABSENT') {
                      displayStatus = 'Absent';
                      color = '#ef4444';
                      StatusIcon = XCircle;
                    } else if (rawStatus === 'ML') {
                      displayStatus = 'Medical Leave';
                      color = '#f59e0b';
                      StatusIcon = Stethoscope;
                    } else if (rawStatus === 'DL') {
                      displayStatus = 'Duty Leave';
                      color = '#8b5cf6';
                      StatusIcon = Briefcase;
                    } else if (rawStatus === 'L' || rawStatus.includes('LEAVE')) {
                      displayStatus = 'Leave';
                      color = '#f59e0b';
                      StatusIcon = Clock;
                    } else if (rawStatus) {
                      color = '#f59e0b';
                      StatusIcon = Clock;
                    }

                    const rawType = String(item?.type || '').toUpperCase();
                    const isPractical = rawType.includes('PRAC') || rawType.includes('LAB') || rawType === 'P';
                    const typeLabel = isPractical ? 'Practical Lab' : 'Lecture';
                    const TypeIcon = isPractical ? FlaskConical : BookOpen;
                    const typeColor = isPractical ? '#8b5cf6' : (colors.primary || '#3b82f6');

                    const teacherInfo = formatMarkedBy(item?.markedBy);

                    return (
                      <View
                        key={index}
                        style={[
                          styles.modernCard,
                          {
                            backgroundColor: colors.surface,
                            borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                            borderLeftColor: color,
                          },
                        ]}
                      >
                        <View style={styles.cardHeaderRow}>
                          <View style={styles.dateRow}>
                            <CalendarIcon size={14} color={colors.textMuted} />
                            <Text style={[styles.cardDateText, { color: colors.text }]}>{item?.date}</Text>
                          </View>

                          <View
                            style={[
                              styles.cardStatusBadge,
                              {
                                backgroundColor: color + '15',
                                borderColor: color + '30',
                              },
                            ]}
                          >
                            <StatusIcon size={12} color={color} />
                            <Text style={[styles.cardStatusText, { color }]}>{displayStatus}</Text>
                          </View>
                        </View>

                        <View style={styles.cardChipsRow}>
                          <View
                            style={[
                              styles.typeChip,
                              {
                                backgroundColor: typeColor + '12',
                                borderColor: typeColor + '25',
                              },
                            ]}
                          >
                            <TypeIcon size={11} color={typeColor} />
                            <Text style={[styles.typeChipText, { color: typeColor }]}>{typeLabel}</Text>
                          </View>

                          {item?.time ? (
                            <View
                              style={[
                                styles.timeChip,
                                {
                                  backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                                },
                              ]}
                            >
                              <Clock size={11} color={colors.textDim} />
                              <Text style={[styles.timeChipText, { color: colors.textMuted }]}>{item.time}</Text>
                            </View>
                          ) : null}
                        </View>

                        {teacherInfo.teacher ? (
                          <View
                            style={[
                              styles.cardTeacherFooter,
                              {
                                borderTopColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                              },
                            ]}
                          >
                            <View style={styles.teacherMainRow}>
                              <User size={12} color={colors.textDim} />
                              <Text style={[styles.teacherNameText, { color: colors.textMuted }]} numberOfLines={1}>
                                {teacherInfo.teacher}
                              </Text>
                              {teacherInfo.uid ? (
                                <View
                                  style={[
                                    styles.uidBadge,
                                    {
                                      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                                    },
                                  ]}
                                >
                                  <Text style={[styles.uidText, { color: colors.textDim }]}>{teacherInfo.uid}</Text>
                                </View>
                              ) : null}
                            </View>

                            {teacherInfo.markedDate ? (
                              <Text style={[styles.markedTimestamp, { color: colors.textDim }]} numberOfLines={1}>
                                Marked: {teacherInfo.markedDate}
                              </Text>
                            ) : null}
                          </View>
                        ) : item?.markedBy ? (
                          <View
                            style={[
                              styles.cardTeacherFooter,
                              {
                                borderTopColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                              },
                            ]}
                          >
                            <Text style={[styles.markedTimestamp, { color: colors.textDim }]} numberOfLines={1}>
                              {item.markedBy}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    );
                  })
                )}
              </View>
            )}
          </ScrollView>

      </View>
    </GestureHandlerRootView>
  );

  if (!asModal) {
    if (!visible) return null;
    return content;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'overFullScreen'}
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontFamily: 'SpaceGrotesk_700Bold' },
  subtitle: { fontSize: 12.5, marginTop: 2, fontFamily: 'Inter_500Medium' },
  closeBtn: { padding: 8, borderRadius: 20 },
  codeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  codeBadgeText: {
    fontSize: 11,
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  predictToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  predictToggleText: {
    fontSize: 11.5,
    fontFamily: 'Inter_600SemiBold',
  },
  iconBtn: {
    padding: 7,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 16, fontSize: 14, fontFamily: 'Inter_500Medium' },
  errorText: { marginTop: 16, fontSize: 16, fontFamily: 'SpaceGrotesk_600SemiBold' },
  loadingRecordsCard: {
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginTop: 14,
  },
  loadingRecordsTitle: {
    fontSize: 15,
    fontFamily: 'SpaceGrotesk_700Bold',
    marginBottom: 4,
    textAlign: 'center',
  },
  loadingRecordsSub: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
  },

  // Hero Overview Card
  heroCard: {
    padding: 16,
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  heroMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroPctNum: {
    fontSize: 40,
    fontFamily: 'SpaceGrotesk_700Bold',
    lineHeight: 46,
  },
  heroPctSymbol: {
    fontSize: 20,
    fontFamily: 'SpaceGrotesk_700Bold',
    marginLeft: 2,
  },
  heroStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  heroStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  heroStatusText: {
    fontSize: 10.5,
    fontFamily: 'Inter_700Bold',
  },
  heroClassesRatio: {
    fontSize: 22,
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  heroAdvicePill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: '100%',
  },
  heroAdviceText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  heroDivider: {
    height: 1,
    marginVertical: 14,
  },
  heroMiniStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  heroMiniStat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniStatIconBox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniStatVal: {
    fontSize: 13,
    fontFamily: 'SpaceGrotesk_700Bold',
    lineHeight: 16,
  },
  miniStatLbl: {
    fontSize: 9.5,
    fontFamily: 'Inter_500Medium',
  },

  // Filter Section
  filterSection: {
    marginBottom: 12,
  },
  filterHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  recordsCount: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  filterScrollRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  filterCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  filterCountText: {
    fontSize: 10.5,
    fontFamily: 'SpaceGrotesk_700Bold',
  },

  // Record Cards
  modernCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: 12,
    marginBottom: 10,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardDateText: {
    fontSize: 14,
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  cardStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  cardStatusText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    textTransform: 'uppercase',
  },
  cardChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  typeChipText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  timeChipText: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  cardTeacherFooter: {
    borderTopWidth: 1,
    paddingTop: 8,
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  teacherMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  teacherNameText: {
    fontSize: 11.5,
    fontFamily: 'Inter_500Medium',
    flexShrink: 1,
  },
  uidBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  uidText: {
    fontSize: 9.5,
    fontFamily: 'SpaceGrotesk_600SemiBold',
  },
  markedTimestamp: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
  },

  // Empty Filter Card
  emptyFilterCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginTop: 12,
  },
  emptyFilterTitle: {
    fontSize: 16,
    fontFamily: 'SpaceGrotesk_700Bold',
    marginBottom: 4,
  },
  emptyFilterSubtitle: {
    fontSize: 12.5,
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
  },

  // Fallback card styles
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



