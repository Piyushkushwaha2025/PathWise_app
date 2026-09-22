import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, RefreshControl, AppState, Alert, Animated, Image, LayoutAnimation, Platform, UIManager, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing, Radius } from '../../../constants/theme';
import { useThemeStore } from '../../../store/useThemeStore';
import { useStudyOSStore } from '../../../store/studyosStore';
import { useStudySessionStore } from '../../../store/studySessionStore';
import { useRouter, useFocusEffect } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { AutoSyncAttendance } from '../../../components/AutoSyncAttendance';
import { DetailedAttendanceModal } from '../../../components/DetailedAttendanceModal';
import { FacilitiesModal } from '../../../components/FacilitiesModal';
import { AttendanceOverviewModal } from '../../../components/AttendanceOverviewModal';
import { AcademicCalendarModal } from '../../../components/AcademicCalendarModal';
import * as SecureStore from 'expo-secure-store';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { getRewardStatus, RewardStatus } from '../../../lib/db';
import { fetchNotifications, useDBProfile } from '../../../lib/db';
import { useSubscription } from '../../../hooks/useSubscription';
import { useBackgroundSync } from '../../../hooks/useBackgroundSync';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function getAttendancePrediction(total: number, attended: number) {
  if (total === 0) return { text: "Semester just started!", type: 'neutral' };
  
  const currentPct = attended / total;
  if (currentPct >= 0.75) {
    const safeToMiss = Math.floor(attended / 0.75 - total);
    return {
      text: safeToMiss > 0 ? `Safe to miss ${safeToMiss} classes` : `Don't miss next class`,
      type: 'success'
    };
  } else {
    const needToAttend = Math.ceil(3 * total - 4 * attended);
    return {
      text: `Attend ${needToAttend} classes for 75%`,
      type: 'danger'
    };
  }
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// CUIMS dates: dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd, "12 Aug 2026", "Aug 12 2026".
// Returns ms (with time-of-day as tiebreak), NaN if unparseable.
function parseRecordDate(d?: string, time?: string) {
  const s = String(d || '').trim();
  if (!s) return NaN;

  let y = NaN, mo = NaN, day = NaN;

  const named = s.match(/(\d{1,2})[\s\-\/]*([A-Za-z]{3,})[\s\-\/,]*(\d{2,4})/)
             || s.match(/([A-Za-z]{3,})[\s\-\/]*(\d{1,2})[\s\-\/,]*(\d{2,4})/);
  const numeric = s.match(/(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})/);

  if (named) {
    const isDayFirst = /^\d+$/.test(named[1]);
    const monKey = String(isDayFirst ? named[2] : named[1]).slice(0, 3).toLowerCase();
    mo = MONTHS[monKey];
    day = Number(isDayFirst ? named[1] : named[2]);
    y = Number(named[3]);
  } else if (numeric) {
    const a = Number(numeric[1]), b = Number(numeric[2]), c = Number(numeric[3]);
    if (numeric[1].length === 4) {
      y = a; mo = b - 1; day = c;              // yyyy-mm-dd
    } else {
      day = a; mo = b - 1; y = c;              // dd/mm/yyyy (portal default)
    }
  } else {
    return NaN;
  }

  if (isNaN(y) || isNaN(mo) || isNaN(day) || mo < 0 || mo > 11 || day < 1 || day > 31) return NaN;
  if (y < 100) y += 2000;

  const t = String(time || '').match(/(\d{1,2}):(\d{2})/);
    let hr = t ? Number(t[1]) : 0;
    const min = t ? Number(t[2]) : 0;
    
    if (time) {
      const timeUpper = time.toUpperCase();
      if (timeUpper.includes('PM') && hr < 12) hr += 12;
      if (timeUpper.includes('AM') && hr === 12) hr = 0;
    }
    
    return new Date(y, mo, day, hr, min).getTime();
}

