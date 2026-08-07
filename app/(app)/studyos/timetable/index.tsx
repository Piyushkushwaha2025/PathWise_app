import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Spacing, Radius } from '../../../../constants/theme';
import { useThemeStore } from '../../../../store/useThemeStore';
import { useStudyOSStore } from '../../../../store/studyosStore';

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
    const cleanStr = timeStr.replace(/AM|PM/gi, '').trim();
    const parts = cleanStr.split('-').map(t => t.trim());
    const parseSingle = (tStr: string) => {
      if (!tStr) return 0;
      let [hoursStr, minutesStr] = tStr.split(':');
      let hours = parseInt((hoursStr || '').replace(/\D/g, ''), 10) || 0;
      let minutes = parseInt((minutesStr || '').replace(/\D/g, ''), 10) || 0;
      if (hours >= 1 && hours <= 7) {
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
  
  const timeline: any[] = [...mapped];
  
  STANDARD_SLOTS.forEach(slot => {
    const hasOverlap = mapped.some(c => c.bounds.start < slot.end && c.bounds.end > slot.start);
    if (!hasOverlap) {
      timeline.push({
        time: slot.time,
        subjectName: 'Free Slot',
        teacher: 'Self Study / Break',
        room: 'Campus / Library',
        isFree: true,
        bounds: { start: slot.start, end: slot.end }
      });
    }
  });
  
  return timeline.sort((a, b) => a.bounds.start - b.bounds.start);
};

export default function TimetableScreen() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const { timetable } = useStudyOSStore();
  const [selectedDay, setSelectedDay] = useState(getCurrentDay());

  useFocusEffect(
    useCallback(() => {
      setSelectedDay(getCurrentDay());
    }, [])
  );

  const rawClasses = timetable[selectedDay] || [];
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

      <ScrollView contentContainerStyle={styles.timelineContent} showsVerticalScrollIndicator={false}>
        {currentDayClasses.length > 0 ? (
          currentDayClasses.map((cls: any, index: number) => {
            const isFree = cls.isFree;
            const type = isFree ? 'Free' : (cls.subjectName.includes('Lab') ? 'Practical' : 'Lecture');
            const cardColor = isFree ? '#64748b' : (cls.subjectName.includes('Lab') ? colors.success : colors.primary);
            const timeParts = cls.time.split('-').map((t: string) => t.trim());
            const startTime = timeParts[0] || '';
            const endTime = timeParts[1] || '';

            return (
              <TimelineCard
                key={index.toString()}
                startTime={startTime}
                endTime={endTime}
                cardStart={cls.time}
                title={cls.subjectName}
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

function TimelineCard({ startTime, endTime, cardStart, title, type, teacher, location, gp, color, isFree, isLast }: any) {
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
            <Text style={styles.cardTitle}>{title}</Text>
            <View style={[styles.typeBadge, { backgroundColor: color + '15' }]}>
              <Text style={[styles.typeText, { color: color }]}>{type}</Text>
            </View>
          </View>
          
          <View style={styles.teacherRow}>
            <Ionicons name="person-circle-outline" size={15} color={colors.textMuted} />
            <Text style={styles.teacherText}>{teacher}</Text>
          </View>
          
          <View style={styles.cardFooter}>
            <View style={styles.footerItem}>
               <Ionicons name="time-outline" size={13} color={colors.textMuted} />
               <Text style={styles.footerText}>{cardStart}</Text>
            </View>
            <View style={styles.footerItem}>
               <Ionicons name="location-outline" size={13} color={colors.textMuted} />
               <Text style={styles.footerText}>{location}</Text>
            </View>
            {gp && (
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
  headerDate: { color: colors.text, fontSize: 22, fontFamily: 'SpaceGrotesk_700Bold' },
  todayBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  todayText: { fontSize: 11, fontFamily: 'SpaceGrotesk_700Bold' },
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
  emptyText: { color: colors.text, fontSize: 18, fontFamily: 'SpaceGrotesk_600SemiBold', marginBottom: 8 },
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
    fontFamily: 'SpaceGrotesk_700Bold', 
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
