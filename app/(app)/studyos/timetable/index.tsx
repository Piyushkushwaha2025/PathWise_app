import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Spacing, Radius } from '../../../../constants/theme';
import { useThemeStore } from '../../../../store/useThemeStore';
import { useStudyOSStore } from '../../../../store/studyosStore';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const getCurrentDay = () => {
  const dayIndex = new Date().getDay();
  const daysMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const today = daysMap[dayIndex];
  return DAYS.includes(today) ? today : 'Monday'; // Fallback to Monday on Sunday
};

const getFormattedDate = () => {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
};

const parseStartTime = (timeStr: string) => {
  try {
    const startTimeStr = timeStr.split('-')[0].trim();
    let [hours, minutes] = startTimeStr.split(':').map(Number);
    // College classes are typically between 8 AM and 6 PM.
    // If hours is between 1 and 7, it's PM (13 to 19).
    if (hours >= 1 && hours <= 7) {
      hours += 12;
    }
    return hours * 60 + (minutes || 0);
  } catch (e) {
    return 0;
  }
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
  const currentDayClasses = [...rawClasses].sort((a, b) => parseStartTime(a.time) - parseStartTime(b.time));

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
        <Text style={styles.headerSubtitle}>{currentDayClasses.length} classes scheduled</Text>

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
          currentDayClasses.map((cls: any, index: number) => (
            <TimelineCard
              key={index.toString()}
              time={cls.time.split('-')[0].trim()}
              cardStart={cls.time}
              title={cls.subjectName}
              type={cls.subjectName.includes('Lab') ? 'Practical' : 'Lecture'}
              teacher={cls.teacher}
              location={cls.room}
              gp={cls.group}
              color={cls.subjectName.includes('Lab') ? colors.success : colors.primary}
              isLast={index === currentDayClasses.length - 1}
            />
          ))
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

function TimelineCard({ time, cardStart, title, type, teacher, location, gp, color, isLast }: any) {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  
  return (
    <View style={styles.timeCardContainer}>
      {/* Left side: Time & Timeline Graphic */}
      <View style={styles.timelineLeft}>
        <Text style={styles.timeLabel}>{time}</Text>
        <View style={styles.timelineGraphic}>
          <View style={[styles.timelineDot, { borderColor: color }]} />
          {!isLast && <View style={styles.timelineLine} />}
        </View>
      </View>
      
      {/* Right side: Card */}
      <View style={[styles.card, { borderLeftColor: color }]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{title}</Text>
          <View style={[styles.typeBadge, { backgroundColor: color + '15' }]}>
            <Text style={[styles.typeText, { color: color }]}>{type}</Text>
          </View>
        </View>
        
        <View style={styles.teacherRow}>
          <Ionicons name="person-circle-outline" size={16} color={colors.textMuted} />
          <Text style={styles.teacherText}>{teacher}</Text>
        </View>
        
        <View style={styles.cardFooter}>
          <View style={styles.footerItem}>
             <Ionicons name="time-outline" size={14} color={colors.textMuted} />
             <Text style={styles.footerText}>{cardStart}</Text>
          </View>
          <View style={styles.footerItem}>
             <Ionicons name="location-outline" size={14} color={colors.textMuted} />
             <Text style={styles.footerText}>{location}</Text>
          </View>
          {gp && (
            <View style={styles.footerItem}>
               <Ionicons name="people-outline" size={14} color={colors.textMuted} />
               <Text style={styles.footerText}>{gp}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingTop: 60, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
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
    marginBottom: Spacing.md 
  },
  
  timelineLeft: {
    width: 65,
    alignItems: 'center',
    marginRight: 12,
  },
  timeLabel: { 
    color: colors.text, 
    fontSize: 13, 
    fontFamily: 'SpaceGrotesk_600SemiBold', 
    marginBottom: 8 
  },
  timelineGraphic: {
    flex: 1,
    alignItems: 'center',
  },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    backgroundColor: colors.background,
    zIndex: 2,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.border,
    marginTop: -2,
    marginBottom: -20,
    zIndex: 1,
  },

  card: { 
    flex: 1, 
    backgroundColor: colors.surfaceHigh, 
    borderRadius: Radius.lg, 
    padding: Spacing.lg,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  cardTitle: { color: colors.text, fontSize: 16, fontFamily: 'SpaceGrotesk_700Bold', flex: 1, paddingRight: 10 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  typeText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  
  teacherRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  teacherText: { color: colors.textMuted, fontSize: 13, marginLeft: 6, fontFamily: 'Inter_500Medium' },
  
  cardFooter: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  footerItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footerText: { color: colors.textDim, fontSize: 12, fontFamily: 'Inter_500Medium' },
});
