import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Linking,
  LayoutAnimation,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MotiView } from "moti";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { GlassCard } from "../../../components/ui/GlassCard";
import { GradientButton } from "../../../components/ui/GradientButton";
import { ProgressBar } from "../../../components/ui/ProgressBar";
import { useRoadmaps, useRoadmapsCatalog } from "../../../hooks/useRoadmaps";
import { useProgress, useSaveProgress } from "../../../hooks/useProgress";
import {
  useEnrollments,
  useToggleEnrollment,
} from "../../../hooks/useEnrollments";
import { Typography, Spacing } from "../../../constants/theme";
import { useThemeStore } from "../../../store/useThemeStore";
import Markdown from "react-native-markdown-display";
import {
  ChevronRight,
  ChevronDown,
  Play,
  FileText,
  CheckCircle2,
  Code2,
  Rocket,
  Map,
} from "lucide-react-native";

export default function RoadmapDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: customRoadmaps = [], isLoading: isLoadingCustom } =
    useRoadmaps();
  const { data: catalogRoadmaps = [], isLoading: isLoadingCatalog } =
    useRoadmapsCatalog();
  const { data: progress = {} } = useProgress();
  const { data: enrolledIds = [] } = useEnrollments();
  const saveProgressMutation = useSaveProgress();
  const toggleEnrollment = useToggleEnrollment();

  const allRoadmaps = [...customRoadmaps, ...catalogRoadmaps];
  const roadmap = allRoadmaps.find((r) => r._id === id || r.id === id);
  const completedTopics = progress[id ?? ""] ?? [];
  const completedSet = new Set(completedTopics);
  const isEnrolled = enrolledIds.includes(roadmap?._id || roadmap?.id || "");

  const [expandedModules, setExpandedModules] = useState<Set<string>>(
    new Set(),
  );
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [openArticle, setOpenArticle] = useState<string | null>(null);

  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);

  if (isLoadingCustom || isLoadingCatalog) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!roadmap) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Roadmap not found.</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text
            style={[styles.errorText, { color: colors.primary, marginTop: 8 }]}
          >
            Go Back
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleEnroll = async () => {
    if (isEnrolled) return;
    await toggleEnrollment.mutateAsync({
      roadmapId: (roadmap._id || roadmap.id) as string,
      action: "enroll",
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleToggleCheck = (title: string) => {
    if (!isEnrolled) {
      toggleEnrollment.mutate({
        roadmapId: (roadmap._id || roadmap.id) as string,
        action: "enroll",
      });
    }

    const newSet = new Set(completedTopics);
    if (newSet.has(title)) {
      newSet.delete(title);
    } else {
      newSet.add(title);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    saveProgressMutation.mutate({
      roadmapId: (roadmap._id || roadmap.id) as string,
      completedTopics: Array.from(newSet),
    });
  };

  const toggleModule = (moduleId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const newSet = new Set(expandedModules);
    if (newSet.has(moduleId)) newSet.delete(moduleId);
    else newSet.add(moduleId);
    setExpandedModules(newSet);
  };

  const toggleTopic = (topicTitle: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const newSet = new Set(expandedTopics);
    if (newSet.has(topicTitle)) newSet.delete(topicTitle);
    else newSet.add(topicTitle);
    setExpandedTopics(newSet);
  };

  // Calculate overall progress
  let totalOverall = 0;
  let doneOverall = 0;
  roadmap.modules?.forEach((m: any) => {
    m.topics?.forEach((t: any) => {
      const items = t.objectives || t.problems || (t.hindiVideo || t.englishVideo || t.practiceUrl ? [t] : [t]);
      items.forEach((obj: any) => {
        totalOverall++;
        const title = typeof obj === "object" ? obj.title : obj;
        if (completedSet.has(title)) doneOverall++;
      });
    });
  });
  const overallProgressPct = totalOverall > 0 ? doneOverall / totalOverall : 0;

  return (
    <View style={styles.root}>
      {/* Top Header matching Web HUD */}
      <View style={styles.hudHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.hudBack}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.hudTitleBox}>
          <View style={styles.hudIconWrapper}>
            <Rocket size={16} color={colors.primary} />
          </View>
          <View>
            <Text style={styles.hudTitle} numberOfLines={1}>
              {roadmap.title}
            </Text>
            <Text style={styles.hudSubtitle}>360° IMMERSIVE SANDBOX</Text>
          </View>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list}>
        {/* Progress Overview Panel */}
        <View style={styles.overviewPanel}>
          <View style={styles.overviewHeader}>
            <View>
              <Text style={styles.overviewTitle}>Roadmap Curriculum</Text>
              <Text style={styles.overviewSubtitle}>Problems & Resources</Text>
            </View>
            <View style={styles.progressWrap}>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.round(overallProgressPct * 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                {doneOverall} / {totalOverall}
              </Text>
            </View>
          </View>

          {!isEnrolled && (
            <TouchableOpacity style={styles.enrollBtn} onPress={handleEnroll}>
              <Text style={styles.enrollBtnText}>Enroll to Track Progress</Text>
            </TouchableOpacity>
          )}

          {/* Modules List */}
          <View style={styles.modulesContainer}>
            {roadmap.modules?.map((module: any, mIdx: number) => {
              const moduleId = module.id || `m-${mIdx}`;
              const isModuleExpanded = expandedModules.has(moduleId);

              let modTotal = 0;
              let modDone = 0;
              module.topics?.forEach((t: any) => {
                const items = t.objectives || t.problems || [];
                items.forEach((obj: any) => {
                  modTotal++;
                  const title = typeof obj === "object" ? obj.title : obj;
                  if (completedSet.has(title)) modDone++;
                });
              });
              const modProgress = modTotal > 0 ? modDone / modTotal : 0;
              const modIsCompleted = modProgress === 1 && modTotal > 0;

              return (
                <View
                  key={moduleId}
                  style={[
                    styles.moduleBlock,
                    modIsCompleted && styles.moduleBlockCompleted,
                  ]}
                >
                  <TouchableOpacity
                    style={styles.moduleHeader}
                    onPress={() => toggleModule(moduleId)}
                  >
                    <View style={styles.moduleHeaderLeft}>
                      {isModuleExpanded ? (
                        <ChevronDown size={18} color={colors.text} />
                      ) : (
                        <ChevronRight size={18} color={colors.textDim} />
                      )}
                      <Text
                        style={[
                          styles.moduleTitle,
                          modIsCompleted && { color: colors.primary },
                        ]}
                      >
                        {module.title.replace(/^Step \d+: /, "")}
                      </Text>
                    </View>
                    <View style={styles.modProgressWrap}>
                      <View style={styles.modProgressTrack}>
                        <View
                          style={[
                            styles.modProgressFill,
                            { 
                              width: `${Math.round(modProgress * 100)}%`,
                              backgroundColor: colors.primary 
                            }
                          ]}
                        />
                      </View>
                      <Text
                        style={[
                          styles.modProgressText,
                          modIsCompleted && { color: "#4ade80" },
                        ]}
                      >
                        {modDone} / {modTotal}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Topics List */}
                  {isModuleExpanded && (
                    <View style={styles.topicsContainer}>
                      {module.topics?.map((topic: any, tIdx: number) => {
                        const topicId = topic.title || `t-${tIdx}`;
                        const isTopicExpanded = expandedTopics.has(topicId);

                        let topTotal = 0;
                        let topDone = 0;
                        const items = topic.objectives || topic.problems || [topic];
                        items.forEach((obj: any) => {
                          topTotal++;
                          const title =
                            typeof obj === "object" ? obj.title : obj;
                          if (completedSet.has(title)) topDone++;
                        });
                        const topProgress =
                          topTotal > 0 ? topDone / topTotal : 0;
                        const topIsCompleted =
                          topProgress === 1 && topTotal > 0;

                        return (
                          <View key={topicId} style={styles.topicBlock}>
                            <TouchableOpacity
                              style={styles.topicHeader}
                              onPress={() => toggleTopic(topicId)}
                            >
                              <View style={styles.topicHeaderLeft}>
                                {isTopicExpanded ? (
                                  <ChevronDown size={16} color={colors.text} />
                                ) : (
                                  <ChevronRight size={16} color={colors.textDim} />
                                )}
                                <Text
                                  style={[
                                    styles.topicTitle,
                                    topIsCompleted && { color: "#4ade80" },
                                  ]}
                                >
                                  {topic.title}
                                </Text>
                              </View>
                              <View style={styles.topProgressWrap}>
                                <View style={styles.topProgressTrack}>
                                  <View
                                    style={[
                                      styles.topProgressFill,
                                      {
                                        width: `${Math.round(topProgress * 100)}%`,
                                        backgroundColor: colors.primary,
                                      },
                                    ]}
                                  />
                                </View>
                                <Text
                                  style={[
                                    styles.topProgressText,
                                    topIsCompleted && { color: colors.primary },
                                  ]}
                                >
                                  {topDone} / {topTotal}
                                </Text>
                              </View>
                            </TouchableOpacity>

                            {/* Problems Grid List */}
                            {isTopicExpanded && (
                              <View style={styles.problemsContainer}>
                                {items.map((obj: any, oIdx: number) => {
                                  const isComplex = typeof obj === "object";
                                  const title = isComplex ? obj.title : obj;
                                  const difficulty =
                                    isComplex && obj.difficulty
                                      ? obj.difficulty
                                      : "Medium";
                                  const articleContent =
                                    isComplex && obj.articleContent
                                      ? obj.articleContent
                                      : null;
                                  const articleUrl =
                                    isComplex && obj.articleUrl
                                      ? obj.articleUrl
                                      : null;
                                  const videoUrl =
                                    isComplex && obj.videoUrl
                                      ? obj.videoUrl
                                      : null;
                                  const hindiVideoUrl =
                                    isComplex && obj.hindiVideo?.url
                                      ? obj.hindiVideo.url
                                      : null;
                                  const englishVideoUrl =
                                    isComplex && obj.englishVideo?.url
                                      ? obj.englishVideo.url
                                      : null;
                                  const leetcodeUrl =
                                    isComplex && obj.leetcodeUrl
                                      ? obj.leetcodeUrl
                                      : null;
                                  const gfgUrl =
                                    isComplex && obj.gfgUrl ? obj.gfgUrl : null;
                                  const practiceUrl =
                                    isComplex && obj.practiceUrl
                                      ? obj.practiceUrl
                                      : null;

                                  const isDone = completedSet.has(title);

                                  return (
                                    <View key={oIdx} style={styles.problemRow}>
                                      <TouchableOpacity
                                        style={styles.checkBtn}
                                        onPress={() => handleToggleCheck(title)}
                                      >
                                        <CheckCircle2
                                          size={24}
                                          color={isDone ? "#10b981" : colors.textDim}
                                        />
                                      </TouchableOpacity>

                                      <View style={styles.problemInfo}>
                                        <Text
                                          style={[
                                            styles.problemTitle,
                                            isDone && { color: colors.textDim },
                                          ]}
                                        >
                                          {title}
                                        </Text>

                                        <View style={styles.badgesRow}>
                                          {/* Difficulty Badge */}
                                          <View
                                            style={[
                                              styles.diffBadge,
                                              difficulty === "Easy"
                                                ? styles.diffEasy
                                                : difficulty === "Hard"
                                                  ? styles.diffHard
                                                  : styles.diffMed,
                                            ]}
                                          >
                                            <Text
                                              style={[
                                                styles.diffText,
                                                difficulty === "Easy"
                                                  ? styles.diffTextEasy
                                                  : difficulty === "Hard"
                                                    ? styles.diffTextHard
                                                    : styles.diffTextMed,
                                              ]}
                                            >
                                              {difficulty}
                                            </Text>
                                          </View>

                                          {/* Resources */}
                                          {(articleContent || articleUrl) && (
                                            <TouchableOpacity
                                              style={styles.resourceBtn}
                                              onPress={() => {
                                                if (articleContent)
                                                  setOpenArticle(
                                                    articleContent,
                                                  );
                                                else if (
                                                  articleUrl &&
                                                  articleUrl !== "#"
                                                )
                                                  Linking.openURL(articleUrl);
                                              }}
                                            >
                                              <FileText
                                                size={12}
                                                color={colors.primary}
                                              />
                                              <Text style={[styles.resourceText, { color: colors.primary }]}>
                                                Article
                                              </Text>
                                            </TouchableOpacity>
                                          )}

                                          {videoUrl &&
                                            videoUrl !== "#" &&
                                            videoUrl !== "Upcoming" && (
                                              <TouchableOpacity
                                                style={styles.resourceBtn}
                                                onPress={() =>
                                                  Linking.openURL(videoUrl)
                                                }
                                              >
                                                <Play
                                                  size={12}
                                                  color="#f87171"
                                                />
                                                <Text
                                                  style={styles.resourceTextRed}
                                                >
                                                  Video
                                                </Text>
                                              </TouchableOpacity>
                                            )}

                                          {hindiVideoUrl && (
                                              <TouchableOpacity
                                                style={styles.resourceBtn}
                                                onPress={() =>
                                                  Linking.openURL(hindiVideoUrl)
                                                }
                                              >
                                                <Play size={12} color="#f87171" />
                                                <Text style={styles.resourceTextRed}>
                                                  Hindi
                                                </Text>
                                              </TouchableOpacity>
                                          )}

                                          {englishVideoUrl && (
                                              <TouchableOpacity
                                                style={styles.resourceBtn}
                                                onPress={() =>
                                                  Linking.openURL(englishVideoUrl)
                                                }
                                              >
                                                <Play size={12} color="#f87171" />
                                                <Text style={styles.resourceTextRed}>
                                                  English
                                                </Text>
                                              </TouchableOpacity>
                                          )}

                                          {/* Practice Links */}
                                          {leetcodeUrl &&
                                            leetcodeUrl !== "#" && (
                                              <TouchableOpacity
                                                style={styles.lcBtn}
                                                onPress={() =>
                                                  Linking.openURL(leetcodeUrl)
                                                }
                                              >
                                                <Text style={styles.lcText}>
                                                  LC
                                                </Text>
                                              </TouchableOpacity>
                                            )}
                                          {gfgUrl && gfgUrl !== "#" && (
                                            <TouchableOpacity
                                              style={styles.gfgBtn}
                                              onPress={() =>
                                                Linking.openURL(gfgUrl)
                                              }
                                            >
                                              <Text style={styles.gfgText}>
                                                GFG
                                              </Text>
                                            </TouchableOpacity>
                                          )}
                                          {(!leetcodeUrl ||
                                            leetcodeUrl === "#") &&
                                            (!gfgUrl || gfgUrl === "#") &&
                                            practiceUrl &&
                                            practiceUrl !== "#" && (
                                              <TouchableOpacity
                                                style={styles.resourceBtn}
                                                onPress={() =>
                                                  Linking.openURL(practiceUrl)
                                                }
                                              >
                                                <Code2
                                                  size={12}
                                                  color="#34d399"
                                                />
                                                <Text
                                                  style={[
                                                    styles.resourceText,
                                                    { color: "#34d399" },
                                                  ]}
                                                >
                                                  Practice
                                                </Text>
                                              </TouchableOpacity>
                                            )}
                                        </View>
                                      </View>
                                    </View>
                                  );
                                })}
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* Markdown Article Modal */}
      <Modal visible={!!openArticle} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <FileText size={24} color={colors.primary} />
                <Text style={styles.modalTitle}>Learning Material</Text>
              </View>
              <TouchableOpacity
                onPress={() => setOpenArticle(null)}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={24} color={colors.textDim} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.markdownScroll}
              contentContainerStyle={styles.markdownInner}
            >
              <Markdown style={markdownStyles}>{openArticle || ""}</Markdown>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: { ...Typography.body, color: colors.error },

  hudHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    paddingTop: 20,
    gap: Spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  hudBack: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: "transparent",
  },
  hudTitleBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.background,
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hudIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: `${colors.primary}50`,
    alignItems: "center",
    justifyContent: "center",
  },
  hudTitle: {
    ...Typography.h3,
    color: colors.text,
    fontSize: 16,
    textTransform: "uppercase",
  },
  hudSubtitle: {
    ...Typography.label,
    color: colors.primary,
    fontSize: 10,
    letterSpacing: 1,
  },

  list: { padding: Spacing.md, paddingBottom: 60 },

  overviewPanel: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: Spacing.md,
  },
  overviewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.lg,
  },
  overviewTitle: { ...Typography.h2, color: colors.text, fontSize: 20 },
  overviewSubtitle: {
    ...Typography.label,
    color: colors.primary,
    letterSpacing: 1,
    marginTop: 4,
  },

  progressWrap: { alignItems: "flex-end", gap: 4 },
  progressTrack: {
    width: 100,
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
  },
  progressFill: { height: "100%", backgroundColor: colors.primary, borderRadius: 3 },
  progressText: {
    ...Typography.small,
    color: colors.textDim,
    fontFamily: "monospace",
  },

  enrollBtn: {
    backgroundColor: `${colors.primary}20`,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  enrollBtnText: { color: colors.text, fontWeight: "bold" },

  modulesContainer: { gap: 8 },
  moduleBlock: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  moduleBlockCompleted: { backgroundColor: `${colors.primary}10` },
  moduleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  moduleHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    paddingRight: 8,
  },
  moduleTitle: {
    ...Typography.body,
    color: colors.text,
    fontWeight: "600",
    fontSize: 16,
    flex: 1,
  },
  modProgressWrap: { flexDirection: "column", alignItems: "flex-end", gap: 4 },
  modProgressTrack: {
    width: 60,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
  },
  modProgressFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  modProgressText: {
    ...Typography.small,
    color: colors.textDim,
    fontFamily: "monospace",
    fontSize: 14,
    minWidth: 50,
    textAlign: "right",
  },

  topicsContainer: { paddingLeft: 24, paddingBottom: 12 },
  topicBlock: { marginBottom: 4 },
  topicHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topicHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    paddingRight: 8,
  },
  topicTitle: {
    ...Typography.small,
    color: colors.text,
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  topProgressWrap: { flexDirection: "column", alignItems: "flex-end", gap: 4 },
  topProgressTrack: {
    width: 40,
    height: 3,
    backgroundColor: colors.border,
    borderRadius: 1.5,
  },
  topProgressFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 1.5,
  },
  topProgressText: {
    ...Typography.small,
    color: colors.textDim,
    fontFamily: "monospace",
    fontSize: 14,
    minWidth: 45,
    textAlign: "right",
  },

  problemsContainer: { paddingLeft: 24, paddingTop: 8, gap: 12 },
  problemRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  checkBtn: { paddingTop: 2 },
  problemInfo: { flex: 1, gap: 6 },
  problemTitle: { ...Typography.body, color: colors.text, fontSize: 14 },
  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },

  diffBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
  },
  diffEasy: {
    backgroundColor: "rgba(16,185,129,0.1)",
    borderColor: "rgba(16,185,129,0.2)",
  },
  diffMed: {
    backgroundColor: "rgba(234,179,8,0.1)",
    borderColor: "rgba(234,179,8,0.2)",
  },
  diffHard: {
    backgroundColor: "rgba(239,68,68,0.1)",
    borderColor: "rgba(239,68,68,0.2)",
  },
  diffText: { fontSize: 10, fontWeight: "bold", textTransform: "uppercase" },
  diffTextEasy: { color: "#34d399" },
  diffTextMed: { color: "#facc15" },
  diffTextHard: { color: "#f87171" },
  resourceBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resourceText: { fontSize: 10, fontWeight: "600", color: "#60a5fa" },
  resourceTextRed: { fontSize: 10, fontWeight: "600", color: "#f87171" },

  lcBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(245,158,11,0.1)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.2)",
  },
  lcText: { fontSize: 10, fontWeight: "bold", color: "#f59e0b" },

  gfgBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(16,185,129,0.1)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.2)",
  },
  gfgText: { fontSize: 10, fontWeight: "bold", color: "#10b981" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: colors.background,
    height: "90%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 0,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  modalTitle: { ...Typography.h3, color: colors.text },
  closeBtn: {
    padding: 8,
    backgroundColor: colors.background,
    borderRadius: 20,
  },
  markdownScroll: { flex: 1 },
  markdownInner: { padding: Spacing.xl, paddingBottom: 100 },
});

const markdownStyles: any = {
  body: {
    color: "#9ca3af",
    fontSize: 16,
    lineHeight: 24,
  },
  heading1: { color: "#fff", marginTop: 24, marginBottom: 12 },
  heading2: { color: "#e5e7eb", marginTop: 20, marginBottom: 10 },
  heading3: { color: "#d1d5db", marginTop: 16, marginBottom: 8 },
  link: { color: "#3b82f6" },
  code_inline: {
    backgroundColor: "rgba(255,255,255,0.1)",
    color: "#f87171",
    paddingHorizontal: 4,
    borderRadius: 4,
    fontFamily: "monospace",
  },
  code_block: {
    backgroundColor: "rgba(0,0,0,0.5)",
    color: "#e5e7eb",
    padding: 16,
    borderRadius: 8,
    fontFamily: "monospace",
    marginVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
};
