import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Typography, Spacing } from "../../constants/theme";
import { useThemeStore } from "../../store/useThemeStore";
import { MotiView } from "moti";
import { Construction } from "lucide-react-native";
import { GlassCard } from "../../components/ui/GlassCard";

export default function StudyOSScreen() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>StudyOS</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <MotiView
          from={{ translateY: -10, rotate: "-5deg" }}
          animate={{ translateY: 10, rotate: "5deg" }}
          transition={{ loop: true, type: "timing", duration: 1500 }}
          style={styles.iconWrapper}
        >
          <Construction size={80} color={colors.primary} />
        </MotiView>

        <Text style={styles.title}>Hold your horses! 🐎</Text>
        <Text style={styles.subtitle}>
          Our AI monkeys are currently working in the secret underground lab.
        </Text>

        <GlassCard style={styles.card}>
          <Text style={styles.cardTitle}>What are we cooking? 🍳</Text>
          <Text style={styles.cardText}>
            After logging in, StudyOS will instantly display your university subjects, complete with their credit values and an AI-predicted hardness level! 📊
          </Text>
          <Text style={styles.cardText2}>
            With a single tap, get a full roadmap loaded with YouTube videos, exercises, AI quizzes, and a progress bar! 🚀
            {"\n\n"}
            Plus: A dedicated StudyOS Streak Tracker 🔥, In-App AI Doubt Solver 🤖, Focus Timer ⏱️, and a Community Notes Hub 📚!
          </Text>
        </GlassCard>

        <Text style={styles.footer}>Coming Very Soon...</Text>
      </ScrollView>
    </View>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: colors.background 
  },
  header: { 
    padding: Spacing.lg, 
    paddingTop: 20, 
    backgroundColor: colors.surface 
  },
  headerTitle: { 
    ...Typography.h2, 
    color: colors.text 
  },
  content: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
    paddingBottom: 100, // Extra padding at bottom specifically for tabs
  },
  iconWrapper: {
    marginBottom: Spacing.xl,
  },
  title: {
    ...Typography.h2,
    color: colors.text,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  subtitle: {
    ...Typography.body,
    color: colors.textDim,
    textAlign: "center",
    marginBottom: Spacing.xxl,
    fontSize: 16,
  },
  card: {
    padding: Spacing.lg,
    width: "100%",
  },
  cardTitle: {
    ...Typography.h3,
    color: colors.primary,
    marginBottom: Spacing.md,
  },
  cardText: {
    ...Typography.body,
    color: colors.text,
    marginBottom: Spacing.md,
    lineHeight: 22,
  },
  cardText2: {
    ...Typography.body,
    color: colors.text,
    lineHeight: 22,
    fontWeight: "bold",
  },
  footer: {
    ...Typography.h3,
    color: colors.textDim,
    marginTop: Spacing.xxl,
    marginBottom: 80, // Adds space so it doesn't hide behind bottom tabs
  }
});
