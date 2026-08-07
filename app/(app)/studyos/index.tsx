import React, { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useStudySessionStore } from '../../../store/studySessionStore';
import { useThemeStore } from '../../../store/useThemeStore';
import { Typography, Spacing } from '../../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { GradientButton } from '../../../components/ui/GradientButton';
import SubjectsScreen from './subjects';

export default function StudyOSIndex() {
  const { isConnected, isStudyOSMode, setStudyOSMode, universityId } = useStudySessionStore();
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);

  // Not connected -> Go to connect page
  if (!isConnected) {
    return <Redirect href="/(app)/studyos/connect" />;
  }

  if (isStudyOSMode) {
    return <SubjectsScreen />;
  }

  // Connected but in Normal Mode -> Show Reopen screen
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Ionicons name="school" size={80} color={colors.primary} />
        <Text style={styles.title}>You are connected to {universityId?.toUpperCase()}</Text>
        <Text style={styles.subtitle}>Would you like to reopen StudyOS?</Text>
        <GradientButton 
          label="Reopen StudyOS" 
          onPress={() => setStudyOSMode(true)} 
          style={{ width: '100%', marginTop: Spacing.xl }} 
        />
      </View>
    </View>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  content: { alignItems: 'center', padding: Spacing.xl, width: '100%' },
  title: { ...Typography.h2, color: colors.text, textAlign: 'center', marginTop: Spacing.lg },
  subtitle: { ...Typography.body, color: colors.textDim, textAlign: 'center', marginTop: Spacing.sm },
});
