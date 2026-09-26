import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing } from '../../constants/theme';
import { useThemeStore } from '../../store/useThemeStore';
import { LEGAL_DOCS, LegalDocument } from '../../constants/legalDocs';
import { GlassCard } from '../ui/GlassCard';

interface LegalViewerModalProps {
  visible: boolean;
  type: 'privacy' | 'terms' | 'refund' | null;
  onClose: () => void;
}

export function LegalViewerModal({ visible, type, onClose }: LegalViewerModalProps) {
  const colors = useThemeStore((s) => s.colors);
  const theme = useThemeStore((s) => s.theme);
  const insets = useSafeAreaInsets();
  const styles = useStyles(colors);

  if (!type || !LEGAL_DOCS[type]) return null;
  const doc: LegalDocument = LEGAL_DOCS[type];

  // Guaranteed safe insets across all Android notches, punch-holes & navigation bars
  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 20
  );
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 28 : 20);

  const isLight = theme === 'white' || theme === 'cream';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <StatusBar
        barStyle={isLight ? 'dark-content' : 'light-content'}
        backgroundColor="transparent"
        translucent={true}
      />

      <View style={[styles.root, { paddingTop: topInset }]}>
        {/* Header with proper status bar clearance */}
        <View style={styles.header}>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>{doc.title}</Text>
            <Text style={styles.lastUpdatedText}>Last updated: {doc.lastUpdated}</Text>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Scrollable Content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: bottomInset + 36 },
          ]}
          showsVerticalScrollIndicator={true}
        >
          {/* Summary Box */}
          <GlassCard style={styles.summaryCard}>
            <Ionicons
              name="shield-checkmark-outline"
              size={20}
              color={colors.primary}
              style={{ marginTop: 2 }}
            />
            <Text style={styles.summaryText}>{doc.summary}</Text>
          </GlassCard>

          {/* Sections */}
          {doc.sections.map((section, idx) => (
            <View key={idx} style={styles.sectionContainer}>
              <Text style={styles.sectionHeading}>{section.heading}</Text>
              <Text style={styles.sectionBody}>{section.body}</Text>
            </View>
          ))}

          {/* Footer note */}
          <View style={styles.footerNote}>
            <Text style={styles.footerNoteText}>
              For any questions regarding this document, please contact us at{' '}
              <Text style={{ color: colors.primary, fontWeight: '600' }}>
                privacy@pathwise.in
              </Text>{' '}
              or{' '}
              <Text style={{ color: colors.primary, fontWeight: '600' }}>
                support@pathwise.in
              </Text>
              .
            </Text>
          </View>
        </ScrollView>

        {/* Bottom Safety Spacer for Android Navigation Bar */}
        <View style={{ height: bottomInset, backgroundColor: colors.background }} />
      </View>
    </Modal>
  );
}

const useStyles = (colors: any) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
    },
    headerTitleContainer: {
      flex: 1,
    },
    headerTitle: {
      ...Typography.h2,
      color: colors.text,
      fontWeight: '700',
    },
    lastUpdatedText: {
      ...Typography.small,
      color: colors.textMuted,
      marginTop: 2,
    },
    closeBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: Spacing.md,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: Spacing.lg,
    },
    summaryCard: {
      flexDirection: 'row',
      padding: Spacing.md,
      borderRadius: 12,
      marginBottom: Spacing.lg,
      gap: 10,
      borderWidth: 1,
      borderColor: colors.primary + '33',
    },
    summaryText: {
      ...Typography.body,
      color: colors.text,
      flex: 1,
      fontSize: 14,
      lineHeight: 20,
    },
    sectionContainer: {
      marginBottom: Spacing.lg,
      paddingBottom: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border + '55',
    },
    sectionHeading: {
      ...Typography.body,
      fontWeight: '700',
      fontSize: 16,
      color: colors.text,
      marginBottom: 8,
    },
    sectionBody: {
      ...Typography.body,
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 22,
    },
    footerNote: {
      marginTop: Spacing.md,
      padding: Spacing.md,
      borderRadius: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    footerNoteText: {
      ...Typography.small,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },
  });
