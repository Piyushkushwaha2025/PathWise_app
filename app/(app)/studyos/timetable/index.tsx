import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Dimensions, 
  Modal, 
  Alert, 
  ActivityIndicator,
  Platform 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Spacing, Radius } from '../../../../constants/theme';
import { useThemeStore } from '../../../../store/useThemeStore';
import { useStudyOSStore } from '../../../../store/studyosStore';
import { useAuth } from '@clerk/clerk-expo';
import { useDBProfile, fetchSaturdayOverrides, setSaturdayOverride, deleteSaturdayOverride, SaturdayOverrideData } from '../../../../lib/db';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const getCurrentDay = () => {
  const dayIndex = new Date().getDay();
  const daysMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return daysMap[dayIndex];
};

const getFormattedDate = () => {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
};

const STANDARD_SLOTS = [
  { time: '09:35 - 10:25', start: 9 * 60 + 35, end: 10 * 60 + 25 },
  { time: '10:25 - 11:15', start: 10 * 60 + 25, end: 11 * 60 + 15 },
  { time: '11:15 - 12:05', start: 11 * 60 + 15, end: 12 * 60 + 5 },
  { time: '12:05 - 12:55', start: 12 * 60 + 5, end: 12 * 60 + 55 },
  { time: '01:15 - 02:05', start: 13 * 60 + 15, end: 14 * 60 + 5 },
  { time: '02:05 - 02:55', start: 14 * 60 + 5, end: 14 * 60 + 55 },
  { time: '02:55 - 03:45', start: 14 * 60 + 55, end: 15 * 60 + 45 },
  { time: '03:45 - 04:35', start: 15 * 60 + 45, end: 16 * 60 + 35 },
];

