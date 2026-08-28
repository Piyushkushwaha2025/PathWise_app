import React from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity } from 'react-native';
import { useThemeStore } from '../../../store/useThemeStore';
import { useStudyOSStore } from '../../../store/studyosStore';
import { Typography, Spacing } from '../../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function StudyOSSettingsScreen() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const router = useRouter();

  const showHistoryDates = useStudyOSStore(s => s.showHistoryDates);
  const setShowHistoryDates = useStudyOSStore(s => s.setShowHistoryDates);
  const roundAttendancePercentage = useStudyOSStore(s => s.roundAttendancePercentage);
  const setRoundAttendancePercentage = useStudyOSStore(s => s.setRoundAttendancePercentage);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Show Dates on Dashboard</Text>
            <Text style={styles.settingDesc}>Display the date next to the attendance dots (e.g., 27 Aug)</Text>
          </View>
          <Switch
            value={showHistoryDates}
            onValueChange={(val) => setShowHistoryDates(val)}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={'#ffffff'}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Round Attendance %</Text>
            <Text style={styles.settingDesc}>Show whole numbers (e.g., 75%) instead of decimals (75.4%)</Text>
          </View>
          <Switch
            value={roundAttendancePercentage}
            onValueChange={(val) => setRoundAttendancePercentage(val)}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={'#ffffff'}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    ...Typography.h2,
    color: colors.text,
  },
  content: {
    padding: Spacing.lg,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingInfo: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  settingTitle: {
    ...Typography.body,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  settingDesc: {
    ...Typography.small,
    color: colors.textMuted,
  },
});
