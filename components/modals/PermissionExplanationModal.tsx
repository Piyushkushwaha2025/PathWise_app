import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing } from '../../constants/theme';
import { useThemeStore } from '../../store/useThemeStore';
import { GlassCard } from '../ui/GlassCard';
import { GradientButton } from '../ui/GradientButton';

interface PermissionExplanationModalProps {
  visible: boolean;
  permissionType: 'camera' | 'mediaLibrary';
  onContinue: () => void;
  onCancel: () => void;
}

export function PermissionExplanationModal({
  visible,
  permissionType,
  onContinue,
  onCancel,
}: PermissionExplanationModalProps) {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);

  const isCamera = permissionType === 'camera';

  const title = isCamera ? 'Camera Access Required' : 'Photos Access Required';
  const subtitle = isCamera
    ? 'StudyOS needs camera access to let you photograph your doubts and get instant AI explanations.'
    : 'StudyOS needs access to your photos so you can select question screenshots and study notes for AI explanations.';

  const perks = isCamera
    ? [
        { icon: 'camera-outline', text: 'Snap photos of math, coding, or science doubts' },
        { icon: 'sparkles-outline', text: 'Instant multimodal AI solutions with step-by-step logic' },
        { icon: 'lock-closed-outline', text: 'Images are only used to solve your academic queries' },
      ]
    : [
        { icon: 'images-outline', text: 'Select textbook snapshots and doubt screenshots' },
        { icon: 'sparkles-outline', text: 'AI analysis and syllabus-aligned explanations' },
        { icon: 'lock-closed-outline', text: 'Only selected photos are accessed, nothing else' },
      ];

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modalCard}>
              {/* Icon */}
              <View style={styles.iconCircle}>
                <Ionicons
                  name={isCamera ? 'camera' : 'images'}
                  size={36}
                  color={colors.primary}
                />
              </View>

              {/* Title & Subtitle */}
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>

              {/* Perks List */}
              <GlassCard style={styles.perksCard}>
                {perks.map((p, i) => (
                  <View key={i} style={styles.perkRow}>
                    <Ionicons
                      name={p.icon as any}
                      size={18}
                      color={colors.primary}
                      style={{ marginTop: 2 }}
                    />
                    <Text style={styles.perkText}>{p.text}</Text>
                  </View>
                ))}
              </GlassCard>

              {/* Buttons */}
              <View style={styles.buttonContainer}>
                <GradientButton
                  label="Continue"
                  onPress={onContinue}
                  size="md"
                  icon="arrow-forward-outline"
                  style={{ width: '100%' }}
                />

                <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
                  <Text style={styles.cancelBtnText}>Not Now</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const useStyles = (colors: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.75)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: Spacing.xl,
    },
    modalCard: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: Spacing.xl,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 16,
      elevation: 10,
    },
    iconCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.primary + '18',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: colors.primary + '40',
    },
    title: {
      ...Typography.h2,
      color: colors.text,
      textAlign: 'center',
      marginBottom: Spacing.xs,
      fontWeight: '700',
    },
    subtitle: {
      ...Typography.body,
      color: colors.textMuted,
      textAlign: 'center',
      fontSize: 14,
      lineHeight: 20,
      marginBottom: Spacing.lg,
    },
    perksCard: {
      width: '100%',
      padding: Spacing.md,
      borderRadius: 14,
      marginBottom: Spacing.lg,
      gap: 12,
    },
    perkRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    perkText: {
      ...Typography.small,
      color: colors.text,
      flex: 1,
      fontSize: 13,
      lineHeight: 18,
    },
    buttonContainer: {
      width: '100%',
      gap: 10,
      alignItems: 'center',
    },
    cancelBtn: {
      paddingVertical: Spacing.xs,
    },
    cancelBtnText: {
      ...Typography.body,
      color: colors.textMuted,
      fontSize: 14,
    },
  });
