import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, RefreshControl, AppState, Alert, Animated } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing, Radius } from '../../../constants/theme';
import { useThemeStore } from '../../../store/useThemeStore';
import { useStudyOSStore } from '../../../store/studyosStore';
import { useStudySessionStore } from '../../../store/studySessionStore';
import { useRouter, useFocusEffect } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import { AutoSyncAttendance } from '../../../components/AutoSyncAttendance';
import { DetailedAttendanceModal } from '../../../components/DetailedAttendanceModal';

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

export default function StudyOSDashboard() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const router = useRouter();
  const { roadmaps, profile, subjects } = useStudyOSStore();
  const { clearSession } = useStudySessionStore();
  const [isCalendarVisible, setIsCalendarVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isSessionModalVisible, setIsSessionModalVisible] = useState(false);
  const [syncKey, setSyncKey] = useState(0);
  const [toastVisible, setToastVisible] = useState(false);
  const [selectedSubjectDetails, setSelectedSubjectDetails] = useState<{code: string, name: string, viewActionTarget?: string} | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const appState = useRef(AppState.currentState);
  const lastSyncTime = useRef(0);

  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [currentMonth, setCurrentMonth] = useState(todayStr.substring(0, 7));

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(toastOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setToastVisible(false));
  };

  const triggerSync = () => {
    const now = Date.now();
    // Don't sync if last sync was less than 2 minutes ago
    if (now - lastSyncTime.current < 2 * 60 * 1000) return;
    lastSyncTime.current = now;
    setSyncKey(prev => prev + 1);
    setRefreshing(true);
  };

  // Auto-sync when app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        console.log('[Dashboard] App foregrounded — triggering attendance sync');
        triggerSync();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, []);

  const onRefresh = React.useCallback(() => {
    lastSyncTime.current = 0; // force sync on manual pull
    setRefreshing(true);
    setSyncKey(prev => prev + 1);
  }, []);

  const handleSyncFinish = (updated: boolean) => {
    setRefreshing(false);
    if (updated) showToast('✓ Attendance updated!');
  };

  const handleSessionExpired = () => {
    setRefreshing(false);
    setIsSessionModalVisible(true);
  };

  useFocusEffect(
    React.useCallback(() => {
      // Sync on first focus if never synced this session
      if (lastSyncTime.current === 0) triggerSync();
    }, [])
  );

  useEffect(() => {
    if (isCalendarVisible) {
      const today = new Date().toISOString().split('T')[0];
      setSelectedDate(today);
      setCurrentMonth(today.substring(0, 7));
    }
  }, [isCalendarVisible]);

  const handleLogout = async () => {
    await clearSession();
    router.replace('/(app)' as any);
  };

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
            <View style={styles.owlIcon}>
              <Ionicons name="logo-octocat" size={32} color={colors.text} />
            </View>
            <View>
              <Text style={styles.greeting}>Good Morning</Text>
              <Text style={styles.userName}>{profile?.name || 'Student'}</Text>
              <Text style={styles.sectionText}>{profile?.course || 'No Course Synced'}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={() => setIsCalendarVisible(true)}>
              <Ionicons name="calendar-outline" size={24} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={{ marginLeft: 16 }} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={24} color="#ef4444" />
            </TouchableOpacity>
            <TouchableOpacity style={{ marginLeft: 16 }}><Ionicons name="menu" size={28} color={colors.text} /></TouchableOpacity>
          </View>
        </View>

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

        {/* Your Subjects List */}
        <View style={[styles.sectionHeader, { marginTop: Spacing.md, marginBottom: Spacing.md }]}>
          <View>
            <Text style={styles.sectionTitle}>Your Subjects</Text>
            <Text style={styles.filterText}>{subjects?.length || 0} subjects</Text>
          </View>
        </View>

        {subjects && subjects.length > 0 ? subjects.map((sub, idx) => {
          const prediction = getAttendancePrediction(sub.totalClasses || 0, sub.attendedClasses || 0);
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#3b82f6' }}/><Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: 'Inter_500Medium' }}>Event</Text></View>
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
              [selectedDate]: { ...(markedDates[selectedDate] || {}), selected: true, selectedColor: '#3b82f640' }
            }}
            theme={{
              backgroundColor: colors.background,
              calendarBackground: colors.background,
              textSectionTitleColor: '#b6c1cd',
              selectedDayBackgroundColor: '#3b82f640',
              selectedDayTextColor: '#ffffff',
              todayTextColor: '#3b82f6',
              dayTextColor: colors.text,
              textDisabledColor: colors.border,
              dotColor: '#3b82f6',
              arrowColor: colors.text,
              monthTextColor: colors.text,
              textDayFontWeight: '600',
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
      {refreshing && (
        <AutoSyncAttendance
          key={syncKey}
          onFinish={handleSyncFinish}
          onSessionExpired={handleSessionExpired}
        />
      )}
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
          <Text style={styles.toastText}>{toastMsg}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const ACADEMIC_CALENDAR = [
  { section: "ODD SEMESTER • JULY - DECEMBER 2026", data: [
    { date: "01-Jul-2026", day: "Wednesday", activity: "Start of registration for 2nd Year students (01.07 to 13.07)" },
    { date: "15-Jul-2026", day: "Wednesday", activity: "Start of Odd Semester – Old Batches" },
    { date: "23-Jul-2026", day: "Thursday", activity: "Orientation & Induction 1st Year – Batch I" },
    { date: "24-Jul-2026", day: "Friday", activity: "Start of Odd Semester – 1st Year – Batch I" },
    { date: "15-Aug-2026", day: "Saturday", activity: "Independence Day Celebration", isHoliday: true },
    { date: "24-Aug-2026", day: "Monday", activity: "Orientation & Induction 1st Year – Batch II" },
    { date: "26-Aug-2026", day: "Wednesday", activity: "Start of Odd Semester – 1st Year – Batch II" },
    { date: "04-Sep-2026", day: "Friday", activity: "Krishna Janmastami", isHoliday: true },
    { date: "05-Sep-2026", day: "Saturday", activity: "Teachers' Day Celebration" },
    { date: "08-Sep-2026", day: "Tuesday", activity: "Mid-Semester Test [MST-1] (08.09 to 11.09)", isExam: true },
    { date: "18-Sep-2026", day: "Friday", activity: "Fresher's Party 2026" },
    { date: "26-Sep-2026", day: "Saturday", activity: "Orientation & Induction [International] 1st Year" },
    { date: "02-Oct-2026", day: "Friday", activity: "Mahatma Gandhi Jayanti", isHoliday: true },
    { date: "12-Oct-2026", day: "Monday", activity: "Mid-Semester Practical [MSP] (12.10 to 15.10)", isExam: true },
    { date: "20-Oct-2026", day: "Tuesday", activity: "Dussehra", isHoliday: true },
    { date: "26-Oct-2026", day: "Monday", activity: "Maharshi Valmiki Jayanti", isHoliday: true },
    { date: "27-Oct-2026", day: "Tuesday", activity: "Mid-Semester Test [MST-2] (27.10 to 30.10)", isExam: true },
    { date: "07-Nov-2026", day: "Saturday", activity: "Last Day of Closing all Internal Components" },
    { date: "09-Nov-2026", day: "Monday", activity: "Deepawali", isHoliday: true },
    { date: "16-Nov-2026", day: "Monday", activity: "Last Teaching Day – All Years" },
    { date: "23-Nov-2026", day: "Monday", activity: "End Semester Practical Exam (23.11 to 28.11)", isExam: true },
    { date: "24-Nov-2026", day: "Tuesday", activity: "Gurupurub", isHoliday: true },
    { date: "30-Nov-2026", day: "Monday", activity: "End Semester Theory Exams (30.11 to 22.12)", isExam: true },
    { date: "22-Dec-2026", day: "Tuesday", activity: "End of Odd Semester – All Years" },
    { date: "23-Dec-2026", day: "Wednesday", activity: "Start of Registration for Even Semester (23.12 to 03.01)" },
    { date: "25-Dec-2026", day: "Friday", activity: "Christmas", isHoliday: true },
    { date: "02-Jan-2027", day: "Saturday", activity: "Announcement of Results" },
  ]}
];

const months: any = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
const agendaItems: any = {};
const markedDates: any = {};
ACADEMIC_CALENDAR.forEach(section => {
  section.data.forEach(item => {
    const parts = item.date.split('-');
    const dateStr = `${parts[2]}-${months[parts[1]]}-${parts[0]}`;
    if (!agendaItems[dateStr]) agendaItems[dateStr] = [];
    agendaItems[dateStr].push(item);
    markedDates[dateStr] = { marked: true, dotColor: item.isHoliday ? '#22c55e' : item.isExam ? '#ef4444' : '#3b82f6' };
  });
});

function SubjectCard({ title, code, credits, leaves, status, statusType, progress, attended, total, onPress }: any) {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const isDanger = statusType === 'danger';
  const isNeutral = statusType === 'neutral';
  const color = isDanger ? '#ef4444' : isNeutral ? colors.textMuted : '#22c55e';
  
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={StyleSheet.flatten([styles.subjectCard, { borderLeftWidth: 3, borderLeftColor: color }])}>
      <View style={{ flex: 1, paddingRight: 16 }}>
        <Text style={styles.subCardTitle}>{title}</Text>
        <Text style={styles.subCardMeta}>{code}{credits ? ` • ${credits}` : ''}</Text>
        <View style={StyleSheet.flatten([styles.subCardStatusPill, { backgroundColor: isDanger ? '#ef444420' : isNeutral ? '#333333' : '#22c55e20' }])}>
          <Ionicons name={isDanger ? "close-circle" : isNeutral ? "information-circle" : "checkmark-circle"} size={14} color={color} />
          <Text style={StyleSheet.flatten([styles.subCardStatusText, { color }])}>{status}</Text>
        </View>
      </View>
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress value={progress} color={color} />
        <Text style={styles.subCardFraction}>{attended}/{total}</Text>
      </View>
      <View style={{ justifyContent: 'center', marginLeft: 8 }}>
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
  userName: { color: colors.text, fontSize: 20, fontFamily: 'SpaceGrotesk_700Bold' },
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
  
  subjectCard: { backgroundColor: colors.surfaceHigh, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md, flexDirection: 'row', alignItems: 'center' },
  subCardTitle: { color: colors.text, fontSize: 15, fontFamily: 'SpaceGrotesk_600SemiBold', marginBottom: 4 },
  subCardMeta: { color: colors.textDim, fontSize: 12, marginBottom: 12 },
  subCardStatusPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full, alignSelf: 'flex-start', gap: 4 },
  subCardStatusText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  subCardFraction: { color: colors.textMuted, fontSize: 11, marginTop: 4, fontFamily: 'Inter_500Medium' },

  roadmapCard: { backgroundColor: colors.surfaceHigh, borderRadius: Radius.lg, padding: Spacing.lg, width: 250, marginRight: Spacing.md, borderWidth: 1, borderColor: '#3b82f640' },
  roadmapSubject: { color: colors.text, fontSize: 15, fontFamily: 'SpaceGrotesk_600SemiBold', marginBottom: 4 },
  roadmapReq: { color: '#3b82f6', fontSize: 12, marginBottom: 8 },
  roadmapContent: { color: '#d1d5db', fontSize: 13, lineHeight: 18 },

  toast: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  toastText: { color: '#ffffff', fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
