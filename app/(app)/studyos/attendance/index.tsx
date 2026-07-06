import React from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAttendance } from '../../../../hooks/useAttendance';
import { Colors, Typography, Spacing } from '../../../../constants/theme';
import { GlassCard } from '../../../../components/ui/GlassCard';

export default function AttendanceScreen() {
  const { data: attendance, isLoading, error } = useAttendance();
  const router = useRouter();

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Fetching attendance records...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Failed to load attendance.</Text>
        <Text style={styles.errorSub}>{(error as Error).message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Attendance</Text>
        <View style={styles.placeholder} />
      </View>

      <FlatList
        data={attendance}
        keyExtractor={(item, index) => `${item.subjectName}-${index}`}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const isSafe = item.percentage >= 75;
          
          // Bunk Calculator Logic
          let bunkMsg = '';
          if (isSafe) {
            const safeBunks = Math.floor((item.attendedClasses - 0.75 * item.totalClasses) / 0.75);
            bunkMsg = `Safe to skip: ${safeBunks} classes`;
          } else {
            const recovery = Math.ceil((0.75 * item.totalClasses - item.attendedClasses) / 0.25);
            bunkMsg = `Need to attend: ${recovery} classes to recover`;
          }

          return (
            <GlassCard style={styles.card}>
              <Text style={styles.subjectName}>{item.subjectName}</Text>
              <View style={styles.statsRow}>
                <Text style={styles.statText}>Attended: {item.attendedClasses}/{item.totalClasses}</Text>
                <Text style={[styles.percentage, { color: isSafe ? Colors.success : Colors.error }]}>
                  {item.percentage}%
                </Text>
              </View>
              <View style={[styles.bunkBadge, { backgroundColor: isSafe ? '#10b98120' : '#ef444420' }]}>
                <Text style={[styles.bunkText, { color: isSafe ? Colors.success : Colors.error }]}>
                  {bunkMsg}
                </Text>
              </View>
            </GlassCard>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.textDim,
    marginTop: Spacing.md,
  },
  errorText: {
    ...Typography.h3,
    color: Colors.error,
  },
  errorSub: {
    ...Typography.body,
    color: Colors.textDim,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    paddingTop: 40,
    backgroundColor: Colors.surface,
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.text,
  },
  backBtn: {
    padding: Spacing.sm,
  },
  backText: {
    color: Colors.primary,
    fontSize: 16,
  },
  placeholder: {
    width: 50,
  },
  listContent: {
    padding: Spacing.md,
  },
  card: {
    marginBottom: Spacing.md,
    padding: Spacing.lg,
  },
  subjectName: {
    ...Typography.h3,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  statText: {
    ...Typography.body,
    color: Colors.textDim,
  },
  percentage: {
    ...Typography.h2,
    fontWeight: 'bold',
  },
  bunkBadge: {
    padding: Spacing.sm,
    borderRadius: 8,
    alignItems: 'center',
  },
  bunkText: {
    ...Typography.body,
    fontWeight: 'bold',
  },
});
