import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Flame, Star, BookOpen, Calendar, Activity, GraduationCap, LogOut, LayoutGrid } from 'lucide-react-native';
import { Typography, Spacing } from '../../../constants/theme';
import { useThemeStore } from '../../../store/useThemeStore';
import { useCuSessionStore } from '../../../store/cuSessionStore';
import { useStudyOSStore } from '../../../store/studyosStore';
import { MotiView } from 'moti';

export default function StudyOSDashboard() {
  const router = useRouter();
  const { clearSession } = useCuSessionStore();
  const { streak, xp, loadGamification } = useStudyOSStore();
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);

  useEffect(() => {
    loadGamification();
  }, []);

  const handleLogout = async () => {
    await clearSession();
    router.replace('/(app)/studyos/connect');
  };

  const menuItems = [
    {
      title: "Smart Subjects",
      subtitle: "AI-generated roadmaps & doubts",
      icon: BookOpen,
      color: colors.primary,
      route: "/(app)/studyos/subjects"
    },
    {
      title: "Attendance",
      subtitle: "Track attendance & bunk calculator",
      icon: Activity,
      color: colors.success,
      route: "/(app)/studyos/attendance"
    },
    {
      title: "Timetable",
      subtitle: "Check your weekly schedule",
      icon: Calendar,
      color: colors.warning,
      route: "/(app)/studyos/timetable"
    },
    {
      title: "Marks & CGPA",
      subtitle: "Check MST scores and target CGPA",
      icon: GraduationCap,
      color: colors.accent,
      route: "/(app)/studyos/marks"
    }
  ];

  return (
    <View style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <LayoutGrid size={36} color={colors.primary} />
            <Text style={styles.title}>StudyOS</Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={{ padding: 8 }}>
            <LogOut size={28} color={colors.error} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <View style={styles.gamificationRow}>
            <View style={styles.statBadge}>
              <Flame size={20} color="#f97316" fill="#f97316" />
              <Text style={styles.statText}>{streak} Day Streak</Text>
            </View>
            <View style={styles.statBadge}>
              <Star size={20} color="#eab308" fill="#eab308" />
              <Text style={styles.statText}>{xp} XP</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Your Workspace</Text>

          {menuItems.map((item, index) => {
            const Icon = item.icon;
            const colorHex = item.color;
            
            return (
              <MotiView
                key={index}
                from={{ opacity: 0, translateY: 20 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ delay: index * 100, type: "timing", duration: 400 }}
                style={{ marginBottom: 16 }}
              >
                <TouchableOpacity
                  style={styles.card}
                  activeOpacity={0.7}
                  onPress={() => router.push(item.route as any)}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View
                      style={[
                        styles.iconBox,
                        {
                          backgroundColor: `${colorHex}22`,
                          borderColor: `${colorHex}4d`,
                        },
                      ]}
                    >
                      <Icon size={32} color={colorHex} />
                    </View>
                    <View style={styles.cardContent}>
                      <Text style={styles.cardTitle}>{item.title}</Text>
                      <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </MotiView>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: Spacing.lg,
    paddingTop: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  title: {
    ...Typography.h1,
    color: colors.text,
    fontSize: 28,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.h2,
    color: colors.text,
    fontSize: 22,
    marginBottom: Spacing.lg,
  },
  gamificationRow: {
    flexDirection: 'row',
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statText: {
    ...Typography.body,
    color: colors.text,
    fontWeight: 'bold',
    marginLeft: Spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    padding: Spacing.lg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "column",
    position: "relative",
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginRight: Spacing.md,
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center',
  },
  cardTitle: {
    ...Typography.h3,
    color: colors.text,
    marginBottom: 4,
    fontSize: 20,
  },
  cardSubtitle: {
    ...Typography.small,
    color: colors.textMuted,
  },
});
