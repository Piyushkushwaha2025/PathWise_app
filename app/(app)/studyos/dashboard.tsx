import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, RefreshControl, AppState, Alert, Animated, Image, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing, Radius } from '../../../constants/theme';
import { useThemeStore } from '../../../store/useThemeStore';
import { useStudyOSStore } from '../../../store/studyosStore';
import { useStudySessionStore } from '../../../store/studySessionStore';
import { useRouter, useFocusEffect } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import * as Notifications from 'expo-notifications';
import { AutoSyncAttendance } from '../../../components/AutoSyncAttendance';
import { DetailedAttendanceModal } from '../../../components/DetailedAttendanceModal';
import { FacilitiesModal } from '../../../components/FacilitiesModal';
import * as SecureStore from 'expo-secure-store';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { fetchNotifications, useDBProfile } from '../../../lib/db';

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

function getHistoryStatuses(records?: any[], total = 0, attended = 0) {
  if (records && records.length > 0) {
    const recent = records.slice(-5);
    return recent.map((r: any) => {
      const st = (r.status || '').toUpperCase();
      if (st.includes('DUTY') || st.includes('DL') || st.includes('ON DUTY')) return { type: 'DL', label: 'D', color: '#eab308' };
      if (st.includes('MEDIC') || st.includes('ML') || st.includes('SICK')) return { type: 'ML', label: 'M', color: '#06b6d4' };
      if (st.includes('ABSENT') || st === 'A' || st.includes('LEAVE')) return { type: 'A', label: 'A', color: '#ef4444' };
      return { type: 'P', label: 'P', color: '#22c55e' };
    });
  }
  
  if (total === 0) return [];
  const count = Math.min(total, 5);
  const ratio = total > 0 ? attended / total : 0;
  const presentCount = Math.round(count * ratio);
  const arr = [];
  for (let i = 0; i < count; i++) {
    if (i < presentCount) {
      arr.push({ type: 'P', label: 'P', color: '#22c55e' });
    } else {
      arr.push({ type: 'A', label: 'A', color: '#ef4444' });
    }
  }
  return arr.reverse();
}

function getCurrentDay() {
  const dayIndex = new Date().getDay();
  const daysMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return daysMap[dayIndex];
}

function parseTimeRange(timeStr: string) {
  try {
    if (!timeStr) return { start: 0, end: 0 };
    const cleanStr = timeStr.replace(/AM|PM/gi, '').trim();
    const [startStr, endStr] = cleanStr.split('-').map(s => s.trim());
    
    const parsePart = (str: string, originalPart: string = '') => {
      if (!str) return 0;
      let [hoursStr, minutesStr] = str.split(':');
      let hours = parseInt((hoursStr || '').replace(/\D/g, ''), 10) || 0;
      let minutes = parseInt((minutesStr || '').replace(/\D/g, ''), 10) || 0;
      
      const isExplicitPM = /PM/i.test(originalPart || timeStr);
      const isExplicitAM = /AM/i.test(originalPart || timeStr);
      
      if (isExplicitPM && hours < 12) {
        hours += 12;
      } else if (!isExplicitAM && !isExplicitPM && hours >= 1 && hours <= 7) {
        hours += 12; // Standard university afternoon range
      }
      return hours * 60 + minutes;
    };
    return { start: parsePart(startStr), end: parsePart(endStr) };
  } catch (e) {
    return { start: 0, end: 0 };
  }
}

