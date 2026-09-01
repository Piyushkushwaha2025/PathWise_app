import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Modal, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Spacing, Radius } from '../../../../constants/theme';
import { useThemeStore } from '../../../../store/useThemeStore';
import { useStudyOSStore } from '../../../../store/studyosStore';
import { useAuth } from '@clerk/clerk-expo';
import { useDBProfile, fetchSaturdayOverrides, setSaturdayOverride, deleteSaturdayOverride, SaturdayOverrideData } from '../../../../lib/db';

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

const parseStartTime = (timeStr: string) => parseTimeBounds(timeStr).start;

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
  const styles = useStyles(colors);
  const { timetable } = useStudyOSStore();
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

  const rawClasses = selectedDay === 'Saturday' && currentSatOverride
    ? timetable[currentSatOverride.mapped_day] || []
    : timetable[selectedDay] || [];
    
  const currentDayClasses = buildFullDayTimeline(rawClasses);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Ionicons name="calendar-outline" size={24} color={colors.text} />
          <Text style={styles.headerDate}>{getFormattedDate()}</Text>
          {getCurrentDay() === selectedDay && (
            <View style={[styles.todayBadge, { backgroundColor: colors.primary + '15' }]}>
              <Text style={[styles.todayText, { color: colors.primary }]}>TODAY</Text>
            </View>
          )}
        </View>
        <Text style={styles.headerSubtitle}>{rawClasses.length} classes scheduled (09:35 AM - 04:35 PM)</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.daysScroll}>
          {DAYS.map((day) => (
            <TouchableOpacity key={day} onPress={() => setSelectedDay(day)}>
              <DayPill day={day.substring(0, 3)} active={selectedDay === day} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      
      {(timetable as any)?.isStaticJSONFallback && (
        <View style={{ backgroundColor: colors.warning + '20', padding: 12, marginHorizontal: Spacing.md, marginTop: Spacing.md, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="information-circle-outline" size={20} color={colors.warning} style={{ marginRight: 8 }} />
          <Text style={{ color: colors.warning, fontSize: 13, flex: 1, fontFamily: 'Inter_400Regular' }}>
            This data is not from the original CUIMS website as the portal is currently down. Showing offline transcribed data.
          </Text>
        </View>
      )}

      {selectedDay === 'Saturday' && currentSatOverride && (
        <View style={{ backgroundColor: colors.primary + '20', padding: 12, marginHorizontal: Spacing.md, marginTop: Spacing.md, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="swap-horizontal" size={20} color={colors.primary} style={{ marginRight: 8 }} />
          <Text style={{ color: colors.primary, fontSize: 13, flex: 1, fontFamily: 'Inter_600SemiBold' }}>
            Following {currentSatOverride.mapped_day}'s Schedule for {currentSatOverride.date} (Set by CR)
          </Text>
          {isCR && (
            <TouchableOpacity onPress={handleRemoveOverride} style={{ padding: 4 }}>
              <Ionicons name="trash-outline" size={20} color="#ef4444" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {selectedDay === 'Saturday' && isCR && !currentSatOverride && (
        <TouchableOpacity 
          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceHigh, padding: 12, marginHorizontal: Spacing.md, marginTop: Spacing.md, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border }}
          onPress={() => setOverrideModalVisible(true)}
        >
          <Ionicons name="settings-outline" size={20} color={colors.text} style={{ marginRight: 8 }} />
          <Text style={{ color: colors.text, fontFamily: 'Inter_500Medium', flex: 1 }}>Set Schedule for upcoming Saturday</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      )}

      <ScrollView contentContainerStyle={styles.timelineContent} showsVerticalScrollIndicator={false}>
        {currentDayClasses.length > 0 ? (
          currentDayClasses.map((cls: any, index: number) => {
            const isFree = cls.isFree;
            const isLab = (cls.bounds.end - cls.bounds.start) >= 60 || cls.subjectName.includes('Lab');
            const type = isFree ? 'Free' : (isLab ? 'Practical' : 'Lecture');
            const cardColor = isFree ? '#64748b' : (isLab ? colors.success : colors.primary);
            const timeParts = cls.time.split('-').map((t: string) => t.trim());
            const startTime = timeParts[0] || '';
            const endTime = timeParts[1] || '';

            // Resolve full subject name
            let rawSubjectName = cls.subjectName || '';
            let baseCode = rawSubjectName.split(' ')[0];
            let suffix = rawSubjectName.substring(baseCode.length);
            const matchedSubject = useStudyOSStore.getState().subjects?.find((s: any) => s.code === baseCode);
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
              />
            );
          })
        ) : (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIconBg, { backgroundColor: colors.surfaceHigh }]}>
              <Ionicons name="cafe-outline" size={48} color={colors.textMuted} />
            </View>
            <Text style={styles.emptyText}>No classes today!</Text>
            <Text style={styles.emptySubtext}>Enjoy your free time or sync your timetable.</Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={overrideModalVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: Spacing.lg }}>
          <View style={{ backgroundColor: colors.background, padding: Spacing.lg, borderRadius: Radius.lg }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontFamily: 'SpaceGrotesk_700Bold', paddingRight: 4, color: colors.text }}>Set Saturday Timetable</Text>
              <TouchableOpacity onPress={() => setOverrideModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={{ color: colors.textMuted, marginBottom: 16, fontFamily: 'Inter_400Regular' }}>
              Select which day's schedule should be followed on the upcoming Saturday ({nextSatStr}).
            </Text>
            
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(d => (
                <TouchableOpacity 
                  key={d} 
                  style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: selectedMapping === d ? colors.primary : colors.border, backgroundColor: selectedMapping === d ? colors.primary : 'transparent' }}
                  onPress={() => setSelectedMapping(d)}
                >
                  <Text style={{ color: selectedMapping === d ? '#fff' : colors.text, fontFamily: 'Inter_500Medium' }}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <TouchableOpacity 
              style={{ backgroundColor: colors.primary, padding: 14, borderRadius: Radius.md, alignItems: 'center' }}
              onPress={handleSetOverride}
              disabled={savingOverride}
            >
              {savingOverride ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 16 }}>Save Mapping</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={deleteModalVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: Spacing.lg }}>
          <View style={{ backgroundColor: colors.background, padding: Spacing.lg, borderRadius: Radius.lg }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontFamily: 'SpaceGrotesk_700Bold', paddingRight: 4, color: colors.text }}>Remove Schedule</Text>
            </View>
            <Text style={{ color: colors.textMuted, marginBottom: 24, fontFamily: 'Inter_400Regular', lineHeight: 20 }}>
              Are you sure you want to remove the mapped schedule for this Saturday? Students will see an empty schedule again.
            </Text>
            
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity 
                style={{ flex: 1, padding: 14, borderRadius: Radius.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}
                onPress={() => setDeleteModalVisible(false)}
              >
                <Text style={{ color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={{ flex: 1, backgroundColor: '#ef4444', padding: 14, borderRadius: Radius.md, alignItems: 'center' }}
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
                {savingOverride ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 16 }}>Remove</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DayPill({ day, active }: any) {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  return (
    <View style={[styles.dayPill, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
      <Text style={[styles.dayText, active && { color: '#ffffff' }]}>{day}</Text>
    </View>
  );
}

function TimelineCard({ startTime, endTime, cardStart, title, subtitle, type, teacher, location, gp, color, isFree, isLast }: any) {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  
  return (
    <View style={styles.timeCardContainer}>
      {/* Left Column: Start & End Time */}
      <View style={styles.timeColumn}>
        <Text style={[styles.startTimeText, isFree && { color: colors.textMuted }]}>{startTime}</Text>
        {!!endTime && <Text style={styles.endTimeText}>{endTime}</Text>}
      </View>

      {/* Center Axis: Dot & Line */}
      <View style={styles.timelineAxis}>
        <View style={[
          styles.timelineNode, 
          { borderColor: isFree ? colors.border : color },
          isFree ? { backgroundColor: colors.surface, width: 12, height: 12, borderRadius: 6, borderWidth: 2 } : { backgroundColor: colors.background }
        ]} />
        {!isLast && <View style={[styles.timelineLine, { backgroundColor: isFree ? colors.border + '60' : color + '50' }]} />}
      </View>
      
      {/* Right Column: Card or Blank Free Slot */}
      {isFree ? (
        <View style={styles.blankFreeSlot} />
      ) : (
        <View style={[styles.card, { borderLeftColor: color }]}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.cardTitle}>{title}</Text>
              {!!subtitle && <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 2 }}>{subtitle}</Text>}
            </View>
            <View style={[styles.typeBadge, { backgroundColor: color + '15' }]}>
              <Text style={[styles.typeText, { color: color }]}>{type}</Text>
            </View>
          </View>
          
          {!!teacher && (
            <View style={styles.teacherRow}>
              <Ionicons name="person-circle-outline" size={15} color={colors.textMuted} />
              <Text style={styles.teacherText}>{teacher}</Text>
            </View>
          )}
          
          <View style={styles.cardFooter}>
            <View style={styles.footerItem}>
               <Ionicons name="time-outline" size={13} color={colors.textMuted} />
               <Text style={styles.footerText}>{cardStart}</Text>
            </View>
            <View style={styles.footerItem}>
               <Ionicons name="location-outline" size={13} color={colors.textMuted} />
               <Text style={styles.footerText}>{location || 'TBA'}</Text>
            </View>
            {!!gp && (
              <View style={styles.footerItem}>
                 <Ionicons name="people-outline" size={13} color={colors.textMuted} />
                 <Text style={styles.footerText}>{gp}</Text>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingTop: 20, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  headerDate: { color: colors.text, fontSize: 22, fontFamily: 'SpaceGrotesk_700Bold', paddingRight: 4 },
  todayBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  todayText: { fontSize: 11, fontFamily: 'SpaceGrotesk_700Bold', paddingRight: 4 },
  headerSubtitle: { color: colors.textMuted, fontSize: 14, marginBottom: Spacing.lg },
  
  daysScroll: { flexDirection: 'row' },
  dayPill: { 
    backgroundColor: colors.surface, 
    borderRadius: Radius.full, 
    paddingHorizontal: 20, 
    paddingVertical: 10, 
    alignItems: 'center', 
    marginRight: 10, 
    borderWidth: 1, 
    borderColor: colors.border 
  },
  dayText: { color: colors.textMuted, fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  timelineContent: { paddingHorizontal: Spacing.md, paddingBottom: 100, paddingTop: 10 },
  
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 80 },
  emptyIconBg: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyText: { color: colors.text, fontSize: 18, fontFamily: 'SpaceGrotesk_600SemiBold', paddingRight: 4, marginBottom: 8 },
  emptySubtext: { color: colors.textMuted, fontSize: 14, fontFamily: 'Inter_500Medium' },
  
  timeCardContainer: { 
    flexDirection: 'row', 
    alignItems: 'stretch', 
    marginBottom: 12 
  },
  
  timeColumn: {
    width: 58,
    alignItems: 'flex-end',
    paddingTop: 2,
    marginRight: 10,
  },
  startTimeText: { 
    color: colors.text, 
    fontSize: 14, 
    fontFamily: 'SpaceGrotesk_700Bold', paddingRight: 4, 
    lineHeight: 18,
  },
  endTimeText: {
    color: colors.textDim,
    fontSize: 11.5,
    fontFamily: 'Inter_500Medium',
    marginTop: 2,
  },
  timelineAxis: {
    width: 20,
    alignItems: 'center',
    marginRight: 10,
    paddingTop: 4,
  },
  timelineNode: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    zIndex: 2,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginTop: 4,
    marginBottom: -16,
    zIndex: 1,
  },

  blankFreeSlot: {
    flex: 1,
    height: 40,
    backgroundColor: 'transparent',
  },

  card: { 
    flex: 1, 
    backgroundColor: colors.surfaceHigh, 
    borderRadius: Radius.lg, 
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  cardTitle: { color: colors.text, fontSize: 15, fontFamily: 'SpaceGrotesk_700Bold', flex: 1, paddingRight: 10 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  typeText: { fontSize: 10.5, fontFamily: 'Inter_700Bold' },
  
  teacherRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  teacherText: { color: colors.textMuted, fontSize: 12, marginLeft: 5, fontFamily: 'Inter_500Medium' },
  
  cardFooter: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  footerItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footerText: { color: colors.textDim, fontSize: 11.5, fontFamily: 'Inter_500Medium' },
});
