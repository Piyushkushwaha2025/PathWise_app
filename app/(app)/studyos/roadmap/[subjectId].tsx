import { useThemeStore } from '../../../../store/useThemeStore';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSubjects } from '../../../../hooks/useSubjects';
import { useGenerateRoadmap, RoadmapModule } from '../../../../hooks/useGenerateRoadmap';
import { Typography, Spacing, Radius } from '../../../../constants/theme';
import { GlassCard } from '../../../../components/ui/GlassCard';
import { CheckCircle2, Circle } from 'lucide-react-native';

export default function SubjectRoadmapScreen() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const { subjectId } = useLocalSearchParams();
  const router = useRouter();
  const { data: subjects } = useSubjects();
  
  const subject = subjects?.find(s => s.id.toString() === subjectId);
  const { mutate: generateRoadmap, data: roadmapData, isPending } = useGenerateRoadmap();

  const [loadingMsg, setLoadingMsg] = useState('Analyzing university syllabus...');

  useEffect(() => {
    if (isPending) {
      const messages = [
        "Analyzing university syllabus...",
        "Finding best Hindi videos...",
        "Finding best English videos...",
        "Attaching practice resources...",
        "Almost ready..."
      ];
      let i = 0;
      const interval = setInterval(() => {
        i = (i + 1) % messages.length;
        setLoadingMsg(messages[i]);
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [isPending]);

  if (!subject) {
    return <View style={styles.centerContainer}><Text>Subject not found</Text></View>;
  }

  const handleGenerate = () => {
    generateRoadmap({
      subjectName: subject.fullname,
      subjectCode: subject.shortname,
      credits: 4 // mock for now
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{subject.shortname} Roadmap</Text>
        <View style={styles.placeholder} />
      </View>

      {!roadmapData && !isPending ? (
        <View style={styles.centerContainer}>
          <Text style={styles.title}>AI Roadmap Generator</Text>
          <Text style={styles.subtitle}>
            Generate a personalized syllabus roadmap with curated YouTube videos and practice links.
          </Text>
          <TouchableOpacity style={styles.generateBtn} onPress={handleGenerate}>
            <Text style={styles.generateBtnText}>Generate Roadmap 🚀</Text>
          </TouchableOpacity>
        </View>
      ) : isPending ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: Spacing.xl }} />
          <Text style={styles.loadingText}>{loadingMsg}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {roadmapData?.map((module: RoadmapModule, index: number) => (
            <View key={index} style={styles.moduleContainer}>
              <Text style={styles.moduleTitle}>{module.title}</Text>
              
              {module.topics.map((topic, tIndex) => (
                <GlassCard 
                  key={tIndex} 
                  style={styles.topicCard}
                  onPress={() => router.push(`/(app)/studyos/roadmap/topic/${encodeURIComponent(topic.title)}?subject=${encodeURIComponent(subject.fullname)}`)}
                >
                  <View style={styles.topicRow}>
                    <Circle size={24} color={colors.textDim} style={styles.checkIcon} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.topicTitle}>{topic.title}</Text>
                      <Text style={styles.topicDesc} numberOfLines={2}>{topic.description}</Text>
                    </View>
                  </View>
                </GlassCard>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.md, paddingTop: 40, backgroundColor: colors.surface,
  },
  headerTitle: { ...Typography.h3, color: colors.text, flex: 1, textAlign: 'center' },
  backBtn: { padding: Spacing.sm },
  backText: { color: colors.primary, fontSize: 16 },
  placeholder: { width: 50 },
  title: { ...Typography.h2, color: colors.text, marginBottom: Spacing.sm, textAlign: 'center' },
  subtitle: { ...Typography.body, color: colors.textDim, textAlign: 'center', marginBottom: Spacing.xxl },
  generateBtn: {
    backgroundColor: colors.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxl,
    borderRadius: Radius.full,
  },
  generateBtnText: { ...Typography.h3, color: colors.text },
  loadingText: { ...Typography.h3, color: colors.text, textAlign: 'center' },
  content: { padding: Spacing.md },
  moduleContainer: { marginBottom: Spacing.xl },
  moduleTitle: { ...Typography.h2, color: colors.text, marginBottom: Spacing.md, marginLeft: Spacing.xs },
  topicCard: { marginBottom: Spacing.sm, padding: Spacing.md },
  topicRow: { flexDirection: 'row', alignItems: 'center' },
  checkIcon: { marginRight: Spacing.md },
  topicTitle: { ...Typography.h3, color: colors.text, marginBottom: 4 },
  topicDesc: { ...Typography.body, color: colors.textDim, fontSize: 14 },
});