function CurrentClassWidget() {
  const colors = useThemeStore((s) => s.colors);
  const { timetable, subjects, detailedAttendanceCache } = useStudyOSStore();
  const today = getCurrentDay();
  const classesToday = timetable[today] || [];
  
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
            <Text style={{ color: colors.text, fontSize: 18, fontFamily: 'SpaceGrotesk_600SemiBold' }}>Today's Schedule</Text>
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
                <Text style={{ color: colors.text, fontSize: 16, fontFamily: 'SpaceGrotesk_700Bold' }}>No Classes Today!</Text>
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
          <Text style={{ color: colors.text, fontSize: 18, fontFamily: 'SpaceGrotesk_600SemiBold' }}>Today's Schedule</Text>
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
              <Text style={{ color: colors.text, fontSize: 16, fontFamily: 'SpaceGrotesk_700Bold' }}>All Done for Today!</Text>
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
  const history = matchedSubject ? getHistoryStatuses(detailedAttendanceCache?.[matchedSubject.code], matchedSubject.totalClasses || 0, matchedSubject.attendedClasses || 0) : [];

  return (
    <View style={{ marginBottom: 16 }}>
      {/* Section Header positioned above tile just like Your Subjects */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: colors.text, fontSize: 18, fontFamily: 'SpaceGrotesk_600SemiBold' }}>
            {isOngoing ? 'Ongoing' : 'Up Next'}
          </Text>
          <View style={{ backgroundColor: isOngoing ? '#22c55e20' : colors.primary + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full }}>
            <Text style={{ color: isOngoing ? '#22c55e' : colors.primary, fontSize: 10, fontFamily: 'Inter_700Bold' }}>
              {isOngoing ? 'LIVE' : 'SCHEDULED'}
            </Text>
          </View>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: 'Inter_500Medium' }}>Today's Schedule</Text>
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <Text style={{ color: colors.text, fontSize: 14.5, fontFamily: 'SpaceGrotesk_700Bold', flex: 1, paddingRight: 4 }}>{fullNameToDisplay}</Text>
            </View>
            
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
              <Ionicons name="time-outline" size={13} color={colors.textMuted} style={{ marginRight: 5 }} />
              <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: 'Inter_500Medium' }}>{displayClass.time}</Text>
            </View>
            
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="location-outline" size={13} color={colors.textMuted} style={{ marginRight: 5 }} />
              <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: 'Inter_500Medium' }}>
                {displayClass.room} • {displayClass.teacher}
              </Text>
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
                  <Text style={{ color: colors.text, fontSize: 11, fontFamily: 'SpaceGrotesk_700Bold', marginTop: 2 }}>
                    {matchedSubject.attendedClasses}/{matchedSubject.totalClasses}
                  </Text>
                </View>

                {history && history.length > 0 && (
                  <View style={{ justifyContent: 'center', alignItems: 'center', marginLeft: 10, gap: 3.5 }}>
                    {history.map((h: any, idx: number) => (
                      <View 
                        key={idx} 
                        style={{ 
                          width: 8, 
                          height: 8, 
                          borderRadius: 2.5, 
                          backgroundColor: h.color, 
                          shadowColor: h.color,
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.4,
                          shadowRadius: 1.5,
                          elevation: 2
                        }}
                      />
                    ))}
                  </View>
                )}
              </View>
            ) : (
              <View style={{ padding: 10 }}>
                 <Ionicons name="school-outline" size={26} color={colors.textMuted} />
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

export default function StudyOSDashboard() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const router = useRouter();
  const { roadmaps, profile, subjects, detailedAttendanceCache } = useStudyOSStore();
  const { clearSession } = useStudySessionStore();
  const [isCalendarVisible, setIsCalendarVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isSessionModalVisible, setIsSessionModalVisible] = useState(false);
  const [syncKey, setSyncKey] = useState(0);
  const [toastVisible, setToastVisible] = useState(false);
  const [selectedSubjectDetails, setSelectedSubjectDetails] = useState<{code: string, name: string, viewActionTarget?: string} | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  // Per-subject "just refreshed / present / absent" badges shown only for the
  // sync that just completed. Cleared at the START of the next pull-to-refresh
  // so the indicator never repeats on a later refresh.
  const [justUpdated, setJustUpdated] = useState<Record<string, string>>({});
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const appState = useRef(AppState.currentState);
  const lastSyncTime = useRef(0);
  // Signature of the last attendance change we already notified about, so a
  // repeated/unchanged refresh does not fire the same push notification again.
  const lastNotifSigRef = useRef<string>('');

  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [currentMonth, setCurrentMonth] = useState(todayStr.substring(0, 7));
  const [cookies, setCookies] = useState('');
  const [isServicesMenuVisible, setIsServicesMenuVisible] = useState(true);
  const [selectedFacility, setSelectedFacility] = useState<'hostel' | 'transport' | 'profile' | 'leave' | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

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

  useEffect(() => {
    SecureStore.getItemAsync('culko_cookies').then(c => {
      if (c) setCookies(c);
    });
    SecureStore.getItemAsync('services_menu_closed').then(val => {
      if (val === 'true') setIsServicesMenuVisible(false);
    });
  }, []);

  const currentHour = new Date().getHours();
  const greetingText = currentHour < 12 ? 'Good Morning' : currentHour < 17 ? 'Good Afternoon' : 'Good Evening';

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(3500),
      Animated.timing(toastOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setToastVisible(false));
  };

  const triggerSync = (force = true) => {
    // Wipe previous per-subject "just updated" badges so the indicator from the
    // last refresh never carries over / repeats on this pull-to-refresh.
    setJustUpdated({});
    lastSyncTime.current = Date.now();
    setSyncKey(prev => prev + 1);
    setRefreshing(true);
  };

  // Auto-sync when app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        console.log('[Dashboard] App foregrounded — triggering attendance sync');
        triggerSync(true);
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, []);

  const onRefresh = React.useCallback(() => {
    triggerSync(true);
  }, []);

  const handleSyncFinish = async (updated: boolean, changes?: { code?: string, subjectName: string, status: string }[]) => {
    setRefreshing(false);

    // Build per-subject badges for subjects that actually changed this sync.
    // Cleared on the next triggerSync(), so they only show once (no repeat).
    const newJust: Record<string, string> = {};
    if (changes && changes.length > 0) {
      changes.forEach(c => { if (c.code) newJust[c.code] = c.status; });
    }
    setJustUpdated(newJust);

    if (changes && changes.length > 0) {
      const presentChanges = changes.filter(c => c.status === 'Present' || c.status === 'Updated');
      const subjectNames = (presentChanges.length > 0 ? presentChanges : changes).map(c => c.subjectName).join(', ');
      
      showToast(`✨ Marked Present in ${subjectNames.length > 28 ? subjectNames.substring(0, 28) + '...' : subjectNames}`);

      // Dedup push notification: only fire if this exact change set hasn't been
      // notified already (e.g. consecutive refreshes returning identical data).
      const sig = changes.map(c => `${c.code || c.subjectName}:${c.status}`).sort().join('|');
      if (sig && sig !== lastNotifSigRef.current) {
        lastNotifSigRef.current = sig;
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "Attendance Marked! 🎯",
            body: `Marked Present in: ${subjectNames}. Your attendance is updated!`,
            sound: true,
          },
          trigger: null,
        });
      }
    } else if (updated) {
      showToast('✨ Attendance Synced & Marked Up-To-Date!');
    } else {
      // Even if no values changed, give visual feedback that refresh succeeded
      showToast('✨ Attendance Refreshed & Verified!');
    }
  };

  const handleSessionExpired = () => {
    setRefreshing(false);
    setIsSessionModalVisible(true);
  };

  useFocusEffect(
    React.useCallback(() => {
      // Trigger sync whenever user navigates or opens the app
      triggerSync(true);
    }, [])
  );

  useEffect(() => {
    if (isCalendarVisible) {
      const today = new Date().toISOString().split('T')[0];
      setSelectedDate(today);
      setCurrentMonth(today.substring(0, 7));
    }
  }, [isCalendarVisible]);

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
            <View>
              <Text style={styles.greeting}>{greetingText}</Text>
              <Text style={styles.userName}>{profile?.name || 'Student'}</Text>
              <Text style={styles.sectionText}>{profile?.course || 'No Course Synced'}</Text>
            </View>
          </View>

          <View style={styles.headerRight}>
                <TouchableOpacity style={{ marginLeft: 16 }} onPress={() => router.push('/studyos/notifications' as any)}>
                  <View>
                    <Ionicons name="notifications-outline" size={26} color={colors.text} />
                    {unreadCount > 0 && (
                      <View style={{
                        position: 'absolute', right: -4, top: -4,
                        backgroundColor: '#ef4444',
                        borderRadius: 10, minWidth: 18, height: 18,
                        justifyContent: 'center', alignItems: 'center',
                        paddingHorizontal: 4, borderWidth: 1.5, borderColor: colors.background
                      }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontFamily: 'Inter_700Bold' }}>
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={{ marginLeft: 16 }} onPress={() => {
                  LayoutAnimation.configureNext({
                    duration: 80,
                    create: { type: 'easeOut', property: 'opacity' },
                    update: { type: 'easeOut' },
                    delete: { type: 'easeOut', property: 'opacity' },
                  });
                  const newValue = !isServicesMenuVisible;
                  setIsServicesMenuVisible(newValue);
                  if (!newValue) {
                    SecureStore.setItemAsync('services_menu_closed', 'true');
                  } else {
                    SecureStore.deleteItemAsync('services_menu_closed');
                  }
                }}>
                  <Ionicons name="menu" size={28} color={colors.text} />
                </TouchableOpacity>
          </View>
        </View>

        {/* Inline Services Menu */}
        {isServicesMenuVisible && (
          <View style={[styles.inlineServicesContainer, { backgroundColor: colors.surfaceHigh, shadowColor: colors.primary }]}>
            <TouchableOpacity style={[styles.inlineServiceIcon, { backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}30` }]} onPress={() => setSelectedFacility('profile')}>
              <Ionicons name="person" size={24} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.inlineServiceIcon, { backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}30` }]} onPress={() => setIsCalendarVisible(true)}>
              <Ionicons name="calendar-outline" size={24} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.inlineServiceIcon, { backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}30` }]} onPress={() => setSelectedFacility('hostel')}>
              <Ionicons name="bed" size={24} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.inlineServiceIcon, { backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}30` }]} onPress={() => setSelectedFacility('transport')}>
              <Ionicons name="bus" size={24} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.inlineServiceIcon, { backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}30` }]} onPress={() => setSelectedFacility('leave')}>
              <Ionicons name="airplane" size={24} color={colors.primary} />
            </TouchableOpacity>
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

        {/* Current Class Widget */}
        <CurrentClassWidget />

        {/* Your Subjects List */}
        <View style={[styles.sectionHeader, { marginTop: Spacing.md, marginBottom: Spacing.md }]}>
          <View>
            <Text style={styles.sectionTitle}>Your Subjects</Text>
            <Text style={styles.filterText}>{subjects?.length || 0} subjects</Text>
          </View>
        </View>

        {subjects && subjects.length > 0 ? subjects.map((sub, idx) => {
          const prediction = getAttendancePrediction(sub.totalClasses || 0, sub.attendedClasses || 0);
          const history = getHistoryStatuses(detailedAttendanceCache?.[sub.code], sub.totalClasses || 0, sub.attendedClasses || 0);
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
        }) : (
           <Text style={{ color: colors.textMuted, textAlign: 'center', marginVertical: 20 }}>Syncing subjects from ERP...</Text>
        )}

      </ScrollView>
      
      <Modal visible={isCalendarVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setIsCalendarVisible(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.xl, paddingTop: 60, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View>
              <Text style={{ color: colors.text, fontSize: 22, fontFamily: 'SpaceGrotesk_700Bold' }}>Academic Calendar</Text>
              <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4 }}>Session 2026-27 • Chandigarh University</Text>
            </View>
            <TouchableOpacity onPress={() => setIsCalendarVisible(false)} style={{ backgroundColor: colors.surfaceHigh, padding: 8, borderRadius: 20 }}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.lg, gap: Spacing.xl }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#22c55e' }}/><Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: 'Inter_500Medium' }}>Holiday</Text></View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#ef4444' }}/><Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: 'Inter_500Medium' }}>Exam</Text></View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }}/><Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: 'Inter_500Medium' }}>Event</Text></View>
          </View>
          
          <Calendar
            key={isCalendarVisible ? 'opened' : 'closed'}
            current={selectedDate}
            minDate={'2026-07-01'}
            maxDate={'2026-12-31'}
            onDayPress={(day: any) => setSelectedDate(day.dateString)}
            onMonthChange={(month: any) => setCurrentMonth(month.dateString.substring(0, 7))}
            hideExtraDays={true}
            markedDates={{
              ...markedDates,
              [selectedDate]: { ...(markedDates[selectedDate] || {}), selected: true, selectedColor: colors.primary + '40' }
            }}
            theme={{
              backgroundColor: colors.background,
              calendarBackground: colors.background,
              textSectionTitleColor: colors.textMuted,
              selectedDayBackgroundColor: colors.primary + '40',
              selectedDayTextColor: colors.text,
              todayTextColor: colors.primary,
              dayTextColor: colors.text,
              textDisabledColor: colors.border,
              dotColor: colors.primary,
              arrowColor: colors.text,
              monthTextColor: colors.text,
              indicatorColor: colors.primary,
            }}
          />
          <ScrollView style={{ flex: 1, padding: Spacing.lg, backgroundColor: colors.background }}>
            <Text style={{ color: colors.text, fontSize: 18, fontFamily: 'SpaceGrotesk_700Bold', marginBottom: 12 }}>
              Events for this Month
            </Text>
            {Object.keys(agendaItems).filter(date => date.startsWith(currentMonth)).flatMap(date => agendaItems[date]).length > 0 ? (
              Object.keys(agendaItems).filter(date => date.startsWith(currentMonth)).sort().flatMap(date => agendaItems[date]).map((item: any, i: number) => (
                <View key={i} style={{ flexDirection: 'row', backgroundColor: colors.surfaceHigh, borderRadius: Radius.md, padding: 12, marginBottom: Spacing.md, borderWidth: 1, borderColor: item.isHoliday ? '#22c55e40' : item.isExam ? '#ef444440' : colors.border }}>
                  <View style={{ width: 65, borderRightWidth: 1, borderRightColor: colors.border, paddingRight: 12, marginRight: 12, justifyContent: 'center' }}>
                    <Text style={{ color: colors.text, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>{item.date.split('-')[0]} {item.date.split('-')[1]}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{item.day.substring(0,3)}</Text>
                  </View>
                  <View style={{ flex: 1, justifyContent: 'center' }}>
                    <Text style={{ color: item.isHoliday ? '#22c55e' : item.isExam ? '#ef4444' : colors.text, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>{item.activity}</Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={{ color: '#666', textAlign: 'center', marginTop: 20 }}>No events this month</Text>
            )}
          </ScrollView>
        </View>
      </Modal>

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

      <Modal visible={isSessionModalVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View
            style={{ backgroundColor: colors.surface, padding: 24, borderRadius: 24, width: '100%', borderWidth: 1, borderColor: colors.border }}
          >
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#ef444420', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
              <Ionicons name="key-outline" size={28} color="#ef4444" />
            </View>
            <Text style={{ color: colors.text, fontSize: 20, fontFamily: 'SpaceGrotesk_700Bold', marginBottom: 8 }}>Connection Lost</Text>
            <Text style={{ color: colors.textMuted, fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 22, marginBottom: 24 }}>
              For your security, your connection to the college portal has timed out. Please reconnect to continue syncing your latest academic data.
            </Text>
            
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity 
                style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: colors.surfaceHigh, alignItems: 'center' }}
                onPress={() => setIsSessionModalVisible(false)}
              >
                <Text style={{ color: colors.text, fontFamily: 'Inter_600SemiBold' }}>Not Now</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center' }}
                onPress={async () => {
                   setIsSessionModalVisible(false);
                   await clearSession();
                   router.replace('/(app)' as any);
                }}
              >
                <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold' }}>Reconnect</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <DetailedAttendanceModal 
        visible={!!selectedSubjectDetails} 
        onClose={() => setSelectedSubjectDetails(null)} 
        subjectCode={selectedSubjectDetails?.code || ''}
        subjectName={selectedSubjectDetails?.name || ''}
        viewActionTarget={selectedSubjectDetails?.viewActionTarget}
      />

      {toastVisible && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
          <Ionicons name="checkmark-circle-sharp" size={20} color="#22c55e" style={{ marginRight: 6 }} />
          <Text style={styles.toastText}>{toastMsg}</Text>
        </Animated.View>
      )}
    </View>
  );
}

import { agendaItems, markedDates } from '../../../constants/calendar';

function SubjectCard({ title, code, credits, leaves, status, statusType, progress, attended, total, history, updateBadge, onPress }: any) {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
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
          <View style={{ justifyContent: 'center', alignItems: 'center', marginLeft: 10, gap: 3.5 }}>
            {history.map((h: any, idx: number) => (
              <View 
                key={idx} 
                style={{ 
                  width: 8, 
                  height: 8, 
                  borderRadius: 2.5, 
                  backgroundColor: h.color, 
                  shadowColor: h.color,
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.4,
                  shadowRadius: 1.5,
                  elevation: 2
                }}
              />
            ))}
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
  const radius = 24;
  const strokeWidth = 5;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (value / 100) * circumference;
  
  return (
    <View style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width="56" height="56" viewBox="0 0 60 60">
        <Circle cx="30" cy="30" r={radius} stroke={colors.border} strokeWidth={strokeWidth} fill="none" />
        <Circle cx="30" cy="30" r={radius} stroke={color} strokeWidth={strokeWidth} fill="none" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" transform="rotate(-90 30 30)" />
      </Svg>
      <Text style={{ position: 'absolute', color: colors.text, fontSize: 16, fontFamily: 'SpaceGrotesk_700Bold' }}>{value}</Text>
    </View>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: Spacing.lg, paddingTop: 50, paddingBottom: 100 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  owlIcon: { width: 48, height: 48, backgroundColor: colors.text, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  greeting: { color: colors.textMuted, fontSize: 12, fontFamily: 'Inter_500Medium' },
  userName: { color: colors.primary, fontSize: 20, fontFamily: 'SpaceGrotesk_700Bold' },
  sectionText: { color: colors.textDim, fontSize: 11, fontFamily: 'Inter_400Regular' },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  
  profileCard: { backgroundColor: colors.surfaceHigh, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.xl },
  profileCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  courseName: { color: '#d1d5db', fontSize: 14, fontFamily: 'SpaceGrotesk_600SemiBold' },
  cgpaText: { color: colors.textDim, fontSize: 12, position: 'absolute', right: 0, top: 0 },
  mentorText: { color: colors.textMuted, fontSize: 12 },
  cgpaValue: { color: colors.text, fontSize: 16, position: 'absolute', right: 0, fontWeight: 'bold' },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10 },
  
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  upNextBadge: { backgroundColor: '#16653430', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, borderWidth: 1, borderColor: '#166534' },
  upNextText: { color: '#22c55e', fontSize: 10, fontFamily: 'SpaceGrotesk_700Bold' },
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
  
  sectionTitle: { color: colors.text, fontSize: 18, fontFamily: 'SpaceGrotesk_600SemiBold' },
  filterText: { color: colors.textMuted, fontSize: 12 },
  
  subjectCard: { backgroundColor: colors.surfaceHigh, borderRadius: Radius.lg, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
  subCardTitle: { color: colors.text, fontSize: 14.5, fontFamily: 'SpaceGrotesk_600SemiBold', marginBottom: 2 },
  subCardMeta: { color: colors.textDim, fontSize: 11.5, marginBottom: 6 },
  subCardStatusPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full, alignSelf: 'flex-start', gap: 4 },
  subCardStatusText: { fontSize: 10.5, fontFamily: 'Inter_600SemiBold' },
  subCardFraction: { color: colors.textMuted, fontSize: 11, marginTop: 2, fontFamily: 'Inter_500Medium' },

  roadmapCard: { backgroundColor: colors.surfaceHigh, borderRadius: Radius.lg, padding: Spacing.lg, width: 250, marginRight: Spacing.md, borderWidth: 1, borderColor: colors.primary + '40' },
  roadmapSubject: { color: colors.text, fontSize: 15, fontFamily: 'SpaceGrotesk_600SemiBold', marginBottom: 4 },
  roadmapReq: { color: colors.primary, fontSize: 12, marginBottom: 8 },
  roadmapContent: { color: '#d1d5db', fontSize: 13, lineHeight: 18 },

  toast: {
    position: 'absolute',
    bottom: 85,
    alignSelf: 'center',
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1.5,
    borderColor: '#22c55e',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
  },
  toastText: { color: colors.text, fontSize: 13, fontFamily: 'SpaceGrotesk_600SemiBold' },
  inlineServicesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: Spacing.xl,
    marginHorizontal: Spacing.sm,
    marginBottom: Spacing.xl,
    marginTop: -4,
    borderRadius: Radius.xl,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  inlineServiceIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
