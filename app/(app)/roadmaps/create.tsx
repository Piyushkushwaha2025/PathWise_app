import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import { MotiView } from "moti";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { GradientButton } from "../../../components/ui/GradientButton";
import { GlassCard } from "../../../components/ui/GlassCard";
import { useGenerateRoadmap } from "../../../hooks/useRoadmaps";
import { useToggleEnrollment } from "../../../hooks/useEnrollments";
import { Colors, Typography, Spacing } from "../../../constants/theme";

const LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;
type Level = (typeof LEVELS)[number];

export default function CreateRoadmapScreen() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<Level>("Beginner");
  const [error, setError] = useState("");

  const generateMutation = useGenerateRoadmap();
  const enrollMutation = useToggleEnrollment();

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setError("Please enter what you want to learn.");
      return;
    }
    setError("");

    try {
      const result = await generateMutation.mutateAsync({
        topic: topic.trim(),
      });
      // Auto-enroll in the newly generated roadmap
      await enrollMutation.mutateAsync({
        roadmapId: result.roadmap._id,
        action: "enroll",
      });
      router.replace(`/(app)/roadmaps/${result.roadmap._id}`);
    } catch {
      setError(
        "Failed to generate roadmap. Make sure your internet and server are running.",
      );
    }
  };

  const isLoading = generateMutation.isPending || enrollMutation.isPending;

  if (isLoading) {
    return (
      <View style={styles.loadingRoot}>
        <MotiView
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ type: "timing", duration: 1500, loop: true }}
          style={styles.loadingContent}
        >
          <LinearGradient colors={Colors.gradient} style={styles.loadingOrb} />
          <Text style={styles.loadingTitle}>
            {"AI is crafting your path..."}
          </Text>
          <Text style={styles.loadingSubtitle}>
            {"Analyzing topic and building modules"}
          </Text>
        </MotiView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>

        <MotiView
          from={{ opacity: 0, translateY: 20 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 400 }}
        >
          <Text style={styles.heading}>{"Generate Your"}</Text>
          <Text style={[styles.heading, { color: Colors.primary }]}>
            {"Learning Path"}
          </Text>
          <Text style={styles.subheading}>
            {"AI will build a structured roadmap tailored to your goal"}
          </Text>
        </MotiView>

        {/* Topic Input */}
        <MotiView
          from={{ opacity: 0, translateY: 20 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 400, delay: 100 }}
        >
          <GlassCard style={styles.inputCard}>
            <Text style={styles.inputLabel}>
              {"What do you want to learn?"}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Machine Learning, React Native, DSA..."
              placeholderTextColor={Colors.textDim}
              value={topic}
              onChangeText={setTopic}
              multiline
              numberOfLines={3}
              returnKeyType="done"
              blurOnSubmit
            />
          </GlassCard>
        </MotiView>

        {/* Level Selector */}
        <MotiView
          from={{ opacity: 0, translateY: 20 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 400, delay: 180 }}
        >
          <GlassCard style={styles.levelCard}>
            <Text style={styles.inputLabel}>{"Your current level"}</Text>
            <View style={styles.levelRow}>
              {LEVELS.map((l) => (
                <TouchableOpacity
                  key={l}
                  style={[
                    styles.levelChip,
                    level === l && styles.levelChipActive,
                  ]}
                  onPress={() => setLevel(l)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.levelChipText,
                      level === l && styles.levelChipTextActive,
                    ]}
                  >
                    {l}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </GlassCard>
        </MotiView>

        {error.length > 0 && <Text style={styles.errorText}>{error}</Text>}

        {/* Generate Button */}
        <MotiView
          from={{ opacity: 0, translateY: 20 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 400, delay: 260 }}
        >
          <GradientButton
            label="Generate Roadmap ✨"
            onPress={handleGenerate}
            icon="sparkles-outline"
            size="lg"
          />
        </MotiView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: {
    padding: Spacing.lg,
    paddingTop: 20,
    gap: Spacing.lg,
    paddingBottom: 40,
  },
  backBtn: { marginBottom: Spacing.md, width: 36 },
  heading: { ...Typography.h1, color: Colors.text },
  subheading: { ...Typography.body, color: Colors.textMuted, marginTop: 8 },
  inputCard: { gap: 12 },
  inputLabel: { ...Typography.label, color: Colors.textMuted },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 14,
    color: Colors.text,
    ...Typography.body,
    minHeight: 80,
    textAlignVertical: "top",
  },
  levelCard: { gap: 12 },
  levelRow: { flexDirection: "row", gap: 10 },
  levelChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    backgroundColor: Colors.surface,
  },
  levelChipActive: {
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}20`,
  },
  levelChipText: { ...Typography.label, color: Colors.textMuted },
  levelChipTextActive: { color: Colors.primary, fontWeight: "700" },
  errorText: { ...Typography.small, color: Colors.error },
  // Loading state
  loadingRoot: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  loadingContent: { alignItems: "center", gap: Spacing.lg },
  loadingOrb: { width: 120, height: 120, borderRadius: 60 },
  loadingTitle: { ...Typography.h2, color: Colors.text, textAlign: "center" },
  loadingSubtitle: {
    ...Typography.body,
    color: Colors.textMuted,
    textAlign: "center",
  },
});
