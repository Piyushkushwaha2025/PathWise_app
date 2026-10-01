import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CenterPopModal } from './CenterPopModal';
import { useThemeStore } from '../../store/useThemeStore';
import { Typography, Spacing } from '../../constants/theme';

interface SecurityFeedbackModalProps {
  isVisible: boolean;
  type?: 'success' | 'info' | 'warning';
  title: string;
  message: string;
  onClose: () => void;
}

export function SecurityFeedbackModal({
  isVisible,
  type = 'success',
  title,
  message,
  onClose,
}: SecurityFeedbackModalProps) {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors, type);

  const getIconName = () => {
    switch (type) {
      case 'warning':
        return 'warning-outline';
      case 'info':
        return 'information-circle-outline';
      case 'success':
      default:
        return 'shield-checkmark-outline';
    }
  };

  return (
    <CenterPopModal isVisible={isVisible} onClose={onClose}>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Ionicons
            name={getIconName()}
            size={36}
            color={type === 'warning' ? colors.error : colors.primary}
          />
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>

        <TouchableOpacity style={styles.btn} onPress={onClose} activeOpacity={0.8}>
          <Text style={styles.btnText}>Got It</Text>
        </TouchableOpacity>
      </View>
    </CenterPopModal>
  );
}

const useStyles = (colors: any, type: string) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 24,
      padding: Spacing.xl,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      width: '100%',
    },
    iconCircle: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor:
        type === 'warning' ? `${colors.error}18` : `${colors.primary}18`,
      borderWidth: 1,
      borderColor:
        type === 'warning' ? `${colors.error}40` : `${colors.primary}40`,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: Spacing.md,
    },
    title: {
      ...Typography.h3,
      color: colors.text,
      fontWeight: '700',
      textAlign: 'center',
      marginBottom: 6,
    },
    message: {
      ...Typography.small,
      color: colors.textDim,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: Spacing.xl,
    },
    btn: {
      width: '100%',
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnText: {
      ...Typography.body,
      color: '#fff',
      fontWeight: '700',
    },
  });
