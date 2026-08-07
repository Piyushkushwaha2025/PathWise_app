import { useThemeStore } from '../../../../store/useThemeStore';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSubjects } from '../../../../hooks/useSubjects';
import { Typography, Spacing } from '../../../../constants/theme';

export default function SubjectRoadmapScreen() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const { subjectId } = useLocalSearchParams();
  const router = useRouter();
  const { data: subjects } = useSubjects();
  
  const subject = subjects?.find(s => s.id.toString() === subjectId);

  if (!subject) {
    return <View style={styles.centerContainer}><Text>Subject not found</Text></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{subject.shortname} Roadmap</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.centerContainer}>
        <Text style={styles.title}>No Roadmap Available</Text>
        <Text style={styles.subtitle}>
          This subject does not have a predefined roadmap yet.
        </Text>
      </View>
    </View>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.md, paddingTop: 40, backgroundColor: colors.surface,
  },
  headerTitle: { ...Typography.h3, color: colors.text, flex: 1, textAlign: 'center' },
  backBtn: { padding: Spacing.sm },
  backText: { color: colors.primary, fontSize: 16 },
  placeholder: { width: 50 },
  title: { ...Typography.h2, color: colors.text, marginBottom: Spacing.sm, textAlign: 'center' },
  subtitle: { ...Typography.body, color: colors.textDim, textAlign: 'center', marginBottom: Spacing.xxl },
});

