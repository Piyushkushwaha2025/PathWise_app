import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useTimetable } from '../../../../hooks/useTimetable';
import { Colors, Typography, Spacing } from '../../../../constants/theme';
import { GlassCard } from '../../../../components/ui/GlassCard';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function TimetableScreen() {
  const { data: timetable, isLoading, error } = useTimetable();
  const router = useRouter();
  
  // Default to Monday (or current day in real app)
  const [selectedDay, setSelectedDay] = useState('Monday');

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Fetching your timetable...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Failed to load timetable.</Text>
        <Text style={styles.errorSub}>{(error as Error).message}</Text>
      </View>
    );
  }

  const daySchedule = timetable?.filter(slot => slot.day === selectedDay) || [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Timetable</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.daySelector}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {DAYS.map(day => (
            <TouchableOpacity 
              key={day} 
              style={[styles.dayPill, selectedDay === day && styles.dayPillActive]}
              onPress={() => setSelectedDay(day)}
            >
              <Text style={[styles.dayText, selectedDay === day && styles.dayTextActive]}>
                {day.substring(0, 3)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={daySchedule}
        keyExtractor={(item, index) => `${item.subject}-${item.timeStart}-${index}`}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No classes scheduled for {selectedDay}.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <GlassCard style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.timeText}>{item.timeStart} - {item.timeEnd}</Text>
              <View style={[styles.typeBadge, { backgroundColor: item.type === 'Practical' ? '#10b98120' : '#3b82f620' }]}>
                <Text style={[styles.typeText, { color: item.type === 'Practical' ? Colors.success : Colors.primary }]}>
                  {item.type}
                </Text>
              </View>
            </View>
            <Text style={styles.subjectName}>{item.subject}</Text>
            <View style={styles.cardBottom}>
              <Text style={styles.teacherText}>{item.teacher}</Text>
              <Text style={styles.roomText}>Room: {item.room}</Text>
            </View>
          </GlassCard>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  loadingText: { ...Typography.body, color: Colors.textDim, marginTop: Spacing.md },
  errorText: { ...Typography.h3, color: Colors.error },
  errorSub: { ...Typography.body, color: Colors.textDim, marginTop: Spacing.xs, textAlign: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.md, paddingTop: 40, backgroundColor: Colors.surface,
  },
  headerTitle: { ...Typography.h3, color: Colors.text },
  backBtn: { padding: Spacing.sm },
  backText: { color: Colors.primary, fontSize: 16 },
  placeholder: { width: 50 },
  daySelector: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dayPill: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 20,
    marginRight: Spacing.sm,
    backgroundColor: Colors.surface,
  },
  dayPillActive: {
    backgroundColor: Colors.primary,
  },
  dayText: {
    ...Typography.body,
    color: Colors.textDim,
    fontWeight: '500',
  },
  dayTextActive: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  listContent: { padding: Spacing.md },
  emptyState: { padding: Spacing.xl, alignItems: 'center', marginTop: 40 },
  emptyText: { ...Typography.body, color: Colors.textDim },
  card: { marginBottom: Spacing.md, padding: Spacing.md },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs },
  timeText: { ...Typography.body, color: Colors.textDim, fontWeight: 'bold' },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  typeText: { fontSize: 12, fontWeight: 'bold' },
  subjectName: { ...Typography.h3, color: Colors.text, marginBottom: Spacing.sm },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between' },
  teacherText: { ...Typography.body, color: Colors.textDim, fontSize: 14 },
  roomText: { ...Typography.body, color: Colors.text, fontSize: 14, fontWeight: '500' },
});
