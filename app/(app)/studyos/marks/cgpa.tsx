import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSubjects } from '../../../../hooks/useSubjects';
import { useThemeStore } from '../../../../store/useThemeStore';
import { Typography, Spacing, Radius } from '../../../../constants/theme';
import { GlassCard } from '../../../../components/ui/GlassCard';
import { useHardwareBack } from '../../../../hooks/useHardwareBack';

export default function CGPABacktrackerScreen() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const router = useRouter();
  useHardwareBack('/studyos/marks');
  const { data: subjects } = useSubjects();
  const [targetCGPA, setTargetCGPA] = useState('8.0');

  // Simple mock simulation since we don't have credits per subject mapped yet from Moodle API
  // In a real scenario, credits would be fetched from API or mapped locally.
  const target = parseFloat(targetCGPA) || 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/studyos/marks' as any)} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>CGPA Target</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>What's your target CGPA?</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={targetCGPA}
            onChangeText={setTargetCGPA}
            maxLength={4}
          />
        </View>
        <Text style={styles.helperText}>Enter a value between 4.0 and 10.0</Text>

        <Text style={styles.sectionTitle}>Analysis per Subject</Text>
        
        {subjects?.map((subject) => {
          // Mock Math for UI visualization as per spec:
          // Points needed = Target CGPA * Total Credits...
          // For now, generating a static visual based on the target
          let status = 'Achievable';
          let statusColor = colors.success;
          let marksNeeded = '55 / 80';

          if (target > 9.5) {
            status = 'Not possible';
            statusColor = colors.error;
            marksNeeded = '85 / 80'; // impossible
          } else if (target > 8.5) {
            status = 'Difficult';
            statusColor = '#f59e0b'; // orange
            marksNeeded = '75 / 80';
          }

          return (
            <GlassCard key={subject.id} style={styles.card}>
              <Text style={styles.subjectName}>{subject.fullname}</Text>
              <Text style={styles.infoText}>You need {marksNeeded} marks in remaining exams.</Text>
              <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                <Text style={[styles.statusText, { color: statusColor }]}>{status}</Text>
              </View>
            </GlassCard>
          );
        })}
      </ScrollView>
    </View>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.md, paddingTop: 40, backgroundColor: colors.surface,
  },
  headerTitle: { ...Typography.h3, color: colors.text },
  backBtn: { padding: Spacing.sm },
  backText: { color: colors.primary, fontSize: 16 },
  placeholder: { width: 50 },
  content: { padding: Spacing.xl },
  label: { ...Typography.h2, color: colors.text, textAlign: 'center', marginBottom: Spacing.md },
  inputContainer: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  input: {
    ...Typography.h1,
    color: colors.primary,
    fontWeight: 'bold',
    fontSize: 48,
    textAlign: 'center',
  },
  helperText: { ...Typography.body, color: colors.textDim, textAlign: 'center', marginBottom: Spacing.xxl },
  sectionTitle: { ...Typography.h3, color: colors.text, marginBottom: Spacing.md },
  card: { marginBottom: Spacing.md, padding: Spacing.md },
  subjectName: { ...Typography.h3, color: colors.text, marginBottom: Spacing.xs },
  infoText: { ...Typography.body, color: colors.textDim, marginBottom: Spacing.md },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full },
  statusText: { fontSize: 12, fontWeight: 'bold' },
});
