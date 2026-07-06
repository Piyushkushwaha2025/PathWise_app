import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Typography, Spacing } from "../../constants/theme";
import { useThemeStore } from "../../store/useThemeStore";
import { SubscriptionSoonModal } from "../../components/modals/SubscriptionSoonModal";

export default function SubscriptionScreen() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const [soonModalVisible, setSoonModalVisible] = useState(false);

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>
          Simple, transparent{" "}
          <Text style={{ color: colors.primary }}>pricing</Text>
        </Text>
        <Text style={styles.subtitle}>
          Start learning for free, upgrade when you need superpowers.
        </Text>
      </View>

      {/* Explorer Tier */}
      <View style={styles.card}>
        <Text style={styles.tierName}>Explorer</Text>
        <Text style={styles.tierDesc}>Perfect to get started</Text>

        <View style={styles.priceRow}>
          <Text style={styles.price}>₹0</Text>
          <Text style={styles.priceMonth}>/month</Text>
        </View>

        <View style={styles.featuresList}>
          {[
            "Access Readymade Roadmaps",
            "3 Custom AI Roadmaps / month",
            "StudyOS (1 Subject Free)",
            "Progress Tracking & Streaks",
          ].map((feat, i) => (
            <View key={i} style={styles.featureItem}>
              <View style={styles.dot} />
              <Text style={styles.featureText}>{feat}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.buttonOutline}>
          <Text style={styles.buttonOutlineText}>Current Plan</Text>
        </TouchableOpacity>
      </View>

      {/* Pro Tier */}
      <LinearGradient
        colors={[colors.surface, `${colors.primary}15`]}
        style={[styles.card, styles.cardPro]}
      >
        <View style={styles.badge}>
          <Text style={styles.badgeText}>POPULAR</Text>
        </View>

        <Text style={[styles.tierName, { color: colors.primary }]}>Pro</Text>
        <Text style={styles.tierDesc}>For serious learners</Text>

        <View style={styles.priceRow}>
          <Text style={styles.price}>₹59</Text>
          <Text style={styles.priceMonth}>/month</Text>
        </View>

        <View style={styles.featuresList}>
          {[
            "Unlimited Custom AI Roadmaps",
            "StudyOS Pro (Full Semester)",
            "Unlimited AI Doubt Solver",
            "AI Quizzes & Mock Tests",
            "Premium Notes & PYQs",
          ].map((feat, i) => (
            <View key={i} style={styles.featureItem}>
              <View style={styles.dot} />
              <Text style={styles.featureText}>{feat}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity 
          style={styles.buttonSolid}
          onPress={() => setSoonModalVisible(true)}
        >
          <Text style={styles.buttonSolidText}>Upgrade to Pro</Text>
        </TouchableOpacity>
      </LinearGradient>
    </ScrollView>

    <SubscriptionSoonModal 
      isVisible={soonModalVisible} 
      onClose={() => setSoonModalVisible(false)} 
    />
    </>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: Spacing.lg, paddingTop: 20, paddingBottom: 40 },
  header: { marginBottom: Spacing.xl, alignItems: "center" },
  title: {
    ...Typography.h1,
    color: colors.text,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  subtitle: { ...Typography.body, color: colors.textDim, textAlign: "center" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: Spacing.lg,
  },
  cardPro: {
    borderColor: `${colors.primary}80`,
    borderWidth: 2,
  },
  badge: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomLeftRadius: 16,
    borderTopRightRadius: 22,
  },
  badgeText: { fontSize: 10, fontWeight: "bold", color: "white" },
  tierName: { ...Typography.h2, color: colors.text, marginBottom: 4 },
  tierDesc: {
    ...Typography.body,
    color: colors.textDim,
    marginBottom: Spacing.lg,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: Spacing.xl,
  },
  price: { fontSize: 48, fontWeight: "bold", color: colors.text },
  priceMonth: { fontSize: 16, color: colors.textDim, marginLeft: 4 },
  featuresList: { gap: 16, marginBottom: Spacing.xl },
  featureItem: { flexDirection: "row", alignItems: "center", gap: 12 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  featureText: { ...Typography.body, color: colors.text },
  buttonOutline: {
    padding: Spacing.md,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  buttonOutlineText: {
    ...Typography.body,
    fontWeight: "500",
    color: colors.text,
  },
  buttonSolid: {
    padding: Spacing.md,
    borderRadius: 100,
    backgroundColor: colors.primary,
    alignItems: "center",
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  buttonSolidText: { ...Typography.body, fontWeight: "bold", color: "white" },
});
