import React from 'react';
import * as Haptics from 'expo-haptics';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { BookOpen, Activity, LayoutGrid, CreditCard } from 'lucide-react-native';
import { Typography, Spacing } from '../../../constants/theme';
import { useThemeStore } from '../../../store/useThemeStore';
import { MotiView } from 'moti';

export default function StudyOSHubScreen() {
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);

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
      title: "Fee Details",
      subtitle: "Check fee receipts and dues",
      icon: CreditCard,
      color: colors.warning,
      route: "/(app)/studyos/fees" // Assuming this exists or will exist
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
            <Text style={styles.title}>Study Hub</Text>
          </View>
        </View>

        <View style={styles.section}>
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
                  onPress={() => {
                    Haptics.selectionAsync();
                    router.push(item.route as any);
                  }}
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
    paddingTop: 40,
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
