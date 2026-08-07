import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useAttendance } from '../../../../hooks/useAttendance';
import { useThemeStore } from '../../../../store/useThemeStore';
import { useStudySessionStore } from '../../../../store/studySessionStore';
import { Typography, Spacing } from '../../../../constants/theme';
import { GlassCard } from '../../../../components/ui/GlassCard';
import { Skeleton } from '../../../../components/ui/Skeleton';

export default function AttendanceScreen() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const { data: attendance, isLoading, isFetching, error, refetch } = useAttendance();
  const router = useRouter();
  const { clearSession } = useStudySessionStore();

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Attendance</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.listContent}>
          {[1, 2, 3, 4, 5].map(i => (
            <GlassCard key={i} style={styles.card}>
              <Skeleton width="60%" height={24} style={{ marginBottom: Spacing.sm }} />
              <View style={styles.statsRow}>
                <Skeleton width="40%" height={16} />
                <Skeleton width={60} height={32} />
              </View>
              <Skeleton width="100%" height={40} borderRadius={8} />
            </GlassCard>
          ))}
        </View>
      </View>
    );
  }

  if (error) {
    if ((error as Error).message.includes('expired') || error.name === 'SessionExpiredError') {
      // Handle graceful logout
      setTimeout(() => {
        clearSession().then(() => {
          router.replace('/(app)/studyos/connect');
        });
      }, 100);
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Session expired. Reconnecting...</Text>
        </View>
      );
    }
    
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
        {/* Subtle refresh indicator — only shows when silently refreshing in background */}
        <View style={{ width: 50, alignItems: 'center' }}>
          {isFetching && !isLoading && <ActivityIndicator size="small" color={colors.primary} />}
        </View>
      </View>

      <FlatList
        data={attendance}
        keyExtractor={(item, index) => `${item.subjectName}-${index}`}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const percentageNum = parseFloat(item.percentage as any);
          const isSafe = percentageNum >= 75;
          
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
                <Text style={[styles.percentage, { color: isSafe ? colors.success : colors.error }]}>
                  {item.percentage}%
                </Text>
              </View>
              <View style={[styles.bunkBadge, { backgroundColor: isSafe ? '#10b98120' : '#ef444420' }]}>
                <Text style={[styles.bunkText, { color: isSafe ? colors.success : colors.error }]}>
                  {bunkMsg}
                </Text>
              </View>
            </GlassCard>
          );
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      />
    </View>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  loadingText: {
    ...Typography.body,
    color: colors.textDim,
    marginTop: Spacing.md,
  },
  errorText: {
    ...Typography.h3,
    color: colors.error,
  },
  errorSub: {
    ...Typography.body,
    color: colors.textDim,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    paddingTop: 20,
    backgroundColor: colors.surface,
  },
  headerTitle: {
    ...Typography.h3,
    color: colors.text,
  },
  backBtn: {
    padding: Spacing.sm,
  },
  backText: {
    color: colors.primary,
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
    color: colors.text,
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
    color: colors.textDim,
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
