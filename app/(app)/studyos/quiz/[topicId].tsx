import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuiz } from '../../../../hooks/useQuiz';
import { useStudyOSStore } from '../../../../store/studyosStore';
import { Colors, Typography, Spacing, Radius } from '../../../../constants/theme';
import { GlassCard } from '../../../../components/ui/GlassCard';

export default function QuizScreen() {
  const { topicId, subject } = useLocalSearchParams();
  const router = useRouter();
  
  const { mutate: generateQuiz, data: quizData, isPending } = useQuiz();
  const { recordActivity, addXP } = useStudyOSStore();

  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [score, setScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);

  useEffect(() => {
    if (!quizData && !isPending) {
      generateQuiz({
        subject: subject as string,
        topic: topicId as string,
        topicId: topicId as string,
        count: 5
      });
    }
  }, []);

  if (isPending || !quizData) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginBottom: Spacing.xl }} />
        <Text style={styles.loadingText}>Generating AI Quiz for {topicId}...</Text>
      </View>
    );
  }

  const currentQ = quizData[currentQIndex];

  const handleSelectOption = (index: number) => {
    if (showExplanation) return; // already answered this question
    setSelectedOption(index);
    setShowExplanation(true);
    
    if (index === currentQ.correctIndex) {
      setScore(s => s + 1);
      addXP(5); // +5 XP per correct answer
    }
  };

  const handleNext = async () => {
    if (currentQIndex < quizData.length - 1) {
      setCurrentQIndex(currentQIndex + 1);
      setSelectedOption(null);
      setShowExplanation(false);
    } else {
      setQuizFinished(true);
      await recordActivity(); // Record streak!
      if (score === quizData.length) {
        addXP(20); // perfect score bonus
      }
    }
  };

  if (quizFinished) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.title}>Quiz Completed! 🎉</Text>
        <Text style={styles.scoreText}>You scored {score} / {quizData.length}</Text>
        <Text style={styles.xpText}>+{(score * 5) + (score === quizData.length ? 20 : 0)} XP Earned!</Text>
        
        <TouchableOpacity style={styles.btn} onPress={() => router.back()}>
          <Text style={styles.btnText}>Back to Roadmap</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.progressText}>Question {currentQIndex + 1} of {quizData.length}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <GlassCard style={styles.questionCard}>
          <Text style={styles.questionText}>{currentQ.question}</Text>
        </GlassCard>

        <View style={styles.optionsContainer}>
          {currentQ.options.map((opt: string, idx: number) => {
            let bg = Colors.surface;
            let border = Colors.border;

            if (showExplanation) {
              if (idx === currentQ.correctIndex) {
                bg = '#10b98120';
                border = Colors.success;
              } else if (idx === selectedOption) {
                bg = '#ef444420';
                border = Colors.error;
              }
            } else if (selectedOption === idx) {
              border = Colors.primary;
            }

            return (
              <TouchableOpacity 
                key={idx} 
                style={[styles.optionCard, { backgroundColor: bg, borderColor: border }]}
                onPress={() => handleSelectOption(idx)}
                activeOpacity={0.7}
              >
                <Text style={styles.optionText}>{opt}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {showExplanation && (
          <View style={styles.explanationBox}>
            <Text style={styles.explanationTitle}>Explanation:</Text>
            <Text style={styles.explanationText}>{currentQ.explanation}</Text>
          </View>
        )}

        {showExplanation && (
          <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
            <Text style={styles.nextBtnText}>
              {currentQIndex === quizData.length - 1 ? 'Finish Quiz' : 'Next Question'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  loadingText: { ...Typography.h3, color: Colors.text, textAlign: 'center' },
  header: { padding: Spacing.xl, paddingTop: 60, alignItems: 'center' },
  progressText: { ...Typography.body, color: Colors.textDim, fontWeight: 'bold' },
  content: { padding: Spacing.md, paddingBottom: 100 },
  questionCard: { padding: Spacing.xl, marginBottom: Spacing.xl },
  questionText: { ...Typography.h2, color: Colors.text, lineHeight: 32 },
  optionsContainer: { gap: Spacing.md },
  optionCard: {
    padding: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 2,
  },
  optionText: { ...Typography.body, color: Colors.text, fontSize: 16 },
  explanationBox: { marginTop: Spacing.xl, padding: Spacing.lg, backgroundColor: '#ffffff08', borderRadius: Radius.md },
  explanationTitle: { ...Typography.h3, color: Colors.primary, marginBottom: Spacing.xs },
  explanationText: { ...Typography.body, color: Colors.text, lineHeight: 24 },
  nextBtn: { backgroundColor: Colors.primary, padding: Spacing.md, borderRadius: Radius.full, alignItems: 'center', marginTop: Spacing.xl },
  nextBtnText: { ...Typography.h3, color: '#FFF' },
  title: { ...Typography.h1, color: Colors.text, marginBottom: Spacing.md },
  scoreText: { ...Typography.h2, color: Colors.primary, marginBottom: Spacing.xs },
  xpText: { ...Typography.h3, color: Colors.success, marginBottom: Spacing.xxl },
  btn: { backgroundColor: Colors.surface, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border },
  btnText: { ...Typography.body, color: Colors.text, fontWeight: 'bold' },
});
