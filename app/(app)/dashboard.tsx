// @ts-nocheck
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { Typography, Spacing } from "../../constants/theme";
import { useThemeStore } from "../../store/useThemeStore";
import {
  useRoadmaps,
  useRoadmapsCatalog,
  useGenerateRoadmap,
} from "../../hooks/useRoadmaps";
import { useEnrollments } from "../../hooks/useEnrollments";
import { useProgress } from "../../hooks/useProgress";
import { useRouter } from "expo-router";
import { MotiView } from "moti";
import { Ionicons } from "@expo/vector-icons";
import { NotificationsBottomSheet } from "../../components/modals/NotificationsBottomSheet";
import { LockedRoadmapModal } from "../../components/modals/LockedRoadmapModal";
import { AppUpdateModal } from "../../components/modals/AppUpdateModal";
import {
  BrainCircuit,
  Star,
  Server,
  Sparkles,
  ArrowRight,
  Loader2,
  LayoutGrid,
} from "lucide-react-native";

const IconMap: Record<string, any> = {
  BrainCircuit,
  Server,
  Sparkles,
  LayoutGrid,
};

export default function DashboardScreen() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [isNotificationsVisible, setNotificationsVisible] = useState(false);
  const [lockedModalVisible, setLockedModalVisible] = useState(false);
  
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);

  const { data: roadmapsCatalog = [], isLoading: isLoadingCatalog } =
    useRoadmapsCatalog();
  const { data: customRoadmaps = [], isLoading: isLoadingCustom } =
    useRoadmaps();
  const { data: enrolledIds = [], isLoading: isLoadingEnrollments } =
    useEnrollments();
  const { data: progressData, isLoading: isLoadingProgress } = useProgress();
  const generateRoadmap = useGenerateRoadmap();

  const isLoading =
    isLoadingCatalog || isLoadingEnrollments || isLoadingProgress;

  const enrolledRoadmaps = roadmapsCatalog.filter((r) =>
    enrolledIds.includes(r.id as string),
  );

  const handleGenerate = async () => {
    if (!topic.trim() || generateRoadmap.isPending) return;
    try {
      await generateRoadmap.mutateAsync({ topic });
      setTopic("");
    } catch (e) {}
  };

  const getProgressPercent = (roadmapId: string, roadmap: any) => {
    const completedTopics = progressData?.[roadmapId] || [];
    const completedSet = new Set(completedTopics);

    let total = 0;
    let done = 0;

    roadmap.modules?.forEach((m: any) => {
      m.topics?.forEach((t: any) => {
        const items = t.objectives || t.problems || [];
        items.forEach((obj: any) => {
          const title = typeof obj === "object" ? obj.title : obj;
          total++;
          if (completedSet.has(title)) done++;
        });
      });
    });

    return total > 0 ? Math.round((done / total) * 100) : 0;
  };

  const getColorHex = (colorName: string) => {
    return colors.primary;
  };

  return (
    <View style={{ flex: 1 }}>
      <KeyboardAwareScrollView 
        style={styles.container} 
        contentContainerStyle={styles.content}
        enableOnAndroid={true}
        extraScrollHeight={20}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        bounces={true}
      >
      <View style={[styles.header, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <BrainCircuit size={40} color={colors.primary} />
          <Text style={styles.title}>Your Dashboard</Text>
        </View>
        <TouchableOpacity onPress={() => setNotificationsVisible(true)} style={{ padding: 8 }}>
          <Ionicons name="notifications-outline" size={28} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Enrolled Roadmaps</Text>
          <TouchableOpacity onPress={() => router.push("/(app)/roadmaps")}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <Text style={styles.linkText}>Browse More</Text>
              <ArrowRight size={14} color={colors.primary} />
            </View>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <ActivityIndicator
            size="large"
            color={colors.primary}
            style={{ marginVertical: 20 }}
          />
        ) : enrolledRoadmaps.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconBox}>
              <BrainCircuit
                size={32}
                color={colors.primary}
                style={{ opacity: 0.5 }}
              />
            </View>
            <Text style={styles.emptyTitle}>No active roadmaps</Text>
            <Text style={styles.emptyText}>
              You haven't enrolled in any curriculum roadmaps yet. Explore the
              catalog to start learning!
            </Text>
            <TouchableOpacity
              style={styles.exploreBtn}
              onPress={() => router.push("/(app)/roadmaps")}
            >
              <Text style={styles.exploreBtnText}>
                Explore Curriculum Catalog
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          enrolledRoadmaps.map((roadmap, index) => {
            const progressPercent = getProgressPercent(roadmap.id as string, roadmap);
            const Icon = IconMap[roadmap.image as string] || LayoutGrid;
            const colorHex = getColorHex(roadmap.color);

            return (
              <MotiView 
                key={roadmap.id} 
                from={{ opacity: 0, translateY: 20 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ delay: index * 100, type: "timing", duration: 400 }}
                style={{ marginBottom: 16 }}
              >
                <TouchableOpacity
                  style={[styles.card, { marginBottom: 0 }]}
                  activeOpacity={0.7}
                  onPress={() => {
                    const lowerTitle = roadmap.title.toLowerCase();
                    const isAllowed = lowerTitle.includes("data structure") || lowerTitle.includes("dsa") || lowerTitle.includes("frontend");
                    if (!isAllowed) {
                      setLockedModalVisible(true);
                      return;
                    }
                    router.push(`/(app)/roadmaps/${roadmap.id}`);
                  }}
                >
                  {progressPercent === 100 && (
                    <MotiView
                      style={styles.starBadge}
                      from={{ rotate: "0deg" }}
                      animate={{ rotate: "360deg" }}
                      transition={{ loop: true, type: "timing", duration: 6000 }}
                    >
                      <Star size={24} color="#facc15" fill="#facc15" />
                    </MotiView>
                  )}

                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <View
                      style={[
                        styles.iconBox,
                        {
                          backgroundColor: `${colorHex}33`,
                          borderColor: `${colorHex}4d`,
                          marginBottom: 0,
                        },
                      ]}
                    >
                      <Icon size={32} color={colorHex} />
                    </View>
                  </View>

                  <View style={styles.cardContent}>
                    <Text style={styles.cardTitle}>{roadmap.title}</Text>
                    <Text style={styles.cardSubtitle}>
                      {roadmap.modules?.length || 0} Modules • By{" "}
                      {roadmap.title.toLowerCase().includes("data structure") || roadmap.title.toLowerCase().includes("dsa") 
                        ? "Strivers" 
                        : roadmap.author === "roadmap.sh" 
                          ? "Pathwise" 
                          : roadmap.author || "Pathwise"}
                    </Text>

                    <View style={styles.progressContainer}>
                      <View
                        style={[
                          styles.progressBar,
                          {
                            width: `${progressPercent}%`,
                            backgroundColor: colorHex,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.progressText, { marginBottom: 0 }]}>
                      {progressPercent}% Complete
                    </Text>
                  </View>
                </TouchableOpacity>
              </MotiView>
            );
          })
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Custom AI Roadmaps</Text>

        {isLoadingCustom ? (
          <ActivityIndicator
            size="small"
            color={colors.primary}
            style={{ marginVertical: 20 }}
          />
        ) : customRoadmaps.length > 0 ? (
          <View style={styles.customGrid}>
            {customRoadmaps.map((roadmap: any, index: number) => {
              const colorHex = getColorHex(roadmap.color);
              return (
                <MotiView
                  key={roadmap.id}
                  from={{ opacity: 0, translateY: 20 }}
                  animate={{ opacity: 1, translateY: 0 }}
                  transition={{ delay: index * 100, type: "timing", duration: 400 }}
                  style={{ marginBottom: 16 }}
                >
                  <TouchableOpacity
                    style={[styles.card, { borderColor: `${colorHex}4d`, marginBottom: 0 }]}
                    activeOpacity={0.7}
                    onPress={() => {
                      const lowerTitle = roadmap.title.toLowerCase();
                      const isAllowed = lowerTitle.includes("data structure") || lowerTitle.includes("dsa") || lowerTitle.includes("frontend");
                      if (!isAllowed) {
                        setLockedModalVisible(true);
                        return;
                      }
                      router.push(`/(app)/roadmaps/${roadmap.id}`);
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <View
                        style={[
                          styles.iconBox,
                          {
                            backgroundColor: `${colorHex}33`,
                            borderColor: `${colorHex}4d`,
                            marginBottom: 0,
                          },
                        ]}
                      >
                        <Sparkles size={32} color={colorHex} />
                      </View>
                    </View>
                    <View style={styles.cardContent}>
                      <Text style={styles.cardTitle}>{roadmap.title}</Text>
                      <Text style={[styles.cardSubtitle, { marginBottom: 0 }]}>
                        {roadmap.modules?.length || 0} AI Modules • For "
                        {roadmap.topic}"
                      </Text>
                    </View>
                  </TouchableOpacity>
                </MotiView>
              );
            })}
          </View>
        ) : null}
      </View>

      <View style={styles.generateContainer}>
        <View style={styles.generateIconWrapper}>
          <BrainCircuit size={40} color={colors.primary} />
        </View>
        <Text style={styles.generateTitle}>Generate a Custom Roadmap</Text>
        <Text style={styles.generateDesc}>
          What do you want to learn? Enter any topic and our AI will deep
          research and map out the exact curriculum you need.
        </Text>

        <View style={styles.generateInputRow}>
          <TextInput
            style={styles.input}
            placeholder="e.g. Advanced Rust Concurrency"
            placeholderTextColor="#6b7280"
            value={topic}
            onChangeText={setTopic}
            editable={!generateRoadmap.isPending}
          />
          <TouchableOpacity
            style={[
              styles.generateBtn,
              { backgroundColor: colors.primary },
              (!topic.trim() || generateRoadmap.isPending) && { opacity: 0.5 },
            ]}
            onPress={handleGenerate}
            disabled={!topic.trim() || generateRoadmap.isPending}
          >
            {generateRoadmap.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Text style={styles.generateBtnText}>Generate</Text>
                <ArrowRight size={16} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
      </KeyboardAwareScrollView>
      
      <LockedRoadmapModal 
        isVisible={lockedModalVisible} 
        onClose={() => setLockedModalVisible(false)} 
      />
      
      <NotificationsBottomSheet 
        isVisible={isNotificationsVisible} 
        onClose={() => setNotificationsVisible(false)} 
        type="history"
      />

      <AppUpdateModal />
    </View>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: Spacing.lg, paddingTop: 20, paddingBottom: 40 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  title: { ...Typography.h1, color: colors.text, fontSize: 28 },
  section: { marginBottom: Spacing.xl },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  sectionTitle: { ...Typography.h2, color: colors.text, fontSize: 22 },
  linkText: { color: colors.primary, ...Typography.small, fontWeight: "bold" },
  card: {
    backgroundColor: colors.surface,
    padding: Spacing.lg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: Spacing.lg,
    flexDirection: "column",
    position: "relative",
  },
  customGrid: { gap: Spacing.lg },
  starBadge: { position: "absolute", top: 16, right: 16, zIndex: 10 },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  cardContent: { flex: 1 },
  cardTitle: { ...Typography.h3, color: colors.text, marginBottom: 4, fontSize: 20 },
  cardSubtitle: { ...Typography.small, color: colors.textMuted, marginBottom: 12 },
  progressContainer: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    marginBottom: 8,
  },
  progressBar: { height: "100%", borderRadius: 3 },
  progressText: {
    ...Typography.small,
    color: colors.textMuted,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 16,
  },
  viewBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 99,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  viewBtnText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  emptyState: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(59,130,246,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: { ...Typography.h3, color: colors.text, marginBottom: 8 },
  emptyText: {
    ...Typography.body,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: 24,
  },
  exploreBtn: {
    backgroundColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exploreBtnText: { color: colors.text, fontWeight: "600" },

  generateContainer: {
    backgroundColor: colors.surface,
    padding: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.3)",
    alignItems: "center",
    marginTop: Spacing.md,
  },
  generateIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(59,130,246,0.1)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  generateTitle: {
    ...Typography.h2,
    color: colors.text,
    marginBottom: 12,
    textAlign: "center",
    fontSize: 24,
  },
  generateDesc: {
    ...Typography.body,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 24,
  },
  generateInputRow: { flexDirection: "column", width: "100%", gap: 16 },
  input: {
    width: "100%",
    backgroundColor: "rgba(128,128,128,0.1)",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    color: colors.text,
    fontSize: 16,
  },
  generateBtn: {
    flexDirection: "row",
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  generateBtnText: {
    ...Typography.body,
    fontWeight: "bold",
    color: "#fff",
    fontSize: 16,
  },
});
