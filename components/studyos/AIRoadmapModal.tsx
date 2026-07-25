import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import Modal from 'react-native-modal';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing, Radius } from '../../constants/theme';
import { useThemeStore } from '../../store/useThemeStore';
import { useStudyOSStore } from '../../store/studyosStore';

interface AIRoadmapModalProps {
  isVisible: boolean;
  onClose: () => void;
  subjectName: string;
}

export function AIRoadmapModal({ isVisible, onClose, subjectName }: AIRoadmapModalProps) {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const { addRoadmap } = useStudyOSStore();
  
  const [requirement, setRequirement] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleGenerate = () => {
    if (!requirement.trim()) return;
    
    setIsGenerating(true);
    
    // Simulate AI generation
    setTimeout(async () => {
      await addRoadmap({
        subjectName,
        requirements: [requirement],
        generatedContent: "AI Generated Roadmap: Focus on Unit 1 (Fundamentals) and Unit 2 (Advanced Topics). Watch suggested videos for MST preparation.",
      });
      setIsGenerating(false);
      setSuccess(true);
      
      setTimeout(() => {
        setSuccess(false);
        setRequirement('');
        onClose();
      }, 1500);
    }, 2000);
  };

  return (
    <Modal
      isVisible={isVisible}
      onBackdropPress={onClose}
      onSwipeComplete={onClose}
      swipeDirection="down"
      style={styles.modal}
      avoidKeyboard
    >
      <View style={styles.container}>
        <View style={styles.dragHandle} />
        
        <View style={styles.header}>
          <Ionicons name="sparkles" size={24} color={colors.primary} />
          <Text style={styles.title}>AI Roadmap</Text>
        </View>
        
        <Text style={styles.subtitle}>
          Generate a custom study plan for <Text style={{ color: colors.text }}>{subjectName}</Text>.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="E.g. Mid-term preparation, quick revision..."
          placeholderTextColor={colors.textMuted}
          value={requirement}
          onChangeText={setRequirement}
          multiline
        />

        <TouchableOpacity 
          style={[styles.button, !requirement.trim() && { opacity: 0.5 }]} 
          onPress={handleGenerate}
          disabled={!requirement.trim() || isGenerating || success}
        >
          {isGenerating ? (
            <ActivityIndicator color="#fff" />
          ) : success ? (
            <Ionicons name="checkmark-circle" size={24} color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Generate Roadmap</Text>
          )}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  modal: {
    justifyContent: 'flex-end',
    margin: 0,
  },
  container: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  title: {
    ...Typography.h2,
    color: colors.text,
  },
  subtitle: {
    ...Typography.body,
    color: colors.textMuted,
    marginBottom: Spacing.lg,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.md,
    color: colors.text,
    padding: Spacing.md,
    minHeight: 100,
    textAlignVertical: 'top',
    ...Typography.body,
    marginBottom: Spacing.lg,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    height: 56,
  },
  buttonText: {
    ...Typography.h3,
    color: '#fff',
  },
});