// Real chronological data only — no synthetic P/A blocks. Empty = show nothing.
// Output is newest→oldest so the FIRST dot is the most recent class (top of column).
function getHistoryStatuses(records?: any[]) {
  if (!records || records.length === 0) return [];

  const dated = records.map((r, i) => ({ r, i, t: parseRecordDate(r?.date, r?.time) }));
  const parseable = dated.filter((x) => !isNaN(x.t));

  let ordered: any[];
  if (parseable.length >= 2) {
    // Sort NEWEST to OLDEST (descending time). If times are equal, keep portal order.
    ordered = parseable.sort((a, b) => b.t - a.t || a.i - b.i).map((x) => x.r);
  } else {
    // Portal lists newest-first by default.
    ordered = records;
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayEnd = todayStart + 86400000;

  // Take the 5 newest classes. They are already ordered newest-first (index 0 is the newest class).
  return ordered.slice(0, 5).map((r: any) => {
    let isToday = false;
    const t = parseRecordDate(r?.date, r?.time);
    if (!isNaN(t) && t >= todayStart && t <= todayEnd) {
      isToday = true;
    }

    const st = String(r?.status || '').toUpperCase();
    let type = 'P', label = 'P', color = '#22c55e';
    if (st.includes('DUTY') || st === 'DL') { type = 'DL'; label = 'D'; color = '#eab308'; }
    else if (st.includes('MEDIC') || st === 'ML' || st.includes('SICK')) { type = 'ML'; label = 'M'; color = '#06b6d4'; }
    else if (st.includes('ABSENT') || st === 'A' || st.includes('LEAVE')) { type = 'A'; label = 'A'; color = '#ef4444'; }
    
    return { type, label, color, isToday, rawDate: r?.date || 'undefined', parsedT: t };
  });
}

function getCurrentDay() {
  const dayIndex = new Date().getDay();
  const daysMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return daysMap[dayIndex];
}

function parseTimeRange(timeStr: string) {
  try {
    const parts = timeStr.split(/[-–—]| to /i).map(s => s?.trim() || '');
    const startOriginal = parts[0] || '';
    const endOriginal = parts[1] || '';
    
    const parsePart = (originalPart: string) => {
      if (!originalPart) return 0;
      const cleanPart = originalPart.replace(/AM|PM/gi, '').trim();
      let [hoursStr, minutesStr] = cleanPart.split(':');
      let hours = parseInt((hoursStr || '').replace(/\D/g, ''), 10) || 0;
      let minutes = parseInt((minutesStr || '').replace(/\D/g, ''), 10) || 0;
      
      const isExplicitPM = /PM/i.test(originalPart);
      const isExplicitAM = /AM/i.test(originalPart);
      
      if (isExplicitPM && hours < 12) {
        hours += 12;
      } else if (!isExplicitAM && !isExplicitPM && hours >= 1 && hours <= 7) {
        hours += 12; // Standard university afternoon range
      }
      return hours * 60 + minutes;
    };
    
    const start = parsePart(startOriginal);
    let end = parsePart(endOriginal);
    if (end === 0 && start > 0) end = start + 120; // Default 2 hours for exams
    
    return { start, end };
  } catch (e) {
    return { start: 0, end: 0 };
  }
}

function getExamsForDate(datesheet: any[], dateObj: Date) {
  if (!datesheet || !Array.isArray(datesheet) || datesheet.length === 0) return [];
  
  const day = dateObj.getDate().toString().padStart(2, '0');
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[dateObj.getMonth()];
  const year = dateObj.getFullYear();
  const dateStr = `${day} ${month} ${year}`;
  
  const exams = datesheet.filter(d => {
    const examDate = d['Exam Date'] || d['Exam_Date'] || d['Date'] || '';
    return examDate.trim() === dateStr;
  });
  
  return exams.map(e => {
    let rawTime = e['Exam Timing'] || e['Exam_Timing'] || '09:00';
    if (!rawTime.includes('-')) {
       // Append 2 hours end time for display purposes if missing
       const startParts = rawTime.split(':');
       if (startParts.length === 2) {
          const h = parseInt(startParts[0], 10);
          const endH = h + 2;
          rawTime = `${rawTime} - ${endH.toString().padStart(2, '0')}:${startParts[1]}`;
       }
    }
    
    return {
      subjectName: `${e['Course Name'] || e['course name'] || 'Exam'} (${e['Autoconducttype'] || 'EXAM'})`,
      teacher: `Mode: ${e['Mode OF Exam'] || e['Mode Of Exam'] || 'Offline'}`,
      time: rawTime,
      room: `Venue: ${e['Exam Venue'] || e['Exam_Venue'] || 'TBD'}`,
      group: e['course code'] || e['Course Code'] || '',
      isExam: true
    };
  });
}

function CurrentClassWidget() {
  const colors = useThemeStore((s) => s.colors);
  const { timetable, subjects, detailedAttendanceCache, datesheet } = useStudyOSStore();
  const today = getCurrentDay();
  
  const examsToday = getExamsForDate(datesheet, new Date());
  const classesToday = examsToday.length > 0 ? examsToday : (timetable[today] || []);
  
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  let activeClass: any = null;
  let nextClass: any = null;

  for (let cls of classesToday) {
    const { start, end } = parseTimeRange(cls.time);
    if (currentMinutes >= start && currentMinutes < end) {
      activeClass = cls;
      break;
    } else if (currentMinutes < start) {
      if (!nextClass || start < parseTimeRange(nextClass.time).start) {
        nextClass = cls;
      }
    }
  }

  const displayClass = activeClass || nextClass;
  const isOngoing = !!activeClass;

  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isOngoing && displayClass) {
      const { start, end } = parseTimeRange(displayClass.time);
      const totalMinutes = end - start;
      const elapsedMinutes = currentMinutes - start;
      const progress = totalMinutes > 0 ? Math.max(0, Math.min(1, elapsedMinutes / totalMinutes)) : 0;
      
      Animated.timing(progressAnim, {
        toValue: progress,
        duration: 1500,
        useNativeDriver: false
      }).start();
    }
  }, [isOngoing, currentMinutes, displayClass]);

  if (!displayClass) {
    if (classesToday.length === 0) {
      return (
        <View style={{ marginBottom: Spacing.xl }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md, marginTop: Spacing.sm }}>
            <Text style={{ color: colors.text, fontSize: 18, fontFamily: 'SpaceGrotesk_600SemiBold',  }}>Today's Schedule </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: 'Inter_500Medium' }}>No classes</Text>
          </View>
          <View style={{
            backgroundColor: colors.surfaceHigh,
            borderRadius: Radius.lg,
            padding: Spacing.lg,
            borderWidth: 1,
            borderColor: colors.border,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ backgroundColor: colors.border, padding: 8, borderRadius: 20, marginRight: 12 }}>
                <Ionicons name="cafe-outline" size={20} color={colors.textMuted} />
              </View>
              <View>
                <Text style={{ color: colors.text, fontSize: 16, fontFamily: 'SpaceGrotesk_700Bold',  }}>No Classes Today!</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13, fontFamily: 'Inter_500Medium' }}>Enjoy your free time.</Text>
              </View>
            </View>
          </View>
        </View>
      );
    }
    
    // Classes exist today, but they are all in the past
    return (
      <View style={{ marginBottom: Spacing.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md, marginTop: Spacing.sm }}>
          <Text style={{ color: colors.text, fontSize: 18, fontFamily: 'SpaceGrotesk_600SemiBold',  }}>Today's Schedule </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: 'Inter_500Medium' }}>Completed</Text>
        </View>
        <View style={{
          backgroundColor: colors.surfaceHigh,
          borderRadius: Radius.lg,
          padding: Spacing.lg,
          borderWidth: 1,
          borderColor: colors.border,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ backgroundColor: colors.border, padding: 8, borderRadius: 20, marginRight: 12 }}>
              <Ionicons name="checkmark-done" size={20} color={colors.textMuted} />
            </View>
            <View>
              <Text style={{ color: colors.text, fontSize: 16, fontFamily: 'SpaceGrotesk_700Bold',  }}>All Done for Today!</Text>
              <Text style={{ color: colors.textMuted, fontSize: 13, fontFamily: 'Inter_500Medium' }}>You have completed {classesToday.length} classes today.</Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // Resolve full subject name
  let rawSubjectName = displayClass.subjectName; // e.g. "25CSH-211 (Lab)"
  let baseCode = rawSubjectName.split(' ')[0]; // "25CSH-211"
  let suffix = rawSubjectName.substring(baseCode.length); // " (Lab)"
  
  const matchedSubject = subjects?.find(s => s.code === baseCode);
  const fullNameToDisplay = matchedSubject ? `${matchedSubject.name}${suffix}` : rawSubjectName;
  const history = matchedSubject ? getHistoryStatuses(detailedAttendanceCache?.[matchedSubject.code]) : [];

  let whatIfAttend = null;
  let whatIfMiss = null;
  let attendPctNum = 0;
  let missPctNum = 0;
  let currentPctNum = 0;
  if (matchedSubject && typeof matchedSubject.attendedClasses === 'number' && typeof matchedSubject.totalClasses === 'number') {
    const A = matchedSubject.attendedClasses;
    const T = matchedSubject.totalClasses;
    currentPctNum = T > 0 ? (A / T) * 100 : 0;
    attendPctNum = ((A + 1) / (T + 1)) * 100;
    missPctNum = ((A / (T + 1)) * 100);
    whatIfAttend = attendPctNum.toFixed(1) + '%';
    whatIfMiss = missPctNum.toFixed(1) + '%';
  }

  return (
    <View style={{ marginBottom: 16 }}>
      {/* Section Header positioned above tile just like Your Subjects */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: colors.text, fontSize: 18, fontFamily: 'SpaceGrotesk_600SemiBold',  }}>
            {isOngoing ? 'Ongoing Class' : 'Upcoming Class'}
          </Text>
          <View style={{ backgroundColor: isOngoing ? '#22c55e20' : colors.primary + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full }}>
            <Text style={{ color: isOngoing ? '#22c55e' : colors.primary, fontSize: 10, fontFamily: 'Inter_700Bold' }}>
              {isOngoing ? 'LIVE' : 'SCHEDULED'}
            </Text>
          </View>
        </View>
      </View>

      <View style={{
        backgroundColor: colors.surfaceHigh,
        borderRadius: Radius.lg,
        borderLeftWidth: 4,
        borderColor: isOngoing ? '#22c55e' : colors.primary,
        borderWidth: 1,
        borderTopColor: colors.border,
        borderRightColor: colors.border,
        borderBottomColor: colors.border,
        overflow: 'hidden',
      }}>
        {/* Absolute Progress Background */}
        {isOngoing && (
          <Animated.View style={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            backgroundColor: '#22c55e15',
            borderTopRightRadius: Radius.lg,
            borderBottomRightRadius: Radius.lg,
            width: progressAnim.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%']
            })
          }} />
        )}

        {/* Card Content - Optimized height & compact padding */}
        <View style={{ paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }}>
              <Text style={{ color: colors.text, fontSize: 14.5, fontFamily: 'SpaceGrotesk_700Bold', flex: 1,  }}>{fullNameToDisplay}</Text>
            </View>
            
            {!!matchedSubject && (
              <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: 'Inter_500Medium', marginBottom: 4 }}>
                {rawSubjectName}
              </Text>
            )}
            
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="time-outline" size={13} color={colors.textMuted} style={{ marginRight: 5 }} />
              <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: 'Inter_500Medium' }}>{displayClass.time}</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: colors.border + '80', marginLeft: 6 }}>
            {matchedSubject && typeof matchedSubject.attendancePercentage === 'number' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                  <CircularProgress 
                     value={matchedSubject.attendancePercentage} 
                     color={matchedSubject.attendancePercentage < 75 ? '#ef4444' : '#22c55e'} 
                  />
                  <Text style={{ color: colors.text, fontSize: 11, fontFamily: 'SpaceGrotesk_700Bold', marginTop: 2, minWidth: 60, textAlign: 'center', paddingHorizontal: 4 }}>
                    {matchedSubject.attendedClasses}/{matchedSubject.totalClasses}
                  </Text>
                </View>

                
              </View>
            ) : (
              <View style={{ padding: 10 }}>
                 <Ionicons name="school-outline" size={26} color={colors.textMuted} />
              </View>
            )}
          </View>
        </View>
        
        {/* What-If Prediction Strip - Visual Layout */}
        {matchedSubject && whatIfAttend && whatIfMiss && (
          <View style={{ flexDirection: 'row', padding: 12, backgroundColor: colors.surfaceHigh, borderTopWidth: 1, borderTopColor: colors.border + '50' }}>
            
            {/* If Attend Block */}
            <View style={{ flex: 1, paddingRight: 12, borderRightWidth: 1, borderRightColor: colors.border + '50' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="checkmark-circle" size={14} color="#22c55e" style={{ marginRight: 4 }} />
                    <Text style={{ fontSize: 10.5, color: colors.textMuted, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase' }}>If Attend</Text>
                  </View>
                  <Text style={{ fontSize: 14, color: '#22c55e', fontFamily: 'SpaceGrotesk_700Bold',  }}>{whatIfAttend}</Text>
                </View>
              {/* Visual Bar */}
              <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden', flexDirection: 'row' }}>
                 <View style={{ height: '100%', width: `${Math.min(currentPctNum, 100)}%`, backgroundColor: '#22c55e', opacity: 0.4 }} />
                 <View style={{ height: '100%', width: `${Math.max(0, attendPctNum - currentPctNum)}%`, backgroundColor: '#22c55e' }} />
              </View>
            </View>

            {/* If Miss Block */}
            <View style={{ flex: 1, paddingLeft: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="close-circle" size={14} color="#ef4444" style={{ marginRight: 4 }} />
                    <Text style={{ fontSize: 10.5, color: colors.textMuted, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase' }}>If Miss</Text>
                  </View>
                  <Text style={{ fontSize: 14, color: '#ef4444', fontFamily: 'SpaceGrotesk_700Bold',  }}>{whatIfMiss}</Text>
                </View>
              {/* Visual Bar */}
              <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden', flexDirection: 'row' }}>
                 <View style={{ height: '100%', width: `${Math.min(missPctNum, 100)}%`, backgroundColor: '#ef4444' }} />
                 <View style={{ height: '100%', width: `${Math.max(0, currentPctNum - missPctNum)}%`, backgroundColor: '#ef4444', opacity: 0.3 }} />
              </View>
            </View>

          </View>
        )}
      </View>
    </View>
  );
}

export default function StudyOSDashboard() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isPro, isTrialActive, trialDaysLeft, isSubscribed, isRewardPro, plan } = useSubscription();
  const { roadmaps, profile, subjects, detailedAttendanceCache, isHydrated } = useStudyOSStore();
  const { clearSession, isSessionDisconnected } = useStudySessionStore();
  const [isCalendarVisible, setIsCalendarVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  const [syncKey, setSyncKey] = useState(0);
  const { user } = useUser();
  const [isRewardPremium, setIsRewardPremium] = useState(false);
  const [tokenBalance, setTokenBalance] = useState(0);
  const isPaidOrRewardPro = isSubscribed || isRewardPro || isRewardPremium;
  const isActuallyPro = isPro || isRewardPremium;

  useFocusEffect(
    React.useCallback(() => {
      if (user?.id) {
        getRewardStatus(user.id)
          .then((res: RewardStatus) => {
            setIsRewardPremium(res.is_reward_premium_active);
            setTokenBalance(res.token_balance || 0);
          })
          .catch(() => {});
      }
    }, [user])
  );

  const [selectedSubjectDetails, setSelectedSubjectDetails] = useState<{code: string, name: string, viewActionTarget?: string} | null>(null);
  const [toastState, setToastState] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'present' | 'absent' | 'info';
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });
  // Per-subject "just refreshed / present / absent" badges shown only for the
  // sync that just completed. Cleared at the START of the next pull-to-refresh
  // so the indicator never repeats on a later refresh.
  const [justUpdated, setJustUpdated] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState('All');

  useFocusEffect(
    React.useCallback(() => {
      setShowFilters(false);
      setSubjectFilter('All');
    }, [])
  );
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(20)).current;
  const appState = useRef(AppState.currentState);
  const lastSyncTime = useRef(0);

  const [cookies, setCookies] = useState('');
  const [isServicesMenuVisible, setIsServicesMenuVisible] = useState(true);
  const [selectedFacility, setSelectedFacility] = useState<'hostel' | 'transport' | 'profile' | 'leave' | 'fees' | 'datesheet' | null>(null);
  const [isAttendanceOverviewVisible, setIsAttendanceOverviewVisible] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === 'black' || theme === 'emerald';

  const facilityItems = [
    {
      id: 'profile',
      name: 'Profile',
      icon: 'person' as const,
      color: '#38bdf8',
      onPress: () => setSelectedFacility('profile'),
    },
    {
      id: 'calendar',
      name: 'Calendar',
      icon: 'calendar' as const,
      color: '#a855f7',
      onPress: () => setIsCalendarVisible(true),
    },
    {
      id: 'hostel',
      name: 'Hostel',
      icon: 'bed' as const,
      color: '#f59e0b',
      onPress: () => setSelectedFacility('hostel'),
    },
    {
      id: 'transport',
      name: 'Transport',
      icon: 'bus' as const,
      color: '#10b981',
      onPress: () => setSelectedFacility('transport'),
    },
    {
      id: 'leave',
      name: 'Leaves',
      icon: 'airplane' as const,
      color: '#f43f5e',
      onPress: () => setSelectedFacility('leave'),
    },
    {
      id: 'fees',
      name: 'Fees',
      icon: 'card' as const,
      color: '#c084fc',
      onPress: () => setSelectedFacility('fees'),
    },
    {
      id: 'datesheet',
      name: 'Exams',
      icon: 'document-text' as const,
      color: '#fb923c',
      onPress: () => setSelectedFacility('datesheet'),
    },
    {
      id: 'analytics',
      name: 'Analytics',
      icon: 'stats-chart' as const,
      color: '#06b6d4',
      onPress: () => setIsAttendanceOverviewVisible(true),
    },
  ];

  const { userId } = useAuth();
  const { dbUser } = useDBProfile();

  const fetchNotificationCount = async () => {
    if (!userId) return;
    try {
      const activeSection = dbUser?.section_code || profile?.section || null;
      const data = await fetchNotifications(userId, activeSection || undefined);
      setUnreadCount(data.length);
    } catch (e) {
      console.log('Failed to fetch notifications count', e);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchNotificationCount();
    }, [userId, dbUser?.section_code, profile?.section])
  );

  // Old useEffect removed

  const currentHour = new Date().getHours();
  const greetingText = currentHour < 12 ? 'Good Morning' : currentHour < 17 ? 'Good Afternoon' : 'Good Evening';

  const showToast = (msg: string, options?: { type?: 'present' | 'absent' | 'info', title?: string }) => {
    const type = options?.type || 'info';
    const title = options?.title || (
      type === 'present' ? 'Attendance Marked: Present! 🎉' :
      type === 'absent' ? 'Attendance Alert: Absent! ⚠️' :
      'Attendance Up-To-Date'
    );
    setToastState({
      visible: true,
      title,
      message: msg,
      type,
    });

    if (type === 'present') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else if (type === 'absent') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    } else {
      Haptics.selectionAsync().catch(() => {});
    }

    Animated.parallel([
      Animated.timing(toastOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.spring(toastTranslateY, { toValue: 0, tension: 70, friction: 8, useNativeDriver: true }),
    ]).start();

    setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(toastTranslateY, { toValue: 16, duration: 300, useNativeDriver: true }),
      ]).start(() => {
        setToastState(prev => ({ ...prev, visible: false }));
      });
    }, 3800);
  };

  const triggerSync = (force = true) => {
    const now = Date.now();
    // Debounce: tab-focus AND app-foreground both fire; ignore a second call
    // within 3s so we don't spin up two WebViews back-to-back (the time lag).
    if (now - lastSyncTime.current < 3000) return;
    
    // Wipe previous per-subject "just updated" badges so the indicator from the
    // last refresh never carries over / repeats on this pull-to-refresh.
    setJustUpdated({});

    lastSyncTime.current = now;
    setSyncKey(prev => prev + 1);
    setRefreshing(true);
  };

  // Auto-refresh when user successfully reconnects from a disconnected state
  const wasDisconnected = useRef(isSessionDisconnected);
  useEffect(() => {
    if (wasDisconnected.current && !isSessionDisconnected) {
      console.log('[Dashboard] Reconnected! Triggering auto-refresh...');
      // Small delay to let the toast animation finish and UI settle
      setTimeout(() => triggerSync(true), 1500);
    }
    wasDisconnected.current = isSessionDisconnected;
  }, [isSessionDisconnected]);

  // Auto-sync when app comes to foreground (only if inactive for > 15 mins)
  const lastBackgroundTime = useRef<number>(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState.match(/inactive|background/)) {
        lastBackgroundTime.current = Date.now();
      }
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        const timeInBackground = Date.now() - lastBackgroundTime.current;
        if (timeInBackground > 15 * 60 * 1000) { // 15 mins
          console.log('[Dashboard] App foregrounded after >15m — triggering sync');
          triggerSync(true);
        }
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, []);

  const onRefresh = React.useCallback(() => {
    triggerSync(true);
  }, []);

  const handleSyncFinish = async (updated: boolean, changes?: { code?: string, subjectName: string, status: string, diffAtt?: number, diffTotal?: number, percentage?: number }[]) => {
    setRefreshing(false);

    // Per-subject "just updated" badges — only for the sync that just changed
    // data (cleared on next triggerSync so they never repeat).
    const newJust: Record<string, string> = {};
    if (changes && changes.length > 0) {
      changes.forEach(c => { if (c.code) newJust[c.code] = c.status; });
    }
    setJustUpdated(newJust);

    if (changes && changes.length > 0) {
      const presentChanges = changes.filter(c => c.status === 'Present');
      const absentChanges = changes.filter(c => c.status === 'Absent');
      
      if (presentChanges.length > 0 && absentChanges.length > 0) {
        const pNames = presentChanges.map(c => c.subjectName).join(', ');
        const aNames = absentChanges.map(c => c.subjectName).join(', ');
        
        showToast(`Present: ${pNames} • Absent: ${aNames}`, {
          type: 'present',
          title: 'Attendance Updated! 🎯',
        });

        await Notifications.scheduleNotificationAsync({
          content: {
            title: '🎉 Attendance Marked: Present!',
            body: `Marked Present in: ${pNames}`,
            sound: true,
            color: '#10b981',
          },
          trigger: {
            channelId: 'pathwise-default-v2',
          },
        });

        await Notifications.scheduleNotificationAsync({
          content: {
            title: '⚠️ Attendance Alert: Marked Absent!',
            body: `Marked Absent in: ${aNames}`,
            sound: true,
            color: '#ef4444',
          },
          trigger: {
            channelId: 'pathwise-streak-v2',
          },
        });
      } else if (presentChanges.length > 0) {
        const names = presentChanges.map(c => c.subjectName).join(', ');
        const bodyText = `Marked Present in: ${names}`;
        
        showToast(bodyText, {
          type: 'present',
          title: 'Attendance Marked: Present! 🎉',
        });

        await Notifications.scheduleNotificationAsync({
          content: {
            title: '🎉 Attendance Marked: Present!',
            body: bodyText,
            sound: true,
            color: '#10b981',
          },
          trigger: {
            channelId: 'pathwise-default-v2',
          },
        });
      } else if (absentChanges.length > 0) {
        const names = absentChanges.map(c => c.subjectName).join(', ');
        const bodyText = `Marked Absent in: ${names}`;
        
        showToast(bodyText, {
          type: 'absent',
          title: 'Attendance Alert: Marked Absent ⚠️',
        });

        await Notifications.scheduleNotificationAsync({
          content: {
            title: '⚠️ Attendance Alert: Marked Absent!',
            body: bodyText,
            sound: true,
            color: '#ef4444',
          },
          trigger: {
            channelId: 'pathwise-streak-v2',
          },
        });
      } else {
        showToast('All course records verified with portal', {
          type: 'info',
          title: 'Attendance Synced',
        });
      }
    } else if (updated) {
      showToast('All attendance records are up-to-date', {
        type: 'info',
        title: 'Attendance Synced',
      });
    } else {
      // Even if no values changed, give visual feedback that refresh succeeded
      showToast('All subject records verified with portal', {
        type: 'info',
        title: 'Attendance Up-To-Date',
      });
    }
  };

  const handleSessionExpired = () => {
    setRefreshing(false);
    useStudySessionStore.getState().setSessionExpired(true);
  };

  useEffect(() => {
    SecureStore.getItemAsync('services_menu_closed').then(val => {
      if (val === 'true') setIsServicesMenuVisible(false);
    });

    useStudyOSStore.getState().loadGamification();

    SecureStore.getItemAsync('culko_cookies').then(async c => {
      if (c) setCookies(c);

      const val = await SecureStore.getItemAsync('cleared_buggy_cache_v2');
      if (!val) {
         useStudyOSStore.getState().setScrapedData({ detailedAttendanceCache: {} });
         await SecureStore.setItemAsync('cleared_buggy_cache_v2', 'true');
      }
      
      // trigger sync only after cookies are set
      setTimeout(() => {
          triggerSync(true);
      }, 100);
    });
  }, []);

  useEffect(() => {
    // Hide splash screen after the dashboard has rendered!
    // This prevents the black screen flash.
    setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 100);
  }, []);

  if (!isHydrated) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView 
         contentContainerStyle={styles.content} 
         showsVerticalScrollIndicator={false}
         refreshControl={
           <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
         }
      >
        
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={[styles.owlIcon, { backgroundColor: '#000' }]}>
              {profile?.photoUrl ? (
                <Image 
                  source={{ 
                    uri: profile.photoUrl,
                    ...(profile.photoUrl.startsWith('http') && cookies ? { headers: { Cookie: cookies } } : {})
                  }} 
                  style={{ width: '100%', height: '100%', borderRadius: 12 }} 
                />
              ) : null}
            </View>
            <View style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
              <Text style={styles.greeting} numberOfLines={1}>{greetingText}</Text>
              <Text style={styles.userName} numberOfLines={1} ellipsizeMode="tail">{profile?.name || 'Student'}</Text>
              <Text style={styles.sectionText} numberOfLines={1} ellipsizeMode="tail">{profile?.course || 'No Course Synced'}</Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity 
              activeOpacity={0.8}
              onPress={() => router.push('/(app)/rewards' as any)} 
              style={{ 
                backgroundColor: isPaidOrRewardPro
                  ? '#FBBF24' 
                  : isTrialActive
                    ? colors.primary + '20'
                    : colors.surfaceHigh, 
                flexDirection: 'row', 
                height: 36, 
                paddingHorizontal: 10, 
                justifyContent: 'center', 
                alignItems: 'center', 
                borderRadius: 18, 
                borderWidth: 1, 
                borderColor: isPaidOrRewardPro 
                  ? '#F59E0B' 
                  : isTrialActive
                    ? colors.primary
                    : colors.border, 
                gap: 5,
                flexShrink: 0,
              }}
            >
              {isTrialActive ? (
                <>
                  <Ionicons name="time-outline" size={15} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontFamily: 'SpaceGrotesk_700Bold', fontSize: 12.5 }}>{trialDaysLeft}d</Text>
                </>
              ) : isPaidOrRewardPro ? (
                <>
                  <Ionicons name="star" size={15} color="#fff" />
                  <Text style={{ color: '#fff', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 13 }}>Pro</Text>
                </>
              ) : (
                <>
                  <Ionicons name="sparkles-outline" size={14} color={colors.textDim} />
                  <Text style={{ color: colors.text, fontFamily: 'SpaceGrotesk_700Bold', fontSize: 13 }}>Free</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              activeOpacity={0.75}
              style={{ 
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }} 
              onPress={() => router.push('/(app)/studyos/notifications' as any)}
            >
              <Ionicons name="notifications-outline" size={20} color={colors.text} />
              {unreadCount > 0 && (
                <View style={{
                  position: 'absolute', right: -2, top: -2,
                  backgroundColor: '#ef4444',
                  borderRadius: 9, minWidth: 17, height: 17,
                  justifyContent: 'center', alignItems: 'center',
                  paddingHorizontal: 3, borderWidth: 1.5, borderColor: colors.background
                }}>
                  <Text style={{ color: '#fff', fontSize: 9, fontFamily: 'Inter_700Bold' }}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Modern Glass Facilities Menu */}
        {isServicesMenuVisible && (
          <View style={styles.facilitiesOuterWrapper}>
            <LinearGradient
              colors={
                isDark
                  ? ['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.02)']
                  : ['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.80)']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.facilitiesContainer,
                {
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(0, 0, 0, 0.07)',
                  borderTopColor: isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.95)',
                },
              ]}
            >
              <View style={styles.facilitiesHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={[styles.facilityDot, { backgroundColor: colors.primary }]} />
                  <Text style={[styles.facilitiesHeaderTitle, { color: colors.text }]}>
                    CAMPUS SERVICES
                  </Text>
                </View>
                <View style={[styles.facilityCountBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                  <Text style={[styles.facilitiesHeaderBadge, { color: colors.textMuted }]}>
                    8 Facilities
                  </Text>
                </View>
              </View>

              <View style={styles.facilitiesGrid}>
                {facilityItems.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    activeOpacity={0.72}
                    onPress={() => {
                      try { Haptics.selectionAsync(); } catch {}
                      item.onPress();
                    }}
                    style={styles.facilityItem}
                  >
                    <LinearGradient
                      colors={[`${item.color}25`, `${item.color}0c`]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[
                        styles.facilityIconPod,
                        {
                          borderColor: `${item.color}35`,
                          borderTopColor: `${item.color}70`,
                          shadowColor: item.color,
                        },
                      ]}
                    >
                      <Ionicons name={item.icon} size={22} color={item.color} />
                    </LinearGradient>
                    <Text style={[styles.facilityLabel, { color: colors.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </LinearGradient>
          </View>
        )}

        {/* AI Roadmaps (Added feature) */}
        {roadmaps.length > 0 && (
          <>
            <View style={[styles.sectionHeader, { marginTop: Spacing.xl, marginBottom: Spacing.md }]}>
              <Text style={styles.sectionTitle}>AI Roadmaps</Text>
              <Text style={styles.filterText}>{roadmaps.length} active</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.lg }}>
              {roadmaps.map(roadmap => (
                <View key={roadmap.id} style={styles.roadmapCard}>
                  <Text style={styles.roadmapSubject}>{roadmap.subjectName}</Text>
                  <Text style={styles.roadmapReq} numberOfLines={1}>{roadmap.requirements[0]}</Text>
                  <Text style={styles.roadmapContent} numberOfLines={2}>{roadmap.generatedContent}</Text>
                </View>
              ))}
            </ScrollView>
          </>
        )}

                {/* TEST BUTTON */}


        {/* Current Class Widget */}
        <CurrentClassWidget />

        {/* Your Subjects List */}
        <View style={[styles.sectionHeader, { marginTop: Spacing.md, marginBottom: showFilters ? 12 : Spacing.md }]}>
          <View>
            <Text style={styles.sectionTitle}>Your Subjects </Text>
            <Text style={styles.filterText}>{subjects?.length || 0} subjects total</Text>
          </View>
          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: showFilters ? colors.primary + '20' : colors.surfaceHigh, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, borderColor: showFilters ? colors.primary : colors.border }}
            onPress={() => setShowFilters(!showFilters)}
          >
            <Ionicons name="filter-outline" size={14} color={showFilters ? colors.primary : colors.text} />
            <Text style={{ color: showFilters ? colors.primary : colors.text, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Filter</Text>
          </TouchableOpacity>
        </View>

        {showFilters && (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: Spacing.md, paddingHorizontal: 2 }}>
            {['All', 'Danger', 'Safe'].map(f => (
              <TouchableOpacity 
                key={f}
                onPress={() => setSubjectFilter(f)}
                style={{ 
                  paddingHorizontal: 12, 
                  paddingVertical: 6, 
                  borderRadius: 20, 
                  backgroundColor: subjectFilter === f ? colors.primary : 'transparent',
                  borderWidth: 1,
                  borderColor: subjectFilter === f ? colors.primary : colors.border
                }}
              >
                <Text style={{ color: subjectFilter === f ? '#fff' : colors.textMuted, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>
                   {f === 'Danger' ? 'Danger (< 75%)' : f === 'Safe' ? 'Safe (>= 75%)' : 'All'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {(() => {
           const filteredSubjects = subjects?.filter(sub => {
             if (subjectFilter === 'All') return true;
             if (subjectFilter === 'Danger') return (sub.attendancePercentage || 0) < 75;
             if (subjectFilter === 'Safe') return (sub.attendancePercentage || 0) >= 75;
             return true;
           });
           
           if (!filteredSubjects || filteredSubjects.length === 0) {
             return <Text style={{ color: colors.textMuted, fontFamily: 'Inter_500Medium', textAlign: 'center', padding: 20 }}>No subjects match this filter.</Text>;
           }

           return filteredSubjects.map((sub, idx) => {
          const prediction = getAttendancePrediction(sub.totalClasses || 0, sub.attendedClasses || 0);
          const history = getHistoryStatuses(detailedAttendanceCache?.[sub.code]);
          return (
            <SubjectCard 
              key={idx}
              title={sub.name}
              code={sub.code} 
              credits={sub.credits && sub.credits !== '0' ? `${sub.credits} Credits` : ''}
              status={prediction.text} 
              statusType={prediction.type}
              progress={sub.attendancePercentage || 0} 
              attended={sub.attendedClasses || 0}
              total={sub.totalClasses || 0}
              history={history}
              updateBadge={justUpdated[sub.code]}
              onPress={() => {
                setSelectedSubjectDetails({ code: sub.code, name: sub.name, viewActionTarget: sub.viewActionTarget });
              }}
            />
          );
           });
        })()}
        
        {(!subjects || subjects.length === 0) && (
           <Text style={{ color: colors.textMuted, textAlign: 'center', marginVertical: 20 }}>Syncing subjects from ERP...</Text>
        )}

      </ScrollView>
      
      <AcademicCalendarModal
        visible={isCalendarVisible}
        onClose={() => setIsCalendarVisible(false)}
      />

      {/* AutoSync Attendance */}
      <AutoSyncAttendance 
        key={syncKey}
        onFinish={handleSyncFinish}
        onSessionExpired={handleSessionExpired}
      />

      {/* Facilities Data Scraper Modal */}
      <FacilitiesModal 
        visible={selectedFacility !== null} 
        type={selectedFacility} 
        onClose={() => setSelectedFacility(null)} 
      />

      <AttendanceOverviewModal
        visible={isAttendanceOverviewVisible}
        onClose={() => setIsAttendanceOverviewVisible(false)}
      />

      <DetailedAttendanceModal 
        visible={!!selectedSubjectDetails} 
        onClose={() => setSelectedSubjectDetails(null)} 
        subjectCode={selectedSubjectDetails?.code || ''}
        subjectName={selectedSubjectDetails?.name || ''}
        viewActionTarget={selectedSubjectDetails?.viewActionTarget}
      />

      {toastState.visible && (
        <Animated.View style={[
          styles.toast,
          toastState.type === 'present' && styles.toastPresent,
          toastState.type === 'absent' && styles.toastAbsent,
          toastState.type === 'info' && styles.toastInfo,
          { 
            opacity: toastOpacity, 
            transform: [{ translateY: toastTranslateY }] 
          }
        ]}>
          <View style={[
            styles.toastIconContainer,
            toastState.type === 'present' && { backgroundColor: '#10b98125' },
            toastState.type === 'absent' && { backgroundColor: '#ef444425' },
            toastState.type === 'info' && { backgroundColor: '#3b82f625' },
          ]}>
            <Ionicons 
              name={toastState.type === 'present' ? 'checkmark-circle' : toastState.type === 'absent' ? 'alert-circle' : 'shield-checkmark'} 
              size={22} 
              color={toastState.type === 'present' ? '#10b981' : toastState.type === 'absent' ? '#ef4444' : '#38bdf8'} 
            />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[
              styles.toastTitle,
              toastState.type === 'present' && { color: '#34d399' },
              toastState.type === 'absent' && { color: '#f87171' },
              toastState.type === 'info' && { color: '#ffffff' },
            ]}>
              {toastState.title}
            </Text>
            <Text style={styles.toastSubtitle} numberOfLines={2}>
              {toastState.message}
            </Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

function SubjectCard({ title, code, credits, leaves, status, statusType, progress, attended, total, history, updateBadge, onPress }: any) {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const showHistoryDates = useStudyOSStore(s => s.showHistoryDates);
  const isDanger = statusType === 'danger';
  const isNeutral = statusType === 'neutral';
  const color = isDanger ? '#ef4444' : isNeutral ? colors.textMuted : '#22c55e';

  // Per-subject "just refreshed" badge — only shows for the sync that changed it.
  let badgeText = '';
  let badgeBg = '#22c55e20';
  let badgeColor = '#22c55e';
  
  if (updateBadge === 'Present') { badgeText = '✓ Present'; }
  else if (updateBadge === 'Absent') { badgeText = '● Absent'; badgeBg = '#ef444420'; badgeColor = '#ef4444'; }
  else if (updateBadge === 'Updated') { badgeText = '↻ Updated'; badgeBg = '#3b82f620'; badgeColor = '#3b82f6'; }
  else if (updateBadge) { badgeText = '✓ Refreshed'; }
  
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={StyleSheet.flatten([styles.subjectCard, { borderLeftWidth: 3, borderLeftColor: color }])}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={styles.subCardTitle}>{title}</Text>
        <Text style={styles.subCardMeta}>{code}{credits ? ` • ${credits}` : ''}</Text>
        {badgeText ? (
          <View style={[styles.subCardStatusPill, { backgroundColor: badgeBg, marginTop: 4 }]}>
            <Ionicons name={updateBadge === 'Absent' ? 'close-circle' : 'checkmark-circle'} size={13} color={badgeColor} />
            <Text style={[styles.subCardStatusText, { color: badgeColor }]}>{badgeText}</Text>
          </View>
        ) : (
          <View style={StyleSheet.flatten([styles.subCardStatusPill, { backgroundColor: isDanger ? '#ef444420' : isNeutral ? '#333333' : '#22c55e20' }])}>
            <Ionicons name={isDanger ? "close-circle" : isNeutral ? "information-circle" : "checkmark-circle"} size={14} color={color} />
            <Text style={StyleSheet.flatten([styles.subCardStatusText, { color }])}>{status}</Text>
          </View>
        )}
      </View>
      
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress value={progress} color={color} />
          <Text style={styles.subCardFraction}>{attended}/{total}</Text>
        </View>
        
        {history && history.length > 0 && (
          <View style={{ 
            justifyContent: 'center', 
            alignItems: showHistoryDates ? 'flex-start' : 'center', 
            marginLeft: 10, 
            gap: 3.5,
            width: showHistoryDates ? 50 : undefined 
          }}>
            {history.map((h: any, idx: number) => {
              const dateObj = new Date(h.parsedT);
              const shortDate = !isNaN(dateObj.getTime()) ? dateObj.getDate() + ' ' + dateObj.toLocaleString('default', { month: 'short' }) : '?';

              const dotContent = h.isToday ? (
                <View 
                  style={{ 
                    width: 14, 
                    height: 14, 
                    borderRadius: 7, 
                    borderWidth: 1.5,
                    borderColor: h.color,
                    backgroundColor: 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: showHistoryDates ? 0 : 1
                  }}
                >
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: h.color }} />
                </View>
              ) : (
                <View 
                  style={{ 
                    width: 8, 
                    height: 8, 
                    borderRadius: 2.5, 
                    backgroundColor: h.color, 
                    shadowColor: h.color,
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.4,
                    shadowRadius: 1.5,
                    elevation: 2,
                    marginLeft: showHistoryDates && !h.isToday ? 3 : 0
                  }}
                />
              );

              if (showHistoryDates) {
                return (
                  <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {dotContent}
                    <Text style={{ fontSize: 9, color: colors.textMuted, fontFamily: 'Inter_500Medium' }}>{shortDate}</Text>
                  </View>
                );
              }

              return (
                <React.Fragment key={idx}>
                  {dotContent}
                </React.Fragment>
              );
            })}
          </View>
        )}
      </View>

      <View style={{ justifyContent: 'center', marginLeft: 6 }}>
         <Ionicons name="chevron-forward" size={20} color="#666" />
      </View>
    </TouchableOpacity>
  );
}

function CircularProgress({ value, color }: { value: number, color: string }) {
  const colors = useThemeStore((s) => s.colors);
  const roundAttendancePercentage = useStudyOSStore(s => s.roundAttendancePercentage);
  const radius = 24;
  const strokeWidth = 5;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (value / 100) * circumference;
  
  // Format the display value based on the setting
  const displayValue = roundAttendancePercentage 
    ? Math.round(value) 
    : (value % 1 !== 0 ? value.toFixed(2) : value);
  
  // If showing decimals, we might need smaller font so it fits in the circle
  const fontSize = !roundAttendancePercentage && value % 1 !== 0 ? 12 : 16;
  
  return (
    <View style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width="56" height="56" viewBox="0 0 60 60">
        <Circle cx="30" cy="30" r={radius} stroke={colors.border} strokeWidth={strokeWidth} fill="none" />
        <Circle cx="30" cy="30" r={radius} stroke={color} strokeWidth={strokeWidth} fill="none" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" transform="rotate(-90 30 30)" />
      </Svg>
      <Text style={{ position: 'absolute', color: colors.text, fontSize, fontFamily: 'SpaceGrotesk_700Bold',  }}>{displayValue}</Text>
    </View>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: 100 },
  headerRow: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, marginRight: 8 },
  owlIcon: { width: 44, height: 44, backgroundColor: colors.text, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  greeting: { color: colors.textMuted, fontSize: 11.5, fontFamily: 'Inter_500Medium' },
  userName: { color: colors.primary, fontSize: 18, fontFamily: 'SpaceGrotesk_700Bold' },
  sectionText: { color: colors.textDim, fontSize: 11, fontFamily: 'Inter_400Regular' },
  headerRight: { flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: 14, marginRight: 8 },
  
  profileCard: { backgroundColor: colors.surfaceHigh, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.xl },
  profileCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  courseName: { color: '#d1d5db', fontSize: 14, fontFamily: 'SpaceGrotesk_600SemiBold',  },
  cgpaText: { color: colors.textDim, fontSize: 12, position: 'absolute', right: 0, top: 0 },
  mentorText: { color: colors.textMuted, fontSize: 12 },
  cgpaValue: { color: colors.text, fontSize: 16, position: 'absolute', right: 0, fontWeight: 'bold' },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10 },
  
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  upNextBadge: { backgroundColor: '#16653430', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, borderWidth: 1, borderColor: '#166534' },
  upNextText: { color: '#22c55e', fontSize: 10, fontFamily: 'SpaceGrotesk_700Bold',  },
  inTimeText: { color: colors.textMuted, fontSize: 12 },
  
  upNextCard: { backgroundColor: colors.surfaceHigh, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.xl },
  className: { color: colors.text, fontSize: 16, fontFamily: 'SpaceGrotesk_600SemiBold', marginBottom: 4 },
  teacherName: { color: colors.textMuted, fontSize: 13, marginBottom: 12 },
  classDetailsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.lg },
  detailText: { color: colors.textMuted, fontSize: 12, marginLeft: 4, marginRight: 12 },
  attendancePrediction: { flexDirection: 'row', gap: 16, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  predictionSide: { flex: 1 },
  predLabel: { color: colors.textMuted, fontSize: 11, fontFamily: 'Inter_500Medium' },
  predValue: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  predBarBg: { height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' },
  predBarFill: { height: '100%', borderRadius: 2 },
  
  sectionTitle: { color: colors.text, fontSize: 18, fontFamily: 'SpaceGrotesk_600SemiBold',  },
  filterText: { color: colors.textMuted, fontSize: 12 },
  
  subjectCard: { backgroundColor: colors.surfaceHigh, borderRadius: Radius.lg, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
  subCardTitle: { color: colors.text, fontSize: 14.5, fontFamily: 'SpaceGrotesk_600SemiBold', marginBottom: 2 },
  subCardMeta: { color: colors.textDim, fontSize: 11.5, marginBottom: 6 },
  subCardStatusPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full, alignSelf: 'flex-start', gap: 4 },
  subCardStatusText: { fontSize: 10.5, fontFamily: 'Inter_600SemiBold' },
  subCardFraction: { color: colors.textMuted, fontSize: 11, marginTop: 2, fontFamily: 'Inter_500Medium', minWidth: 60, textAlign: 'center', paddingHorizontal: 4 },

  roadmapCard: { backgroundColor: colors.surfaceHigh, borderRadius: Radius.lg, padding: Spacing.lg, width: 250, marginRight: Spacing.md, borderWidth: 1, borderColor: colors.primary + '40' },
  roadmapSubject: { color: colors.text, fontSize: 15, fontFamily: 'SpaceGrotesk_600SemiBold', marginBottom: 4 },
  roadmapReq: { color: colors.primary, fontSize: 12, marginBottom: 8 },
  roadmapContent: { color: '#d1d5db', fontSize: 13, lineHeight: 18 },

  toast: {
    position: 'absolute',
    bottom: 85,
    alignSelf: 'center',
    width: '92%',
    maxWidth: 420,
    backgroundColor: '#18181b',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: Radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.2,
    borderColor: '#27272a',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
    zIndex: 9999,
  },
  toastPresent: {
    backgroundColor: '#06281e',
    borderColor: '#10b98160',
    shadowColor: '#10b981',
  },
  toastAbsent: {
    backgroundColor: '#2d0a0a',
    borderColor: '#ef444460',
    shadowColor: '#ef4444',
  },
  toastInfo: {
    backgroundColor: '#0f172a',
    borderColor: '#38bdf850',
    shadowColor: '#0284c7',
  },
  toastIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 13.5,
    letterSpacing: 0.2,
  },
  toastSubtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: '#cbd5e1',
    marginTop: 2,
    lineHeight: 16,
  },
  toastText: { color: '#ffffff', fontSize: 13.5, fontFamily: 'SpaceGrotesk_700Bold', flexShrink: 1 },
  facilitiesOuterWrapper: {
    marginHorizontal: Spacing.sm,
    marginBottom: Spacing.xl,
    marginTop: -4,
  },
  facilitiesContainer: {
    borderRadius: 24,
    borderWidth: 1.2,
    borderTopWidth: 1.5,
    paddingTop: 14,
    paddingBottom: 16,
    paddingHorizontal: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  facilitiesHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  facilityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  facilitiesHeaderTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 11.5,
    letterSpacing: 0.8,
  },
  facilityCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  facilitiesHeaderBadge: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10.5,
  },
  facilitiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 14,
  },
  facilityItem: {
    width: '25%',
    alignItems: 'center',
  },
  facilityIconPod: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderTopWidth: 1.5,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 3,
  },
  facilityLabel: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 11.5,
    marginTop: 6,
    textAlign: 'center',
  },
});
