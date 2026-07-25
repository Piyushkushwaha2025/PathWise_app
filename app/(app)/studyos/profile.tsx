import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useThemeStore } from '../../../store/useThemeStore';
import { useStudySessionStore } from '../../../store/studySessionStore';
import { useStudyOSStore } from '../../../store/studyosStore';
import { Typography, Spacing } from '../../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { GlassCard } from '../../../components/ui/GlassCard';
import { useRouter } from 'expo-router';

export default function CollegeProfileScreen() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const router = useRouter();
  
  const { profile } = useStudyOSStore();
  const { setStudyOSMode, clearSession, universityId } = useStudySessionStore();

  const handleSwitch = () => {
    // Navigate FIRST, then change mode after small delay.
    // This prevents tabs from visually shifting while user is still on this screen.
    router.replace('/(app)/dashboard');
    setTimeout(() => {
      setStudyOSMode(false);
    }, 50);
  };

  const handleDisconnect = () => {
    Alert.alert(
      "Disconnect",
      "Are you sure you want to log out from your college account?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Disconnect", 
          style: "destructive",
          onPress: async () => {
            // Navigate to dashboard FIRST before clearing session.
            // This prevents the TabBar from re-rendering in StudyOS context
            // with isStudyOSMode=false, which causes tabs to visually shift.
            router.replace('/(app)/dashboard');
            // Small delay to let navigation settle before state change
            setTimeout(async () => {
              await clearSession();
            }, 50);
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <MotiView
          from={{ opacity: 0, translateY: -10 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 400 }}
          style={styles.header}
        >
          <View style={styles.idCard}>
            <View style={styles.idHeader}>
              <Ionicons name="school" size={40} color={colors.primary} />
              <Text style={styles.uniName}>{universityId?.toUpperCase() || 'UNIVERSITY'}</Text>
            </View>
            <View style={styles.idBody}>
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={40} color={colors.background} />
              </View>
              <View style={styles.infoCol}>
                <Text style={styles.studentName}>{profile?.name || 'Student Name'}</Text>
                <Text style={styles.infoText}>{profile?.course || 'No Course'}</Text>
                {profile?.semester && profile.semester !== 'N/A' && (
                  <Text style={styles.infoText}>Semester {profile.semester}</Text>
                )}
                <Text style={styles.infoText}>{profile?.uid ? `UID: ${profile.uid}` : 'UID: N/A'}</Text>
              </View>
            </View>
            <View style={styles.cgpaBadge}>
              <Text style={styles.cgpaLabel}>CGPA</Text>
              <Text style={styles.cgpaValue}>{profile?.cgpa || 'N/A'}</Text>
            </View>
          </View>
        </MotiView>

        <MotiView
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ delay: 200 }}
        >
          <Text style={styles.sectionTitle}>Account Actions</Text>

          <GlassCard style={styles.menuCard}>
            <TouchableOpacity style={styles.menuItem} onPress={handleSwitch}>
              <Ionicons name="swap-horizontal" size={20} color={colors.primary} />
              <Text style={styles.menuLabel}>Switch to Pathwise Profile</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuItem} onPress={handleDisconnect}>
              <Ionicons name="log-out-outline" size={20} color={colors.error} />
              <Text style={[styles.menuLabel, { color: colors.error }]}>Disconnect College</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.error} />
            </TouchableOpacity>
          </GlassCard>
        </MotiView>
      </ScrollView>
    </View>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: Spacing.lg, paddingTop: 40, gap: Spacing.lg },
  header: { alignItems: 'center' },
  idCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: Spacing.lg,
    position: 'relative',
    overflow: 'hidden',
  },
  idHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  uniName: {
    ...Typography.h2,
    color: colors.primary,
    flex: 1,
  },
  idBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  avatarPlaceholder: {
    width: 80,
    height: 100,
    backgroundColor: colors.textDim,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCol: { flex: 1, gap: 4 },
  studentName: { ...Typography.h3, color: colors.text, marginBottom: 4 },
  infoText: { ...Typography.body, color: colors.textDim },
  cgpaBadge: {
    position: 'absolute',
    bottom: Spacing.lg,
    right: Spacing.lg,
    alignItems: 'center',
    backgroundColor: `${colors.primary}20`,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  cgpaLabel: { fontSize: 12, color: colors.primary, fontWeight: 'bold' },
  cgpaValue: { fontSize: 24, color: colors.primary, fontWeight: 'bold' },
  sectionTitle: { ...Typography.h2, color: colors.text, marginBottom: Spacing.md },
  menuCard: { padding: Spacing.sm },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  menuLabel: { ...Typography.body, flex: 1, color: colors.text, fontWeight: "600" },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: Spacing.md },
});
