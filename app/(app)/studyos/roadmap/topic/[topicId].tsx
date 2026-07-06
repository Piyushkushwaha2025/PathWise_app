import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../../../../constants/theme';
import { GlassCard } from '../../../../../components/ui/GlassCard';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { useDoubt } from '../../../../../hooks/useDoubt';
import { useStudyOSStore } from '../../../../../store/studyosStore';

export default function TopicScreen() {
  const { topicId, subject } = useLocalSearchParams();
  const router = useRouter();
  const doubtSheetRef = useRef<BottomSheet>(null);
  
  const [doubtText, setDoubtText] = useState('');
  const { mutate: askDoubt, data: doubtAnswer, isPending } = useDoubt();
  const { recordActivity, addXP } = useStudyOSStore();

  const handleComplete = async () => {
    await recordActivity();
    addXP(10);
    // Optionally trigger quiz suggestion
    router.push(`/(app)/studyos/quiz/${encodeURIComponent(topicId as string)}?subject=${encodeURIComponent(subject as string)}`);
  };

  const handleAskDoubt = () => {
    if (!doubtText.trim()) return;
    askDoubt({
      question: doubtText,
      subject: subject as string,
      topic: topicId as string,
    });
    recordActivity();
    addXP(2); // small XP for asking doubt
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Topic Reader</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.topicTitle}>{topicId}</Text>
        
        {/* Mock Videos */}
        <Text style={styles.sectionTitle}>Curated Videos</Text>
        <GlassCard style={styles.videoCard}>
          <View style={styles.thumbnail} />
          <View style={styles.videoInfo}>
            <Text style={styles.videoTitle}>Hindi Explanation</Text>
            <Text style={styles.videoChannel}>Apna College</Text>
          </View>
        </GlassCard>

        <GlassCard style={styles.videoCard}>
          <View style={styles.thumbnail} />
          <View style={styles.videoInfo}>
            <Text style={styles.videoTitle}>In-depth Tutorial (English)</Text>
            <Text style={styles.videoChannel}>FreeCodeCamp</Text>
          </View>
        </GlassCard>

        <TouchableOpacity style={styles.completeBtn} onPress={handleComplete}>
          <Text style={styles.completeBtnText}>Mark as Complete (+10 XP)</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Floating Ask Doubt Button */}
      <TouchableOpacity 
        style={styles.fab} 
        onPress={() => doubtSheetRef.current?.expand()}
      >
        <Text style={styles.fabText}>🤔 Ask AI Doubt</Text>
      </TouchableOpacity>

      {/* Bottom Sheet for Doubt Solver */}
      <BottomSheet
        ref={doubtSheetRef}
        snapPoints={['50%', '80%']}
        index={-1}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: Colors.surface }}
      >
        <BottomSheetView style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Ask AI Doubt Solver</Text>
          <Text style={styles.sheetContext}>Topic: {topicId}</Text>
          
          <TextInput
            style={styles.input}
            placeholder="Type your doubt here..."
            placeholderTextColor={Colors.textDim}
            multiline
            value={doubtText}
            onChangeText={setDoubtText}
          />
          
          <TouchableOpacity 
            style={[styles.submitBtn, !doubtText.trim() && { opacity: 0.5 }]} 
            onPress={handleAskDoubt}
            disabled={!doubtText.trim() || isPending}
          >
            <Text style={styles.submitBtnText}>
              {isPending ? 'Thinking...' : 'Ask AI'}
            </Text>
          </TouchableOpacity>

          {doubtAnswer && (
            <ScrollView style={styles.answerBox}>
              <Text style={styles.answerText}>{doubtAnswer.answer || doubtAnswer}</Text>
            </ScrollView>
          )}
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.md, paddingTop: 40, backgroundColor: Colors.surface,
  },
  headerTitle: { ...Typography.h3, color: Colors.text },
  backBtn: { padding: Spacing.sm },
  backText: { color: Colors.primary, fontSize: 16 },
  placeholder: { width: 50 },
  content: { padding: Spacing.xl, paddingBottom: 100 },
  topicTitle: { ...Typography.h1, color: Colors.text, marginBottom: Spacing.xxl },
  sectionTitle: { ...Typography.h3, color: Colors.text, marginBottom: Spacing.md },
  videoCard: { flexDirection: 'row', padding: Spacing.sm, marginBottom: Spacing.md },
  thumbnail: { width: 120, height: 80, backgroundColor: '#333', borderRadius: Radius.md, marginRight: Spacing.md },
  videoInfo: { flex: 1, justifyContent: 'center' },
  videoTitle: { ...Typography.h3, color: Colors.text, marginBottom: 4 },
  videoChannel: { ...Typography.body, color: Colors.textDim, fontSize: 12 },
  completeBtn: {
    backgroundColor: Colors.success,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  completeBtnText: { ...Typography.h3, color: '#FFF' },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  fabText: { ...Typography.h3, color: '#FFF' },
  sheetContent: { padding: Spacing.xl, flex: 1 },
  sheetTitle: { ...Typography.h2, color: Colors.text, marginBottom: Spacing.xs },
  sheetContext: { ...Typography.body, color: Colors.textDim, marginBottom: Spacing.lg },
  input: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    color: Colors.text,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: Spacing.md,
  },
  submitBtn: { backgroundColor: Colors.primary, padding: Spacing.md, borderRadius: Radius.md, alignItems: 'center' },
  submitBtnText: { ...Typography.h3, color: '#FFF' },
  answerBox: { marginTop: Spacing.lg, padding: Spacing.md, backgroundColor: '#ffffff08', borderRadius: Radius.md },
  answerText: { ...Typography.body, color: Colors.text, lineHeight: 24 },
});
