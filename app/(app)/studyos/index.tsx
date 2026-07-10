import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing } from '../../../constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import { useThemeStore } from "../../../store/useThemeStore";

export default function StudyOSIndex() {
  const insets = useSafeAreaInsets();
  const colors = useThemeStore((s) => s.colors);
  
  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <MotiView
        from={{ opacity: 0, translateY: 20 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 600 }}
        style={styles.content}
      >
        <View style={styles.iconContainer}>
          <Ionicons name="construct-outline" size={80} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>StudyOS Under Maintenance</Text>
        <Text style={[styles.subtitle, { color: colors.textDim }]}>
          We are currently upgrading StudyOS to bring you an even better university integration experience. This feature will be available again soon!
        </Text>
      </MotiView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    padding: Spacing.xl,
    maxWidth: 400,
  },
  iconContainer: {
    marginBottom: Spacing.xl,
    padding: Spacing.lg,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 100,
  },
  title: {
    ...Typography.h2,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  subtitle: {
    ...Typography.body,
    textAlign: 'center',
    lineHeight: 24,
  },
});
