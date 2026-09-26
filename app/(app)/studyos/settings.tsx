import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  ScrollView,
  Linking,
  Alert,
} from 'react-native';
import { useThemeStore } from '../../../store/useThemeStore';
import { useStudyOSStore } from '../../../store/studyosStore';
import { useStudySessionStore } from '../../../store/studySessionStore';
import { useUser } from '@clerk/clerk-expo';
import { Typography, Spacing } from '../../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { LegalViewerModal } from '../../../components/modals/LegalViewerModal';
import { DeleteAccountModal } from '../../../components/modals/DeleteAccountModal';

export default function StudyOSSettingsScreen() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const router = useRouter();
  const { user } = useUser();

  const showHistoryDates = useStudyOSStore((s) => s.showHistoryDates);
  const setShowHistoryDates = useStudyOSStore((s) => s.setShowHistoryDates);
  const roundAttendancePercentage = useStudyOSStore((s) => s.roundAttendancePercentage);
  const setRoundAttendancePercentage = useStudyOSStore((s) => s.setRoundAttendancePercentage);

  // Legal Modal State
  const [legalModalType, setLegalModalType] = useState<'privacy' | 'terms' | 'refund' | null>(null);

  // Delete Account Modal State
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);

  const handleOpenSupport = async () => {
    const supportEmail = 'support@pathwise.in';
    const subject = encodeURIComponent('PathWise / StudyOS - Help & Support');
    const mailUrl = `mailto:${supportEmail}?subject=${subject}`;

    try {
      const supported = await Linking.canOpenURL(mailUrl);
      if (supported) {
        await Linking.openURL(mailUrl);
      } else {
        Alert.alert(
          'Contact Support',
          `Please email us at ${supportEmail} for any assistance, feedback, or grievance redressal.`
        );
      }
    } catch {
      Alert.alert(
        'Contact Support',
        `Please reach out to ${supportEmail} for help or feedback.`
      );
    }
  };

  const handleConfirmDelete = async () => {
    try {
      if (user) {
        // 1. Delete from Clerk — triggers 'user.deleted' webhook on backend to CASCADE delete MongoDB data & B2 files
        await user.delete();

        // 2. Clear all local storage/session data
        await AsyncStorage.clear();
        await SecureStore.deleteItemAsync('culko_cookies');
        await SecureStore.deleteItemAsync('culko_u');
        await SecureStore.deleteItemAsync('culko_p');
        await SecureStore.deleteItemAsync('gemini_api_key');

        // 3. Reset theme preferences
        await SecureStore.deleteItemAsync('app_theme');
        await SecureStore.deleteItemAsync('app_primary_color');
        useThemeStore.getState().initTheme('black', undefined);

        await useStudySessionStore.getState().clearSession();
        router.replace('/(auth)/sign-in');
      }
    } catch (error) {
      console.error('Delete account error:', error);
      Alert.alert('Error', 'Failed to delete account. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Section 1: Attendance Display */}
        <Text style={styles.sectionHeader}>Academic Preferences</Text>
        <View style={styles.sectionCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Show Dates on Dashboard</Text>
              <Text style={styles.settingDesc}>Display the date next to the attendance dots (e.g., 27 Aug)</Text>
            </View>
            <Switch
              value={showHistoryDates}
              onValueChange={(val) => setShowHistoryDates(val)}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={'#ffffff'}
            />
          </View>

          <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Round Attendance %</Text>
              <Text style={styles.settingDesc}>Show whole numbers (e.g., 75%) instead of decimals (75.4%)</Text>
            </View>
            <Switch
              value={roundAttendancePercentage}
              onValueChange={(val) => setRoundAttendancePercentage(val)}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={'#ffffff'}
            />
          </View>
        </View>

        {/* Section 2: Legal & Policies */}
        <Text style={styles.sectionHeader}>Legal & Compliance</Text>
        <View style={styles.sectionCard}>
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => setLegalModalType('privacy')}
          >
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
            <Text style={styles.menuTitle}>Privacy Policy (DPDP 2023)</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => setLegalModalType('terms')}
          >
            <Ionicons name="document-text-outline" size={20} color={colors.primary} />
            <Text style={styles.menuTitle}>Terms of Service</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => setLegalModalType('refund')}
          >
            <Ionicons name="card-outline" size={20} color={colors.primary} />
            <Text style={styles.menuTitle}>Refund & Cancellation Policy</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Section 3: Support */}
        <Text style={styles.sectionHeader}>Support & Feedback</Text>
        <View style={styles.sectionCard}>
          <TouchableOpacity style={styles.menuRow} onPress={handleOpenSupport}>
            <Ionicons name="help-buoy-outline" size={20} color={colors.primary} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.menuTitleNoMargin}>Help & Support</Text>
              <Text style={styles.menuSubDesc}>support@pathwise.in</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Section 4: Danger Zone */}
        <Text style={[styles.sectionHeader, { color: colors.error }]}>Danger Zone</Text>
        <View style={[styles.sectionCard, { borderColor: colors.error + '44' }]}>
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => setIsDeleteModalVisible(true)}
          >
            <Ionicons name="trash-outline" size={20} color={colors.error} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.menuTitleNoMargin, { color: colors.error }]}>
                Delete My Account
              </Text>
              <Text style={styles.menuSubDesc}>
                Permanently erase all ERP sync, AI chats, and profile data
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.error} />
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* In-App Legal Viewer */}
      <LegalViewerModal
        visible={!!legalModalType}
        type={legalModalType}
        onClose={() => setLegalModalType(null)}
      />

      {/* Delete Account Confirmation Dialog */}
      <DeleteAccountModal
        isVisible={isDeleteModalVisible}
        onClose={() => setIsDeleteModalVisible(false)}
        onConfirm={handleConfirmDelete}
      />
    </SafeAreaView>
  );
}

const useStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: {
      ...Typography.h2,
      color: colors.text,
      fontWeight: '700',
    },
    scrollView: {
      flex: 1,
    },
    content: {
      padding: Spacing.lg,
    },
    sectionHeader: {
      ...Typography.small,
      color: colors.textMuted,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 8,
      marginTop: 16,
    },
    sectionCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    settingInfo: {
      flex: 1,
      paddingRight: Spacing.md,
    },
    settingTitle: {
      ...Typography.body,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 2,
    },
    settingDesc: {
      ...Typography.small,
      color: colors.textMuted,
      fontSize: 12,
    },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.md,
      paddingVertical: 14,
    },
    menuTitle: {
      ...Typography.body,
      flex: 1,
      fontWeight: '600',
      color: colors.text,
      marginLeft: 12,
      fontSize: 14,
    },
    menuTitleNoMargin: {
      ...Typography.body,
      fontWeight: '600',
      color: colors.text,
      fontSize: 14,
    },
    menuSubDesc: {
      ...Typography.small,
      color: colors.textMuted,
      fontSize: 11,
      marginTop: 2,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginLeft: 44,
    },
  });