const parseTimeBounds = (timeStr: string) => {
  try {
    if (!timeStr) return { start: 0, end: 0 };
    const parts = timeStr.split(/[-–—]| to /i).map(t => t?.trim() || '');
    const parseSingle = (originalPart: string) => {
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

const getDateForWeekday = (weekday: string) => {
  const daysMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const targetIdx = daysMap.indexOf(weekday);
  const d = new Date();
  const currentIdx = d.getDay();
  const diff = targetIdx - currentIdx;
  d.setDate(d.getDate() + diff);
  return d;
};

const getExamsForDate = (datesheet: any[], dateObj: Date) => {
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
};

const buildFullDayTimeline = (rawClasses: any[]) => {
  if (!rawClasses || rawClasses.length === 0) return [];
  
  const mapped = rawClasses.map(c => ({
    ...c,
    bounds: parseTimeBounds(c.time),
    isFree: false
  }));
  
  return mapped.sort((a, b) => a.bounds.start - b.bounds.start);
};

const getNextSaturdayDate = () => {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 6 : 6 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
};

export default function TimetableScreen() {
  const colors = useThemeStore((s) => s.colors);
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === 'black';
  const styles = useStyles(colors, isDark);
  const { timetable, datesheet, subjects } = useStudyOSStore();
  const [selectedDay, setSelectedDay] = useState(getCurrentDay());
  
  const { userId } = useAuth();
  const { dbUser } = useDBProfile();
  const profile = useStudyOSStore((s) => s.profile);
  const activeSection = dbUser?.section_code || profile?.section || null;
  const isCR = dbUser?.role === 'cr' || dbUser?.role === 'admin';

  const [overrides, setOverrides] = useState<SaturdayOverrideData[]>([]);
  const [overrideModalVisible, setOverrideModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [selectedMapping, setSelectedMapping] = useState('Monday');
  const [savingOverride, setSavingOverride] = useState(false);

  useEffect(() => {
    if (userId && activeSection) {
      fetchSaturdayOverrides(userId, activeSection).then(setOverrides).catch(() => {});
    }
  }, [userId, activeSection]);

  const nextSatStr = getNextSaturdayDate();
  const currentSatOverride = overrides.find(o => o.date === nextSatStr);

  const handleSetOverride = async () => {
    if (!userId || !activeSection) return;
    setSavingOverride(true);
    try {
      const newOverride = await setSaturdayOverride(userId, nextSatStr, selectedMapping, activeSection);
      setOverrides(prev => {
        const filtered = prev.filter(o => o.date !== nextSatStr);
        return [...filtered, newOverride];
      });
      setOverrideModalVisible(false);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save');
    } finally {
      setSavingOverride(false);
    }
  };

  const handleRemoveOverride = () => {
    setDeleteModalVisible(true);
  };

  useFocusEffect(
    useCallback(() => {
      setSelectedDay(getCurrentDay());
    }, [])
  );

  const rawClassesFromTimetable = selectedDay === 'Saturday' && currentSatOverride
    ? timetable[currentSatOverride.mapped_day] || []
    : timetable[selectedDay] || [];
    
  const examsForSelectedDay = getExamsForDate(datesheet || [], getDateForWeekday(selectedDay));
  const rawClasses = examsForSelectedDay.length > 0 ? examsForSelectedDay : rawClassesFromTimetable;
    
  const currentDayClasses = useMemo(() => buildFullDayTimeline(rawClasses), [rawClasses]);

  // Current time metrics
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const isViewingToday = getCurrentDay() === selectedDay;

  // Stats for the active day
  const totalCount = currentDayClasses.length;
  const labCount = currentDayClasses.filter((c: any) => {
    const isLab = (c.bounds.end - c.bounds.start) >= 60 || c.subjectName?.includes('Lab');
    return isLab && !c.isFree;
  }).length;
  const lectureCount = totalCount - labCount;

  const earliestTime = totalCount > 0 ? currentDayClasses[0].time?.split('-')[0]?.trim() : '';
  const latestTime = totalCount > 0 ? currentDayClasses[totalCount - 1].time?.split('-')[1]?.trim() : '';

  const getDayDateNumber = (dayName: string) => {
    return getDateForWeekday(dayName).getDate();
  };

  const hasExamsOnDay = (dayName: string) => {
    const exams = getExamsForDate(datesheet || [], getDateForWeekday(dayName));
    return exams.length > 0;
  };

  return (
    <View style={styles.container}>
      {/* Modern Ambient Header */}
      <View style={styles.header}>
        {/* Glow backlight behind header */}
        <View style={styles.ambientGlow} pointerEvents="none" />

        <View style={styles.headerTopRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <Ionicons name="calendar" size={15} color={colors.primary} />
              <Text style={[styles.headerCategory, { color: colors.primary }]}>SCHEDULE & TIMETABLE</Text>
              {isViewingToday && (
                <View style={[styles.todayBadge, { backgroundColor: colors.primary + '20', borderColor: colors.primary + '40' }]}>
                  <Text style={[styles.todayText, { color: colors.primary }]}>TODAY</Text>
                </View>
              )}
            </View>
            <Text style={styles.headerDate}>{getFormattedDate()}</Text>
          </View>

          {/* Quick jump to today button if viewing another day */}
          {!isViewingToday && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                setSelectedDay(getCurrentDay());
              }}
              style={[styles.jumpTodayBtn, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}
            >
              <Ionicons name="refresh" size={12} color={colors.primary} />
              <Text style={[styles.jumpTodayText, { color: colors.primary }]}>Today</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Schedule Summary Bar */}
        {totalCount > 0 ? (
          <View style={[
            styles.summaryPillRow, 
            { 
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)', 
              borderColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.05)' 
            }
          ]}>
            <View style={styles.summaryItem}>
              <Ionicons name="book-outline" size={13} color={colors.primary} />
              <Text style={styles.summaryText}>{lectureCount} Lecture{lectureCount !== 1 ? 's' : ''}</Text>
            </View>
            {labCount > 0 && (
              <>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                  <Ionicons name="flask-outline" size={13} color={colors.success} />
                  <Text style={[styles.summaryText, { color: colors.success }]}>{labCount} Lab{labCount > 1 ? 's' : ''}</Text>
                </View>
              </>
            )}
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Ionicons name="time-outline" size={13} color={colors.textMuted} />
              <Text style={styles.summaryText}>{earliestTime} – {latestTime}</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.headerSubtitle}>No classes scheduled for {selectedDay}</Text>
        )}

        {/* Modern Interactive Day Selector */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.daysScroll}
          contentContainerStyle={{ paddingVertical: 4, gap: 8 }}
        >
          {DAYS.map((day) => {
            const dayNum = getDayDateNumber(day);
            const isToday = getCurrentDay() === day;
            const hasExam = hasExamsOnDay(day);
            return (
              <DayPill
                key={day}
                day={day.substring(0, 3)}
                dayNumber={dayNum}
                active={selectedDay === day}
                isToday={isToday}
                hasExam={hasExam}
                onPress={() => setSelectedDay(day)}
              />
            );
          })}
        </ScrollView>
      </View>
      
      {/* Offline transcribed fallback banner */}
      {(timetable as any)?.isStaticJSONFallback && (
        <View style={styles.noticeBanner}>
          <LinearGradient
            colors={isDark ? ['rgba(245, 158, 11, 0.15)', 'rgba(245, 158, 11, 0.05)'] : ['#fef3c7', '#fde68a']}
            style={styles.noticeGradient}
          >
            <Ionicons name="information-circle" size={18} color="#f59e0b" style={{ marginRight: 8 }} />
            <Text style={[styles.noticeText, { color: isDark ? '#fbbf24' : '#92400e' }]}>
              Offline cached schedule shown (CUIMS portal was unreachable).
            </Text>
          </LinearGradient>
        </View>
      )}

      {/* Saturday Override Active Banner */}
      {selectedDay === 'Saturday' && currentSatOverride && (
        <View style={styles.noticeBanner}>
          <LinearGradient
            colors={isDark ? ['rgba(59, 130, 246, 0.16)', 'rgba(59, 130, 246, 0.04)'] : ['#dbeafe', '#bfdbfe']}
            style={styles.noticeGradient}
          >
            <Ionicons name="swap-horizontal" size={18} color={colors.primary} style={{ marginRight: 8 }} />
            <Text style={[styles.noticeText, { color: colors.primary, flex: 1 }]}>
              Following {currentSatOverride.mapped_day}'s Schedule for {currentSatOverride.date} (Set by CR)
            </Text>
            {isCR && (
              <TouchableOpacity onPress={handleRemoveOverride} style={{ padding: 4 }}>
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
              </TouchableOpacity>
            )}
          </LinearGradient>
        </View>
      )}

      {/* Saturday CR Setter Trigger */}
      {selectedDay === 'Saturday' && isCR && !currentSatOverride && (
        <TouchableOpacity 
          activeOpacity={0.8}
          style={styles.crConfigBtn}
          onPress={() => setOverrideModalVisible(true)}
        >
          <Ionicons name="settings-outline" size={18} color={colors.primary} style={{ marginRight: 8 }} />
          <Text style={{ color: colors.text, fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 13.5, flex: 1 }}>
            Set Schedule for upcoming Saturday
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      )}

      {/* Timeline Scroll List */}
      <ScrollView contentContainerStyle={styles.timelineContent} showsVerticalScrollIndicator={false}>
        {currentDayClasses.length > 0 ? (
          currentDayClasses.map((cls: any, index: number) => {
            const isFree = cls.isFree;
            const isLab = (cls.bounds.end - cls.bounds.start) >= 60 || cls.subjectName?.includes('Lab');
            const isExam = !!cls.isExam;
            const type = isExam ? 'Exam' : (isFree ? 'Free' : (isLab ? 'Practical' : 'Lecture'));
            const cardColor = isExam ? '#ef4444' : (isFree ? '#64748b' : (isLab ? colors.success : colors.primary));
            const timeParts = cls.time.split('-').map((t: string) => t.trim());
            const startTime = timeParts[0] || '';
            const endTime = timeParts[1] || '';

            // Calculate live status for today
            const isOngoing = isViewingToday && !isFree && currentMinutes >= cls.bounds.start && currentMinutes < cls.bounds.end;
            const isCompleted = isViewingToday && !isFree && currentMinutes >= cls.bounds.end;
            const remainingMinutes = isOngoing ? cls.bounds.end - currentMinutes : 0;

            // Resolve full subject name
            let rawSubjectName = cls.subjectName || '';
            let baseCode = rawSubjectName.split(' ')[0];
            let suffix = rawSubjectName.substring(baseCode.length);
            const matchedSubject = subjects?.find((s: any) => s.code === baseCode);
            const fullNameToDisplay = matchedSubject ? `${matchedSubject.name}${suffix}` : rawSubjectName;
            const subtitleToDisplay = matchedSubject ? rawSubjectName : undefined;

            return (
              <TimelineCard
                key={index.toString()}
                startTime={startTime}
                endTime={endTime}
                cardStart={cls.time}
                title={fullNameToDisplay}
                subtitle={subtitleToDisplay}
                type={type}
                teacher={cls.teacher}
                location={cls.room}
                gp={cls.group}
                color={cardColor}
                isFree={isFree}
                isLast={index === currentDayClasses.length - 1}
                isOngoing={isOngoing}
                isCompleted={isCompleted}
                remainingMinutes={remainingMinutes}
              />
            );
          })
        ) : (
          <View style={styles.emptyState}>
            <LinearGradient
              colors={
                isDark
                  ? ['rgba(255, 255, 255, 0.06)', 'rgba(255, 255, 255, 0.01)']
                  : ['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.80)']
              }
              style={[
                styles.emptyCard,
                {
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                  borderTopColor: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.95)',
                }
              ]}
            >
              <View style={[styles.emptyIconBg, { backgroundColor: colors.primary + '18' }]}>
                <Ionicons name="sparkles" size={36} color={colors.primary} />
              </View>
              <Text style={styles.emptyText}>No Classes on {selectedDay} 🎉</Text>
              <Text style={styles.emptySubtext}>
                You have no lectures or practicals scheduled. Take a break, catch up on roadmaps, or study at your own pace!
              </Text>
              {!isViewingToday && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[styles.emptyBackBtn, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                    setSelectedDay(getCurrentDay());
                  }}
                >
                  <Text style={{ color: '#ffffff', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 13.5 }}>
                    View Today's Classes
                  </Text>
                </TouchableOpacity>
              )}
            </LinearGradient>
          </View>
        )}
      </ScrollView>

      {/* Saturday Override Modal */}
      <Modal visible={overrideModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Set Saturday Schedule</Text>
              <TouchableOpacity onPress={() => setOverrideModalVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>
              Select which day's schedule should be followed on the upcoming Saturday ({nextSatStr}).
            </Text>
            
            <View style={styles.mappingGrid}>
              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(d => (
                <TouchableOpacity 
                  key={d} 
                  activeOpacity={0.8}
                  style={[
                    styles.mappingPill,
                    selectedMapping === d
                      ? { backgroundColor: colors.primary, borderColor: colors.primary }
                      : { backgroundColor: colors.surface, borderColor: colors.border }
                  ]}
                  onPress={() => setSelectedMapping(d)}
                >
                  <Text style={[styles.mappingPillText, { color: selectedMapping === d ? '#fff' : colors.text }]}>
                    {d}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <TouchableOpacity 
              activeOpacity={0.8}
              style={[styles.modalActionBtn, { backgroundColor: colors.primary }]}
              onPress={handleSetOverride}
              disabled={savingOverride}
            >
              {savingOverride ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalActionText}>Save Saturday Schedule</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete Saturday Override Modal */}
      <Modal visible={deleteModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Remove Saturday Schedule</Text>
            </View>
            <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>
              Are you sure you want to remove the mapped schedule for this Saturday? Students will see an empty schedule again.
            </Text>
            
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity 
                activeOpacity={0.8}
                style={[styles.modalSecondaryBtn, { borderColor: colors.border }]}
                onPress={() => setDeleteModalVisible(false)}
              >
                <Text style={[styles.modalSecondaryText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                activeOpacity={0.8}
                style={[styles.modalDeleteBtn, { backgroundColor: '#ef4444' }]}
                onPress={async () => {
                  if (!userId || !currentSatOverride) return;
                  setSavingOverride(true);
                  try {
                    await deleteSaturdayOverride(userId, currentSatOverride._id);
                    setOverrides(prev => prev.filter(o => o._id !== currentSatOverride._id));
                    setDeleteModalVisible(false);
                  } catch (e: any) {
                    Alert.alert('Error', e.message || 'Failed to remove override');
                  } finally {
                    setSavingOverride(false);
                  }
                }}
                disabled={savingOverride}
              >
                {savingOverride ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalActionText}>Remove</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DayPill({ day, dayNumber, active, isToday, hasExam, onPress }: any) {
  const colors = useThemeStore((s) => s.colors);
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === 'black';

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => {
        try { Haptics.selectionAsync(); } catch {}
        onPress();
      }}
      style={{ alignItems: 'center' }}
    >
      <View
        style={[
          stylesDayPill.container,
          active ? {
            backgroundColor: colors.primary,
            borderColor: colors.primary,
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.35,
            shadowRadius: 8,
            elevation: 4,
          } : {
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
          }
        ]}
      >
        <Text
          style={[
            stylesDayPill.dayName,
            { color: active ? '#ffffff' : (isToday ? colors.primary : colors.textMuted) }
          ]}
        >
          {day.toUpperCase()}
        </Text>
        <Text
          style={[
            stylesDayPill.dayNumber,
            { color: active ? '#ffffff' : colors.text }
          ]}
        >
          {dayNumber}
        </Text>
        
        {/* Today or Exam indicator dot */}
        {hasExam ? (
          <View style={[stylesDayPill.dot, { backgroundColor: active ? '#ffffff' : '#f59e0b' }]} />
        ) : isToday ? (
          <View style={[stylesDayPill.dot, { backgroundColor: active ? '#ffffff' : colors.primary }]} />
        ) : (
          <View style={[stylesDayPill.dot, { backgroundColor: 'transparent' }]} />
        )}
      </View>
    </TouchableOpacity>
  );
}

const stylesDayPill = StyleSheet.create({
  container: {
    width: 52,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingVertical: 6,
  },
  dayName: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  dayNumber: {
    fontSize: 16,
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 3,
  },
});

function TimelineCard({ 
  startTime, 
  endTime, 
  cardStart, 
  title, 
  subtitle, 
  type, 
  teacher, 
  location, 
  gp, 
  color, 
  isFree, 
  isLast,
  isOngoing,
  isCompleted,
  remainingMinutes,
}: any) {
  const colors = useThemeStore((s) => s.colors);
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === 'black';

  return (
    <View style={[stylesCard.timeCardContainer, isCompleted && { opacity: 0.60 }]}>
      {/* Left Column: Start & End Time */}
      <View style={stylesCard.timeColumn}>
        <Text style={[
          stylesCard.startTimeText, 
          isOngoing ? { color: '#22c55e' } : (isCompleted ? { color: colors.textDim } : { color: colors.text })
        ]}>
          {startTime}
        </Text>
        {!!endTime && (
          <Text style={[
            stylesCard.endTimeText, 
            isOngoing ? { color: '#22c55e', opacity: 0.85 } : { color: colors.textDim }
          ]}>
            {endTime}
          </Text>
        )}
        {isOngoing && remainingMinutes > 0 && (
          <View style={stylesCard.liveMinutesPill}>
            <Text style={stylesCard.liveMinutesText}>{remainingMinutes}m left</Text>
          </View>
        )}
      </View>

      {/* Center Axis: Dot & Line */}
      <View style={stylesCard.timelineAxis}>
        {isOngoing ? (
          <View style={stylesCard.liveNodeWrapper}>
            <View style={stylesCard.liveNodePulse} />
            <View style={[stylesCard.timelineNode, { backgroundColor: '#22c55e', borderColor: '#ffffff', width: 14, height: 14, borderRadius: 7 }]} />
          </View>
        ) : (
          <View style={[
            stylesCard.timelineNode, 
            { borderColor: isFree ? colors.border : (isCompleted ? colors.textDim : color) },
            isCompleted 
              ? { backgroundColor: colors.textDim + '30', width: 12, height: 12, borderRadius: 6, borderWidth: 2 } 
              : (isFree 
                ? { backgroundColor: colors.surface, width: 12, height: 12, borderRadius: 6, borderWidth: 2 } 
                : { backgroundColor: colors.background })
          ]} />
        )}
        {!isLast && (
          <View 
            style={[
              stylesCard.timelineLine, 
              { 
                backgroundColor: isOngoing 
                  ? '#22c55e80' 
                  : (isCompleted 
                    ? colors.border + '50' 
                    : (isFree ? colors.border + '40' : color + '40')) 
              }
            ]} 
          />
        )}
      </View>
      
      {/* Right Column: Glass Card or Blank Free Slot */}
      {isFree ? (
        <View style={[stylesCard.blankFreeSlot, { borderColor: colors.border }]}>
          <Text style={{ color: colors.textDim, fontSize: 12, fontFamily: 'Inter_500Medium' }}>Free Period</Text>
        </View>
      ) : (
        <LinearGradient
          colors={
            isOngoing
              ? (isDark 
                  ? ['rgba(34, 197, 94, 0.16)', 'rgba(34, 197, 94, 0.04)'] 
                  : ['rgba(34, 197, 94, 0.12)', 'rgba(34, 197, 94, 0.02)'])
              : (isDark
                  ? ['rgba(255, 255, 255, 0.07)', 'rgba(255, 255, 255, 0.02)']
                  : ['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.85)'])
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            stylesCard.card,
            {
              borderLeftColor: isOngoing ? '#22c55e' : color,
              borderColor: isOngoing 
                ? '#22c55e60' 
                : (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'),
              borderTopColor: isOngoing 
                ? '#22c55e80' 
                : (isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.95)'),
            },
            isOngoing && {
              shadowColor: '#22c55e',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 10,
              elevation: 4,
            }
          ]}
        >
          {/* Header Row */}
          <View style={stylesCard.cardHeader}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={[stylesCard.cardTitle, { color: colors.text }]} numberOfLines={2}>
                {title}
              </Text>
              {!!subtitle && (
                <Text style={{ color: colors.textMuted, fontSize: 11.5, fontFamily: 'Inter_500Medium', marginTop: 3 }}>
                  {subtitle}
                </Text>
              )}
            </View>

            {/* Badges Container */}
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              {isOngoing && (
                <View style={stylesCard.liveNowBadge}>
                  <View style={stylesCard.liveGreenDot} />
                  <Text style={stylesCard.liveNowText}>LIVE</Text>
                </View>
              )}
              <View 
                style={[
                  stylesCard.typeBadge, 
                  { 
                    backgroundColor: isOngoing ? '#22c55e20' : color + '18',
                    borderColor: isOngoing ? '#22c55e50' : color + '30',
                    borderWidth: 1,
                  }
                ]}
              >
                <Text style={[stylesCard.typeText, { color: isOngoing ? '#22c55e' : color }]}>
                  {type}
                </Text>
              </View>
            </View>
          </View>
          
          {/* Teacher Row */}
          {!!teacher && (
            <View style={stylesCard.teacherRow}>
              <View style={[stylesCard.teacherAvatarMini, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                <Ionicons name="person" size={11} color={colors.textMuted} />
              </View>
              <Text style={stylesCard.teacherText} numberOfLines={1}>{teacher}</Text>
            </View>
          )}
          
          {/* Card Footer Pills */}
          <View style={[stylesCard.cardFooter, { borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
            <View style={[stylesCard.footerPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }]}>
              <Ionicons name="time-outline" size={12} color={colors.textMuted} />
              <Text style={stylesCard.footerText}>{cardStart}</Text>
            </View>

            <View style={[stylesCard.footerPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }]}>
              <Ionicons name="location-outline" size={12} color={isOngoing ? '#22c55e' : colors.primary} />
              <Text style={[stylesCard.footerText, { color: colors.text }]}>{location || 'TBA'}</Text>
            </View>

            {!!gp && (
              <View style={[stylesCard.footerPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }]}>
                <Ionicons name="people-outline" size={12} color={colors.textMuted} />
                <Text style={stylesCard.footerText}>{gp}</Text>
              </View>
            )}
          </View>
        </LinearGradient>
      )}
    </View>
  );
}

const stylesCard = StyleSheet.create({
  timeCardContainer: { 
    flexDirection: 'row', 
    alignItems: 'stretch', 
    marginBottom: 14 
  },
  timeColumn: {
    width: 60,
    alignItems: 'flex-end',
    paddingTop: 3,
    marginRight: 10,
  },
  startTimeText: { 
    fontSize: 14, 
    fontFamily: 'SpaceGrotesk_700Bold',
    lineHeight: 18,
  },
  endTimeText: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    marginTop: 2,
  },
  liveMinutesPill: {
    backgroundColor: '#22c55e20',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#22c55e40',
  },
  liveMinutesText: {
    color: '#22c55e',
    fontSize: 9.5,
    fontFamily: 'Inter_700Bold',
  },
  timelineAxis: {
    width: 20,
    alignItems: 'center',
    marginRight: 10,
    paddingTop: 5,
  },
  timelineNode: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    zIndex: 2,
  },
  liveNodeWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  liveNodePulse: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#22c55e',
    opacity: 0.45,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginTop: 4,
    marginBottom: -16,
    zIndex: 1,
    borderRadius: 1,
  },
  blankFreeSlot: {
    flex: 1,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { 
    flex: 1, 
    borderRadius: 20, 
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderLeftWidth: 4,
    borderWidth: 1,
  },
  cardHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-start', 
    marginBottom: 6 
  },
  cardTitle: { 
    fontSize: 14.5, 
    fontFamily: 'SpaceGrotesk_700Bold',
    lineHeight: 19,
  },
  liveNowBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#22c55e',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  liveGreenDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#ffffff',
  },
  liveNowText: {
    color: '#ffffff',
    fontSize: 9.5,
    fontFamily: 'SpaceGrotesk_700Bold',
    letterSpacing: 0.5,
  },
  typeBadge: { 
    paddingHorizontal: 8, 
    paddingVertical: 2.5, 
    borderRadius: Radius.full 
  },
  typeText: { 
    fontSize: 10, 
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.3,
  },
  teacherRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 10,
    gap: 6,
  },
  teacherAvatarMini: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teacherText: { 
    color: '#94a3b8', 
    fontSize: 12, 
    fontFamily: 'Inter_500Medium',
    flex: 1,
  },
  cardFooter: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    gap: 8, 
    borderTopWidth: 1, 
    paddingTop: 8 
  },
  footerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  footerText: { 
    color: '#94a3b8', 
    fontSize: 11, 
    fontFamily: 'Inter_500Medium' 
  },
});

const useStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { 
    paddingTop: 18, 
    paddingHorizontal: Spacing.md, 
    paddingBottom: Spacing.sm,
    position: 'relative',
    overflow: 'hidden',
  },
  ambientGlow: {
    position: 'absolute',
    top: -40,
    left: '20%',
    width: 220,
    height: 120,
    borderRadius: 110,
    backgroundColor: colors.primary,
    opacity: isDark ? 0.12 : 0.08,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  headerCategory: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 10.5,
    letterSpacing: 1,
  },
  headerDate: { 
    color: colors.text, 
    fontSize: 21, 
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  todayBadge: { 
    paddingHorizontal: 7, 
    paddingVertical: 2, 
    borderRadius: 6,
    borderWidth: 1,
  },
  todayText: { 
    fontSize: 10, 
    fontFamily: 'SpaceGrotesk_700Bold',
    letterSpacing: 0.5,
  },
  jumpTodayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  jumpTodayText: {
    fontSize: 11.5,
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  summaryPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  summaryDivider: {
    width: 1,
    height: 12,
    backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
    marginHorizontal: 10,
  },
  summaryText: {
    color: colors.textMuted,
    fontSize: 11.5,
    fontFamily: 'Inter_500Medium',
  },
  headerSubtitle: { 
    color: colors.textMuted, 
    fontSize: 13, 
    fontFamily: 'Inter_500Medium',
    marginBottom: 10,
  },
  daysScroll: { 
    flexDirection: 'row',
  },
  noticeBanner: {
    marginHorizontal: Spacing.md,
    marginTop: 10,
    borderRadius: 16,
    overflow: 'hidden',
  },
  noticeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
  },
  noticeText: {
    fontSize: 12.5,
    fontFamily: 'Inter_500Medium',
    flex: 1,
  },
  crConfigBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: Spacing.md,
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
  },
  timelineContent: { 
    paddingHorizontal: Spacing.md, 
    paddingBottom: 110, 
    paddingTop: 14 
  },
  emptyState: { 
    marginTop: 20,
    alignItems: 'center',
  },
  emptyCard: {
    width: '100%',
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderTopWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconBg: { 
    width: 72, 
    height: 72, 
    borderRadius: 36, 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginBottom: 16 
  },
  emptyText: { 
    color: colors.text, 
    fontSize: 17, 
    fontFamily: 'SpaceGrotesk_700Bold', 
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: { 
    color: colors.textMuted, 
    fontSize: 13, 
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 18,
  },
  emptyBackBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 19,
    marginBottom: 18,
  },
  mappingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  mappingPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  mappingPillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  modalActionBtn: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalActionText: {
    color: '#ffffff',
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 15,
  },
  modalSecondaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  modalSecondaryText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  modalDeleteBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
