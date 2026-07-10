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
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MotiView } from "moti";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { GlassCard } from "../../components/ui/GlassCard";
import { GradientButton } from "../../components/ui/GradientButton";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { useRoadmaps, useRoadmapsCatalog, useRoadmapDetail } from "../../hooks/useRoadmaps";
import { useProgress, useSaveProgress } from "../../hooks/useProgress";
import {
  useEnrollments,
  useToggleEnrollment,
} from "../../hooks/useEnrollments";
import { Typography, Spacing } from "../../constants/theme";
import { useThemeStore } from "../../store/useThemeStore";
import { useNotificationStore } from "../../store/useNotificationStore";
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
  const addNotification = useNotificationStore((s) => s.addNotification);

  const { data: customRoadmaps = [], isLoading: isLoadingCustom } =
    useRoadmaps();
  const { data: liveRoadmap, isLoading: isLoadingDetail } =
    useRoadmapDetail(id ?? "");
  const { data: progress = {} } = useProgress();
  const { data: enrolledIds = [] } = useEnrollments();
  const saveProgressMutation = useSaveProgress();
  const toggleEnrollment = useToggleEnrollment();

  const { data: catalogRoadmaps = [] } = useRoadmapsCatalog();

  // Use live API data for catalog roadmaps, fallback to custom roadmaps
  const customRoadmap = customRoadmaps.find((r: any) => r._id === id || r.id === id);
  const catalogFallback = catalogRoadmaps.find((r: any) => r.id === id);
  const roadmap = liveRoadmap ?? customRoadmap ?? catalogFallback;
  const isDSA = roadmap?.title?.toLowerCase().includes("dsa") || roadmap?.title?.toLowerCase().includes("data structure") || roadmap?.title?.toLowerCase().includes("data-structure");
  const actualRoadmapId = (roadmap?._id || roadmap?.id || id) as string;
  const completedTopics = progress[actualRoadmapId] ?? [];
  const completedSet = new Set(completedTopics);
  const isEnrolled = enrolledIds.includes(actualRoadmapId);

  const [expandedModules, setExpandedModules] = useState<Set<string>>(
    new Set(),
  );
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [expandedSubgroups, setExpandedSubgroups] = useState<Set<string>>(new Set());
  const [openArticle, setOpenArticle] = useState<string | null>(null);
  const [showEnrollPrompt, setShowEnrollPrompt] = useState(false);

  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const mdStyles = React.useMemo(() => getMarkdownStyles(colors), [colors]);

  if (isLoadingCustom || isLoadingDetail) {
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
      roadmapId: actualRoadmapId,
      action: "enroll",
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    addNotification("Enrolled! 🚀", `You have successfully enrolled in ${roadmap?.title ?? "this roadmap"}.`, "success");
  };

  const handleResourcePress = (action: () => void) => {
    action();
  };

  const handleToggleCheck = (title: string) => {
    if (!isEnrolled) {
      setShowEnrollPrompt(true);
      return;
    }

    const newSet = new Set(completedTopics);
    if (newSet.has(title)) {
      newSet.delete(title);
    } else {
      newSet.add(title);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      addNotification("Topic Completed! ✅", `Great job completing "${title}". Keep the momentum going!`, "success");
      
      if (newSet.size === totalOverall && totalOverall > 0) {
        setTimeout(() => {
          addNotification("Roadmap Completed! 🏆", `Incredible work! You have finished the entire ${roadmap?.title ?? "roadmap"}!`, "success");
        }, 1000);
      }
    }

    saveProgressMutation.mutate({
      roadmapId: actualRoadmapId,
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

  const toggleSubgroup = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const newSet = new Set(expandedSubgroups);
    if (newSet.has(key)) newSet.delete(key);
    else newSet.add(key);
    setExpandedSubgroups(newSet);
  };

  // Groups topics by prefix (e.g. "Hosting Options - Shared" → group "Hosting Options")
  const groupTopicsByPrefix = (topics: any[]) => {
    const groupMap: Record<string, { title: string; isGroup: true; items: any[] }> = {};
    const result: any[] = [];
    topics.forEach((topic) => {
      const dashIdx = topic.title.indexOf(" - ");
      if (dashIdx > 0) {
        const prefix = topic.title.substring(0, dashIdx);
        const suffix = topic.title.substring(dashIdx + 3);
        if (!groupMap[prefix]) {
          const group = { title: prefix, isGroup: true as const, items: [] as any[] };
          groupMap[prefix] = group;
          result.push(group);
        }
        groupMap[prefix].items.push({ ...topic, shortTitle: suffix });
      } else {
        result.push(topic);
      }
    });
    // Ungroup if only 1 item in a group (no point grouping a single item)
    return result.map((item) =>
      item.isGroup && item.items.length === 1 ? item.items[0] : item
    );
  };

  // Calculate overall progress
  let totalOverall = 0;
  let doneOverall = 0;
  roadmap.modules?.forEach((m: any) => {
    m.topics?.forEach((t: any) => {
      const items = (t.objectives?.length > 0 ? t.objectives : null) || (t.problems?.length > 0 ? t.problems : null) || [t];
      items.forEach((obj: any) => {
        totalOverall++;
        const title = typeof obj === "object" ? obj.title : obj;
        if (completedSet.has(title)) doneOverall++;
      });
    });
  });
  const overallProgressPct = totalOverall > 0 ? doneOverall / totalOverall : 0;

  return (
    <SafeAreaView style={styles.root}>
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
            {(!roadmap.modules || roadmap.modules.length === 0) ? (
              <View style={[styles.centered, { marginTop: 40, padding: 20 }]}>
                <Text style={[styles.errorText, { textAlign: "center", fontSize: 16 }]}>
                  Roadmap curriculum is currently unavailable.
                </Text>
                {roadmap.isPro ? (
                  <Text style={{ color: colors.textDim, marginTop: 8, textAlign: "center" }}>
                    This is a Premium roadmap on PathWise and cannot be accessed automatically.
                  </Text>
                ) : (
                  <Text style={{ color: colors.textDim, marginTop: 8, textAlign: "center" }}>
                    The backend failed to load the curriculum data for this roadmap.
                  </Text>
                )}
              </View>
            ) : (
              roadmap.modules?.map((module: any, mIdx: number) => {
              const moduleId = module.id || `m-${mIdx}`;
              const isModuleExpanded = expandedModules.has(moduleId);

              let modTotal = 0;
              let modDone = 0;
              module.topics?.forEach((t: any) => {
                const items = (t.objectives?.length > 0 ? t.objectives : null) || (t.problems?.length > 0 ? t.problems : null) || [t];
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
                      {(() => {
                        const processedTopics = !isDSA
                          ? groupTopicsByPrefix(module.topics || [])
                          : (module.topics || []);

                        const renderTopicItem = (topic: any, topicKey: string) => {
                          const topicId = topic.title || topicKey;
                          const isTopicExpanded = expandedTopics.has(topicId);
                          const displayTitle = topic.shortTitle || topic.title;

                          let topTotal = 0;
                          let topDone = 0;
                          const items = (topic.objectives?.length > 0 ? topic.objectives : null) || (topic.problems?.length > 0 ? topic.problems : null) || [topic];
                          items.forEach((obj: any) => {
                            topTotal++;
                            const title = typeof obj === "object" ? obj.title : obj;
                            if (completedSet.has(title)) topDone++;
                          });
                          const topProgress = topTotal > 0 ? topDone / topTotal : 0;
                          const topIsCompleted = topProgress === 1 && topTotal > 0;

                          return (
                            <View key={topicKey} style={styles.topicBlock}>
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
                                  <Text style={[styles.topicTitle, topIsCompleted && { color: "#4ade80" }]}>
                                    {displayTitle}
                                  </Text>
                                </View>
                                <View style={styles.topProgressWrap}>
                                  <View style={styles.topProgressTrack}>
                                    <View style={[styles.topProgressFill, { width: `${Math.round(topProgress * 100)}%`, backgroundColor: colors.primary }]} />
                                  </View>
                                  <Text style={[styles.topProgressText, topIsCompleted && { color: colors.primary }]}>
                                    {topDone} / {topTotal}
                                  </Text>
                                </View>
                              </TouchableOpacity>

                              {isTopicExpanded && (
                                <View style={styles.problemsContainer}>
                                  {items.map((obj: any, oIdx: number) => {
                                    const isComplex = typeof obj === "object";
                                    const title = isComplex ? obj.title : obj;
                                    const difficulty = isComplex && obj.difficulty ? obj.difficulty : "Medium";
                                    const articleContent = isComplex && obj.articleContent ? obj.articleContent : null;
                                    const articleUrl = isComplex && obj.articleUrl ? obj.articleUrl : null;
                                    const videoUrl = isComplex && obj.videoUrl ? obj.videoUrl : null;
                                    const hindiVideoUrl = isComplex && obj.hindiVideo?.url ? obj.hindiVideo.url : null;
                                    const englishVideoUrl = isComplex && obj.englishVideo?.url ? obj.englishVideo.url : null;
                                    const leetcodeUrl = isComplex && obj.leetcodeUrl ? obj.leetcodeUrl : null;
                                    const gfgUrl = isComplex && obj.gfgUrl ? obj.gfgUrl : null;
                                    const practiceUrl = isComplex && obj.practiceUrl ? obj.practiceUrl : null;
                                    const isDone = completedSet.has(title);

                                    return (
                                      <View key={oIdx} style={styles.problemRow}>
                                        <TouchableOpacity style={styles.checkBtn} onPress={() => handleToggleCheck(title)}>
                                          <CheckCircle2 size={24} color={isDone ? "#10b981" : colors.textDim} />
                                        </TouchableOpacity>
                                        <View style={styles.problemInfo}>
                                          <Text style={[styles.problemTitle, isDone && { color: colors.textDim }]}>{title}</Text>
                                          <View style={styles.badgesRow}>
                                            {isDSA && (
                                              <View style={[styles.diffBadge, difficulty === "Easy" ? styles.diffEasy : difficulty === "Hard" ? styles.diffHard : styles.diffMed]}>
                                                <Text style={[styles.diffText, difficulty === "Easy" ? styles.diffTextEasy : difficulty === "Hard" ? styles.diffTextHard : styles.diffTextMed]}>{difficulty}</Text>
                                              </View>
                                            )}
                                            {(articleContent || articleUrl) && (
                                              <TouchableOpacity style={styles.resourceBtn} onPress={() => handleResourcePress(() => { if (articleContent) setOpenArticle(articleContent); else if (articleUrl && articleUrl !== "#") Linking.openURL(articleUrl); })}>
                                                <FileText size={12} color={colors.primary} />
                                                <Text style={[styles.resourceText, { color: colors.primary }]}>Article</Text>
                                              </TouchableOpacity>
                                            )}
                                            {videoUrl && videoUrl !== "#" && videoUrl !== "Upcoming" && (
                                              <TouchableOpacity style={styles.resourceBtn} onPress={() => handleResourcePress(() => Linking.openURL(videoUrl))}>
                                                <Play size={12} color="#f87171" />
                                                <Text style={styles.resourceTextRed}>Video</Text>
                                              </TouchableOpacity>
                                            )}
                                            {hindiVideoUrl && (
                                              <TouchableOpacity style={styles.resourceBtn} onPress={() => handleResourcePress(() => Linking.openURL(hindiVideoUrl))}>
                                                <Play size={12} color="#f87171" />
                                                <Text style={styles.resourceTextRed}>Hindi</Text>
                                              </TouchableOpacity>
                                            )}
                                            {englishVideoUrl && (
                                              <TouchableOpacity style={styles.resourceBtn} onPress={() => handleResourcePress(() => Linking.openURL(englishVideoUrl))}>
                                                <Play size={12} color="#f87171" />
                                                <Text style={styles.resourceTextRed}>English</Text>
                                              </TouchableOpacity>
                                            )}
                                            {leetcodeUrl && leetcodeUrl !== "#" && (
                                              <TouchableOpacity style={styles.lcBtn} onPress={() => handleResourcePress(() => Linking.openURL(leetcodeUrl))}>
                                                <Code2 size={12} color="#f59e0b" />
                                                <Text style={styles.resourceTextYellow}>LeetCode</Text>
                                              </TouchableOpacity>
                                            )}
                                            {gfgUrl && gfgUrl !== "#" && (
                                              <TouchableOpacity style={styles.lcBtn} onPress={() => handleResourcePress(() => Linking.openURL(gfgUrl))}>
                                                <Code2 size={12} color="#34d399" />
                                                <Text style={[styles.resourceText, { color: "#34d399" }]}>GFG</Text>
                                              </TouchableOpacity>
                                            )}
                                            {practiceUrl && practiceUrl !== "#" && (
                                              <TouchableOpacity style={styles.lcBtn} onPress={() => handleResourcePress(() => Linking.openURL(practiceUrl))}>
                                                <Code2 size={12} color="#34d399" />
                                                <Text style={[styles.resourceText, { color: "#34d399" }]}>Practice</Text>
                                              </TouchableOpacity>
                                            )}
                                            {topic.videoUrl && topic.videoUrl !== "" && (
                                              <TouchableOpacity style={styles.resourceBtn} onPress={() => Linking.openURL(topic.videoUrl)}>
                                                <Play size={12} color="#f87171" />
                                                <Text style={styles.resourceTextRed}>{topic.videoTitle || "Video"}</Text>
                                              </TouchableOpacity>
                                            )}
                                            {topic.customResources?.map((res: any, rIdx: number) => {
                                              const isVid = res.label?.toLowerCase().includes("yt") || res.label?.toLowerCase().includes("video");
                                              return (
                                                <TouchableOpacity key={`res-${rIdx}`} style={styles.resourceBtn} onPress={() => { if (res.link && res.link !== "#") Linking.openURL(res.link); }}>
                                                  {isVid ? <Play size={12} color="#f87171" /> : <FileText size={12} color={colors.primary} />}
                                                  <Text style={[styles.resourceText, isVid ? { color: "#f87171" } : { color: colors.primary }]}>{res.label || "Resource"}</Text>
                                                </TouchableOpacity>
                                              );
                                            })}
                                          </View>
                                        </View>
                                      </View>
                                    );
                                  })}
                                </View>
                              )}
                            </View>
                          );
                        };

                        return processedTopics.map((item: any, tIdx: number) => {
                          if (!isDSA && (item as any).isGroup) {
                            const groupKey = `${moduleId}-sg-${item.title}`;
                            const isGrpExpanded = expandedSubgroups.has(groupKey);
                            let grpTotal = 0, grpDone = 0;
                            item.items.forEach((t: any) => {
                              const its = (t.objectives?.length > 0 ? t.objectives : null) || (t.problems?.length > 0 ? t.problems : null) || [t];
                              its.forEach((o: any) => { grpTotal++; const ttl = typeof o === "object" ? o.title : o; if (completedSet.has(ttl)) grpDone++; });
                            });
                            const grpDone100 = grpDone === grpTotal && grpTotal > 0;

                            return (
                              <View key={groupKey} style={styles.subgroupBlock}>
                                <TouchableOpacity style={styles.subgroupHeader} onPress={() => toggleSubgroup(groupKey)}>
                                  <View style={styles.topicHeaderLeft}>
                                    {isGrpExpanded ? <ChevronDown size={15} color={colors.text} /> : <ChevronRight size={15} color={colors.textDim} />}
                                    <Text style={[styles.subgroupTitle, grpDone100 && { color: "#4ade80" }]}>{item.title}</Text>
                                  </View>
                                  <Text style={[styles.subgroupCount, grpDone100 && { color: "#4ade80" }]}>{grpDone}/{grpTotal}</Text>
                                </TouchableOpacity>
                                {isGrpExpanded && (
                                  <View style={styles.subgroupTopics}>
                                    {item.items.map((topic: any, stIdx: number) =>
                                      renderTopicItem(topic, `${groupKey}-st-${stIdx}`)
                                    )}
                                  </View>
                                )}
                              </View>
                            );
                          }
                          return renderTopicItem(item, `${moduleId}-t-${tIdx}`);
                        });
                      })()}
                    </View>
                  )}
                </View>
              );
            })
            )}
          </View>
        </View>
      </ScrollView>

      {/* Markdown Article Modal */}
      <ArticleModal 
        visible={!!openArticle} 
        content={openArticle || ""} 
        onClose={() => setOpenArticle(null)} 
        colors={colors} 
        styles={styles} 
        markdownStyles={mdStyles} 
      />
      {/* Enroll Prompt Modal */}
      <Modal visible={showEnrollPrompt} transparent animationType="fade">
        <View style={styles.enrollPromptOverlay}>
          <MotiView 
            from={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            style={styles.enrollPromptBox}
          >
            <View style={styles.enrollPromptIcon}>
              <Rocket size={32} color={colors.primary} />
            </View>
            <Text style={styles.enrollPromptTitle}>Track Your Progress</Text>
            <Text style={styles.enrollPromptDesc}>
              Enroll in this roadmap to unlock progress tracking, save completed topics, and earn achievements!
            </Text>
            
            <TouchableOpacity 
              style={styles.enrollPromptBtn} 
              onPress={() => {
                setShowEnrollPrompt(false);
                handleEnroll();
              }}
            >
              <Text style={styles.enrollPromptBtnText}>Enroll Now</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.enrollPromptCancel} 
              onPress={() => setShowEnrollPrompt(false)}
            >
              <Text style={styles.enrollPromptCancelText}>Maybe Later</Text>
            </TouchableOpacity>
          </MotiView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// --- ARTICLE MODAL & PARSER ---

interface CodeBlock {
  language: string;
  code: string;
  originalText: string;
}

interface Approach {
  title: string;
  content: string;
  codeBlocks: CodeBlock[];
}

const parseArticleContent = (text: string): Approach[] | null => {
  if (!text) return null;

  const approachRegex = /(?:^|\n)(?:#*\s*)?((?:Approach|Approch)\s*\d+\s*:[^\n]*)/gi;
  const matches = [...text.matchAll(approachRegex)];
  
  // If there are no approaches, return null so we can render the raw article normally
  if (matches.length === 0) {
    return null;
  }

  const approaches: Approach[] = [];
  
  if (matches[0].index !== undefined && matches[0].index > 0) {
    const intro = text.substring(0, matches[0].index).trim();
    if (intro) {
      approaches.push(parseApproach("Intro", intro));
    }
  }
  
  for (let i = 0; i < matches.length; i++) {
    const title = matches[i][1].trim();
    const startIndex = matches[i].index! + matches[i][0].length;
    const endIndex = i + 1 < matches.length ? matches[i+1].index! : text.length;
    
    const content = text.substring(startIndex, endIndex).trim();
    approaches.push(parseApproach(title, content));
  }
  
  return approaches;
};

const parseApproach = (title: string, content: string): Approach => {
  const codeBlockRegex = /```(\w+)\n([\s\S]*?)```/g;
  const codeBlocks: CodeBlock[] = [];
  let contentWithoutCode = content;
  let match;
  
  while ((match = codeBlockRegex.exec(content)) !== null) {
    codeBlocks.push({
      language: match[1].toLowerCase(),
      code: match[2].trim(),
      originalText: match[0],
    });
    contentWithoutCode = contentWithoutCode.replace(match[0], "");
  }
  
  return {
    title: title.replace(/^(?:#*\s*)?/, "").trim(),
    content: contentWithoutCode.trim(),
    codeBlocks,
  };
};

const ArticleModal = ({ visible, content, onClose, colors, styles, markdownStyles }: any) => {
  const [approaches, setApproaches] = React.useState<Approach[] | null>(null);
  const [activeApproachIdx, setActiveApproachIdx] = React.useState(0);
  const [activeLanguage, setActiveLanguage] = React.useState<string>("");

  React.useEffect(() => {
    if (visible && content) {
      const parsed = parseArticleContent(content);
      setApproaches(parsed);
      setActiveApproachIdx(0);
      if (parsed && parsed.length > 0 && parsed[0].codeBlocks.length > 0) {
        setActiveLanguage(parsed[0].codeBlocks[0].language);
      }
    }
  }, [visible, content]);

  const activeApproach = approaches ? approaches[activeApproachIdx] : null;

  if (!visible) return null;

  const renderLanguageTabs = () => {
    if (!activeApproach || activeApproach.codeBlocks.length === 0) return null;
    
    return (
      <View style={styles.codeTabsContainer}>
        {activeApproach.codeBlocks.map((cb, idx) => {
          const isActive = activeLanguage === cb.language;
          return (
            <TouchableOpacity 
              key={idx} 
              style={[styles.codeTabBtn, isActive && { backgroundColor: colors.primary }]}
              onPress={() => setActiveLanguage(cb.language)}
            >
              <Text style={[styles.codeTabText, isActive && { color: "#fff" }]}>
                {cb.language.toUpperCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const activeCodeBlock = activeApproach?.codeBlocks.find(cb => cb.language === activeLanguage);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <FileText size={24} color={colors.primary} />
              <Text style={styles.modalTitle}>Learning Material</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.textDim} />
            </TouchableOpacity>
          </View>

          {/* Approach Switcher */}
          {approaches !== null && approaches.length > 1 && (
            <View style={styles.approachTabsWrapper}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.approachTabsContainer}>
                {approaches.map((appr, idx) => {
                  const isActive = activeApproachIdx === idx;
                  return (
                    <TouchableOpacity 
                      key={idx}
                      style={[styles.approachTabBtn, isActive && { backgroundColor: colors.primary + "20", borderColor: colors.primary }]}
                      onPress={() => {
                        setActiveApproachIdx(idx);
                        if (appr.codeBlocks.length > 0) {
                          setActiveLanguage(appr.codeBlocks[0].language);
                        }
                      }}
                    >
                      <Text style={[styles.approachTabText, isActive && { color: colors.primary, fontWeight: "600" }]}>
                        {appr.title}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <ScrollView style={styles.markdownScroll} contentContainerStyle={styles.markdownInner}>
            {approaches === null ? (
              <Markdown style={markdownStyles}>{content}</Markdown>
            ) : (
              activeApproach && (
                <>
                  <Markdown style={markdownStyles}>{activeApproach.content}</Markdown>
                  
                  {activeApproach.codeBlocks.length > 0 && (
                    <View style={styles.codeSection}>
                      {renderLanguageTabs()}
                      {activeCodeBlock && (
                        <Markdown style={markdownStyles}>
                          {"```" + activeCodeBlock.language + "\n" + activeCodeBlock.code + "\n```"}
                        </Markdown>
                      )}
                    </View>
                  )}
                </>
              )
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

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

  subgroupBlock: { marginBottom: 8, paddingLeft: 8 },
  subgroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  subgroupTitle: {
    ...Typography.body,
    color: colors.text,
    fontWeight: "600",
    fontSize: 15,
  },
  subgroupCount: {
    ...Typography.small,
    color: colors.textDim,
    fontFamily: "monospace",
  },
  subgroupTopics: {
    paddingLeft: 12,
    marginTop: 4,
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
    gap: 6,
    alignItems: "center",
    marginTop: 2,
  },

  diffBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    height: 22,
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
  diffText: { fontSize: 10, fontWeight: "bold", textTransform: "uppercase", lineHeight: 14 },
  diffTextEasy: { color: "#34d399" },
  diffTextMed: { color: "#facc15" },
  diffTextHard: { color: "#f87171" },
  resourceBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 0,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    height: 22,
  },
  resourceText: { fontSize: 10, fontWeight: "600", color: "#60a5fa", lineHeight: 14 },
  resourceTextRed: { fontSize: 10, fontWeight: "600", color: "#f87171", lineHeight: 14 },
  resourceTextYellow: { fontSize: 10, fontWeight: "600", color: "#f59e0b", lineHeight: 14 },

  lcBtn: {
    paddingHorizontal: 8,
    paddingVertical: 0,
    borderRadius: 10,
    backgroundColor: "rgba(245,158,11,0.1)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.2)",
    height: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  lcText: { fontSize: 10, fontWeight: "bold", color: "#f59e0b", lineHeight: 14 },

  gfgBtn: {
    paddingHorizontal: 8,
    paddingVertical: 0,
    borderRadius: 10,
    backgroundColor: "rgba(16,185,129,0.1)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.2)",
    height: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  gfgText: { fontSize: 10, fontWeight: "bold", color: "#10b981", lineHeight: 14 },

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
  enrollPromptOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  enrollPromptBox: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 32,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  enrollPromptIcon: {
    width: 64, 
    height: 64, 
    borderRadius: 32, 
    backgroundColor: "rgba(16, 185, 129, 0.1)", 
    alignItems: "center", 
    justifyContent: "center"
  },
  enrollPromptTitle: {
    ...Typography.h3,
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  enrollPromptDesc: {
    ...Typography.body,
    color: colors.textDim,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 22,
  },
  enrollPromptBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },
  enrollPromptBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  enrollPromptCancel: {
    marginTop: 20,
    padding: 8,
  },
  enrollPromptCancelText: {
    color: colors.textDim,
    fontWeight: "600",
    fontSize: 14,
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
  
  // Approach Switcher Styles
  approachTabsWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  approachTabsContainer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    gap: 8,
  },
  approachTabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  approachTabText: {
    ...Typography.small,
    color: colors.textDim,
    fontWeight: "500",
  },

  // Code Switcher Styles
  codeSection: {
    marginTop: Spacing.xl,
    backgroundColor: "rgba(0,0,0,0.2)",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  codeTabsContainer: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
  },
  codeTabBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: colors.background,
  },
  codeTabText: {
    ...Typography.small,
    color: colors.textDim,
    fontWeight: "bold",
    fontSize: 10,
  },

  markdownScroll: { flex: 1 },
  markdownInner: { padding: Spacing.xl, paddingBottom: 100 },
});

const getMarkdownStyles = (colors: any) => ({
  body: {
    color: colors.textDim || "#9ca3af",
    fontSize: 16,
    lineHeight: 24,
  },
  heading1: { 
    color: colors.primary,
    marginTop: 24, 
    marginBottom: 12,
  },
  heading2: { 
    color: colors.primary,
    marginTop: 20, 
    marginBottom: 10,
  },
  heading3: { 
    color: colors.primary,
    marginTop: 16, 
    marginBottom: 8,
  },
  link: { color: colors.primary },
  code_inline: {
    backgroundColor: "transparent",
    borderWidth: 0,
    color: "#f472b6", // Aesthetic pink for inline code
    fontFamily: "monospace",
    fontWeight: "600",
  },
  strong: {
    backgroundColor: "transparent",
    color: "#38bdf8", // Aesthetic sky blue for important/bold words
    fontWeight: "bold",
  },
  em: {
    backgroundColor: "transparent",
    color: "#a78bfa", // Purple text for italics
    fontStyle: "italic",
  },
  code_block: {
    backgroundColor: colors.surface, 
    color: colors.text, 
    padding: 16,
    borderRadius: 12,
    fontFamily: "monospace",
    marginVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
    lineHeight: 22,
  },
  fence: {
    backgroundColor: colors.surface,
    color: colors.text,
    padding: 16,
    borderRadius: 12,
    fontFamily: "monospace",
    marginVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
    lineHeight: 22,
  },
});
