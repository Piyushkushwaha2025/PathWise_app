import React, { useState, useEffect } from 'react';
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
import { deleteUserAccountWithDB } from '../../../lib/db';
import { LegalViewerModal } from '../../../components/modals/LegalViewerModal';
import { DeleteAccountModal } from '../../../components/modals/DeleteAccountModal';
import { PrivacyPinModal } from '../../../components/modals/PrivacyPinModal';
import { SecurityFeedbackModal } from '../../../components/ui/SecurityFeedbackModal';
import {
  checkBiometrics,
  authenticateDevice,
  BiometricStatus,
  SecurityType,
} from '../../../lib/security';

export default function StudyOSSettingsScreen() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const router = useRouter();
  const { user } = useUser();

  const showHistoryDates = useStudyOSStore((s) => s.showHistoryDates);
  const setShowHistoryDates = useStudyOSStore((s) => s.setShowHistoryDates);
  const roundAttendancePercentage = useStudyOSStore((s) => s.roundAttendancePercentage);
  const setRoundAttendancePercentage = useStudyOSStore((s) => s.setRoundAttendancePercentage);

  // Security State
  const [isGpaMarksLocked, setIsGpaMarksLocked] = useState(false);
  const [isAppLockEnabled, setIsAppLockEnabled] = useState(false);
  const [securityType, setSecurityType] = useState<SecurityType>('biometric');
  const [biometrics, setBiometrics] = useState<BiometricStatus>({
    hasHardware: false,
    isEnrolled: false,
    biometricName: 'Fingerprint / Screen Lock',
  });
  const [pinModalMode, setPinModalMode] = useState<'set' | 'verify' | 'change' | null>(null);
  const [pendingAction, setPendingAction] = useState<'toggle_gpa' | 'toggle_app' | null>(null);

  // Custom In-App Feedback Notification Modal State
  const [feedbackModal, setFeedbackModal] = useState<{
    isVisible: boolean;
    title: string;
    message: string;
    type: 'success' | 'warning' | 'info';
  }>({
    isVisible: false,
    title: '',
    message: '',
    type: 'success',
  });

  useEffect(() => {
    checkBiometrics().then(setBiometrics);

    Promise.all([
      SecureStore.getItemAsync('studyos_pin_enabled'),
      SecureStore.getItemAsync('studyos_app_lock_enabled'),
      SecureStore.getItemAsync('studyos_security_type'),
    ])
      .then(([pinVal, appLockVal, secVal]) => {
        setIsGpaMarksLocked(pinVal === 'true');
        setIsAppLockEnabled(appLockVal === 'true');
        if (secVal === 'pin' || secVal === 'biometric') {
          setSecurityType(secVal);
        }
      })
      .catch(() => {});
  }, []);

  const handleToggleGpaMarks = async () => {
    if (isGpaMarksLocked) {
      if (securityType === 'biometric' && biometrics.hasHardware && biometrics.isEnrolled) {
        const ok = await authenticateDevice('Confirm to turn off GPA & Marks Lock');
        if (ok) {
          await SecureStore.setItemAsync('studyos_pin_enabled', 'false');
          setIsGpaMarksLocked(false);
          setFeedbackModal({
            isVisible: true,
            title: 'Security Disabled',
            message: 'GPA in Profile and Marks tab are no longer protected with a lock.',
            type: 'info',
          });
        }
      } else {
        setPendingAction('toggle_gpa');
        setPinModalMode('verify');
      }
    } else {
      if (securityType === 'biometric' && biometrics.hasHardware && biometrics.isEnrolled) {
        const ok = await authenticateDevice('Confirm Fingerprint to enable GPA & Marks Lock');
        if (ok) {
          await SecureStore.setItemAsync('studyos_pin_enabled', 'true');
          setIsGpaMarksLocked(true);
          setFeedbackModal({
            isVisible: true,
            title: 'Security Enabled',
            message: `GPA in Profile and Marks tab are now locked with ${biometrics.biometricName}.`,
            type: 'success',
          });
        }
      } else {
        const hasPin = await SecureStore.getItemAsync('studyos_privacy_pin');
        if (hasPin) {
          await SecureStore.setItemAsync('studyos_pin_enabled', 'true');
          setIsGpaMarksLocked(true);
          setFeedbackModal({
            isVisible: true,
            title: 'PIN Lock Enabled',
            message: 'GPA in Profile and Marks tab are now secured with your 4-digit PIN.',
            type: 'success',
          });
        } else {
          setPendingAction('toggle_gpa');
          setPinModalMode('set');
        }
      }
    }
  };

  const handleToggleAppLock = async () => {
    if (isAppLockEnabled) {
      if (securityType === 'biometric' && biometrics.hasHardware && biometrics.isEnrolled) {
        const ok = await authenticateDevice('Confirm to turn off App Lock');
        if (ok) {
          await SecureStore.setItemAsync('studyos_app_lock_enabled', 'false');
          setIsAppLockEnabled(false);
          setFeedbackModal({
            isVisible: true,
            title: 'App Lock Disabled',
            message: 'PathWise will no longer require authentication on launch.',
            type: 'info',
          });
        }
      } else {
        setPendingAction('toggle_app');
        setPinModalMode('verify');
      }
    } else {
      if (securityType === 'biometric' && biometrics.hasHardware && biometrics.isEnrolled) {
        const ok = await authenticateDevice('Confirm Fingerprint to enable App Lock');
        if (ok) {
          await SecureStore.setItemAsync('studyos_app_lock_enabled', 'true');
          setIsAppLockEnabled(true);
          setFeedbackModal({
            isVisible: true,
            title: 'App Lock Enabled',
            message: `PathWise is now completely locked! Authenticate with ${biometrics.biometricName} upon launch.`,
            type: 'success',
          });
        }
      } else {
        const hasPin = await SecureStore.getItemAsync('studyos_privacy_pin');
        if (hasPin) {
          await SecureStore.setItemAsync('studyos_app_lock_enabled', 'true');
          setIsAppLockEnabled(true);
          setFeedbackModal({
            isVisible: true,
            title: 'App Lock Enabled',
            message: 'PathWise is now locked with your 4-digit PIN upon launch.',
            type: 'success',
          });
        } else {
          setPendingAction('toggle_app');
          setPinModalMode('set');
        }
      }
    }
  };

  const handleSelectSecurityType = async (type: SecurityType) => {
    setSecurityType(type);
    await SecureStore.setItemAsync('studyos_security_type', type);
    if (type === 'pin') {
      const hasPin = await SecureStore.getItemAsync('studyos_privacy_pin');
      if (!hasPin) {
        setPinModalMode('set');
      } else {
        setFeedbackModal({
          isVisible: true,
          title: 'Method Updated',
          message: 'Security method set to 4-Digit Security PIN.',
          type: 'info',
        });
      }
    } else {
      setFeedbackModal({
        isVisible: true,
        title: 'Method Updated',
        message: `Security method set to ${biometrics.biometricName}.`,
        type: 'info',
      });
    }
  };

  // Legal Modal State
  const [legalModalType, setLegalModalType] = useState<'privacy' | 'terms' | 'refund' | null>(null);

  // Delete Account Modal State
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);

  const handleOpenSupport = async () => {
    const supportEmail = 'pathwise.app.support@gmail.com';
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
        const userEmail = user?.primaryEmailAddress?.emailAddress;
        const cachedTrial = await AsyncStorage.getItem(`@pathwise_trial_start_${user.id}`);
        await deleteUserAccountWithDB(user.id, userEmail, cachedTrial || undefined).catch(() => {});
        await user.delete();
        await AsyncStorage.clear();
        await SecureStore.deleteItemAsync('culko_cookies');
        await SecureStore.deleteItemAsync('culko_u');
        await SecureStore.deleteItemAsync('culko_p');
        await SecureStore.deleteItemAsync('gemini_api_key');
        await SecureStore.deleteItemAsync('app_theme');
        await SecureStore.deleteItemAsync('app_primary_color');
        await SecureStore.deleteItemAsync('studyos_pin_enabled');
        await SecureStore.deleteItemAsync('studyos_app_lock_enabled');
        await SecureStore.deleteItemAsync('studyos_privacy_pin');
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
    <View style={styles.container}>
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

        {/* Section 2: Privacy & Security */}
        <Text style={styles.sectionHeader}>Privacy & Security</Text>
        <View style={styles.sectionCard}>
          {/* Lock Entire App */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Lock Entire App</Text>
              <Text style={styles.settingDesc}>
                Require fingerprint or PIN whenever opening or returning to PathWise
              </Text>
            </View>
            <Switch
              value={isAppLockEnabled}
              onValueChange={handleToggleAppLock}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={'#ffffff'}
            />
          </View>

          {/* Lock GPA & Marks */}
          <View
            style={[
              styles.settingRow,
              !isAppLockEnabled && !isGpaMarksLocked && { borderBottomWidth: 0 },
            ]}
          >
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Lock GPA & Marks</Text>
              <Text style={styles.settingDesc}>
                Require authentication to view GPA in profile and open Marks tab
              </Text>
            </View>
            <Switch
              value={isGpaMarksLocked}
              onValueChange={handleToggleGpaMarks}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={'#ffffff'}
            />
          </View>

          {/* Security Unlock Method Choice */}
          {(isAppLockEnabled || isGpaMarksLocked) && (
            <>
              <View style={styles.methodSection}>
                <Text style={styles.methodHeaderTitle}>CHOOSE UNLOCK METHOD</Text>
                <View style={styles.methodRow}>
                  <TouchableOpacity
                    style={[
                      styles.methodCard,
                      securityType === 'biometric' && styles.methodCardActive,
                    ]}
                    onPress={() => handleSelectSecurityType('biometric')}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="finger-print"
                      size={20}
                      color={
                        securityType === 'biometric'
                          ? colors.primary
                          : colors.textDim
                      }
                    />
                    <Text
                      style={[
                        styles.methodTitle,
                        securityType === 'biometric' && {
                          color: colors.primary,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      Fingerprint / Phone Lock
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.methodCard,
                      securityType === 'pin' && styles.methodCardActive,
                    ]}
                    onPress={() => handleSelectSecurityType('pin')}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="keypad-outline"
                      size={20}
                      color={
                        securityType === 'pin' ? colors.primary : colors.textDim
                      }
                    />
                    <Text
                      style={[
                        styles.methodTitle,
                        securityType === 'pin' && { color: colors.primary },
                      ]}
                      numberOfLines={1}
                    >
                      4-Digit PIN
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => setPinModalMode('change')}
              >
                <Ionicons name="key-outline" size={20} color={colors.primary} />
                <Text style={styles.menuTitle}>Change 4-Digit Security PIN</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Section 3: Legal & Policies */}
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

        {/* Section 4: Support */}
        <Text style={styles.sectionHeader}>Support & Feedback</Text>
        <View style={styles.sectionCard}>
          <TouchableOpacity style={styles.menuRow} onPress={handleOpenSupport}>
            <Ionicons name="help-buoy-outline" size={20} color={colors.primary} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.menuTitleNoMargin}>Help & Support</Text>
              <Text style={styles.menuSubDesc}>pathwise.app.support@gmail.com</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Section 5: Danger Zone */}
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

      {/* Security PIN Modal */}
      <PrivacyPinModal
        isVisible={pinModalMode !== null}
        mode={pinModalMode || 'verify'}
        title={
          pinModalMode === 'verify'
            ? 'Disable Security Lock'
            : pinModalMode === 'set'
            ? 'Set 4-Digit Security PIN'
            : 'Change 4-Digit Security PIN'
        }
        subtitle={
          pinModalMode === 'verify'
            ? 'Enter your current PIN to turn off lock'
            : 'Choose a 4-digit PIN for security unlock'
        }
        onClose={() => {
          setPinModalMode(null);
          setPendingAction(null);
        }}
        onSuccess={async () => {
          if (pinModalMode === 'verify') {
            if (pendingAction === 'toggle_app') {
              await SecureStore.setItemAsync('studyos_app_lock_enabled', 'false');
              setIsAppLockEnabled(false);
              setFeedbackModal({
                isVisible: true,
                title: 'App Lock Disabled',
                message: 'PathWise will no longer require authentication on launch.',
                type: 'info',
              });
            } else {
              await SecureStore.setItemAsync('studyos_pin_enabled', 'false');
              setIsGpaMarksLocked(false);
              setFeedbackModal({
                isVisible: true,
                title: 'Security Disabled',
                message: 'GPA in Profile and Marks tab are no longer locked.',
                type: 'info',
              });
            }
          } else if (pinModalMode === 'set') {
            if (pendingAction === 'toggle_app') {
              await SecureStore.setItemAsync('studyos_app_lock_enabled', 'true');
              setIsAppLockEnabled(true);
              setFeedbackModal({
                isVisible: true,
                title: 'App Lock Enabled',
                message: 'PathWise is now completely locked with your 4-digit PIN.',
                type: 'success',
              });
            } else {
              await SecureStore.setItemAsync('studyos_pin_enabled', 'true');
              setIsGpaMarksLocked(true);
              setFeedbackModal({
                isVisible: true,
                title: 'PIN Lock Enabled',
                message: 'GPA in Profile and Marks tab are now locked with your 4-digit PIN.',
                type: 'success',
              });
            }
          } else if (pinModalMode === 'change') {
            setFeedbackModal({
              isVisible: true,
              title: 'PIN Updated',
              message: 'Your 4-digit security PIN has been updated successfully.',
              type: 'success',
            });
          }
          setPendingAction(null);
        }}
      />

      {/* Custom In-App Feedback Notification Modal */}
      <SecurityFeedbackModal
        isVisible={feedbackModal.isVisible}
        type={feedbackModal.type}
        title={feedbackModal.title}
        message={feedbackModal.message}
        onClose={() => setFeedbackModal((prev) => ({ ...prev, isVisible: false }))}
      />
    </View>
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
      paddingTop: Spacing.xs,
      paddingBottom: Spacing.sm,
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
    methodSection: {
      padding: Spacing.md,
      backgroundColor: colors.surfaceHigh,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    methodHeaderTitle: {
      fontSize: 10,
      color: colors.textMuted,
      fontWeight: '800',
      letterSpacing: 1,
      marginBottom: 10,
    },
    methodRow: {
      flexDirection: 'row',
      gap: 10,
    },
    methodCard: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    methodCardActive: {
      borderColor: colors.primary,
      backgroundColor: `${colors.primary}15`,
    },
    methodTitle: {
      ...Typography.small,
      fontWeight: '700',
      color: colors.text,
      flexShrink: 1,
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
