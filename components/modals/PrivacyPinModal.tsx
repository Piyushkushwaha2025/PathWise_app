import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CenterPopModal } from '../ui/CenterPopModal';
import { useThemeStore } from '../../store/useThemeStore';
import { Typography, Spacing } from '../../constants/theme';
import * as SecureStore from 'expo-secure-store';
import { authenticateDevice, checkBiometrics } from '../../lib/security';

interface PrivacyPinModalProps {
  isVisible: boolean;
  mode: 'verify' | 'set' | 'change';
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function PrivacyPinModal({
  isVisible,
  mode,
  title,
  subtitle,
  onClose,
  onSuccess,
}: PrivacyPinModalProps) {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [canUseBiometrics, setCanUseBiometrics] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setErrorMsg('');
      setIsLoading(false);

      if (mode === 'verify') {
        checkBiometrics().then((res) => {
          const available = res.hasHardware && res.isEnrolled;
          setCanUseBiometrics(available);
          if (available) {
            SecureStore.getItemAsync('studyos_security_type').then((secType) => {
              if (secType !== 'pin') {
                authenticateDevice().then((success) => {
                  if (success) {
                    onSuccess();
                    onClose();
                  }
                });
              }
            });
          }
        });
      }
    }
  }, [isVisible, mode]);

  const handleBiometricPress = async () => {
    const success = await authenticateDevice();
    if (success) {
      onSuccess();
      onClose();
    }
  };

  const handleSubmit = async () => {
    setErrorMsg('');
    setIsLoading(true);

    try {
      const storedPin = await SecureStore.getItemAsync('studyos_privacy_pin');

      if (mode === 'verify') {
        if (!currentPin || currentPin.length < 4) {
          setErrorMsg('Please enter a 4-digit PIN.');
          setIsLoading(false);
          return;
        }

        if (storedPin && currentPin !== storedPin) {
          setErrorMsg('Incorrect PIN. Please try again.');
          setIsLoading(false);
          return;
        }

        setIsLoading(false);
        onSuccess();
        onClose();
      } else if (mode === 'set') {
        if (!newPin || newPin.length < 4) {
          setErrorMsg('PIN must be 4 digits.');
          setIsLoading(false);
          return;
        }

        if (newPin !== confirmPin) {
          setErrorMsg('PINs do not match.');
          setIsLoading(false);
          return;
        }

        await SecureStore.setItemAsync('studyos_privacy_pin', newPin);
        await SecureStore.setItemAsync('studyos_pin_enabled', 'true');
        setIsLoading(false);
        onSuccess();
        onClose();
      } else if (mode === 'change') {
        if (storedPin && currentPin !== storedPin) {
          setErrorMsg('Current PIN is incorrect.');
          setIsLoading(false);
          return;
        }

        if (!newPin || newPin.length < 4) {
          setErrorMsg('New PIN must be 4 digits.');
          setIsLoading(false);
          return;
        }

        if (newPin !== confirmPin) {
          setErrorMsg('New PINs do not match.');
          setIsLoading(false);
          return;
        }

        await SecureStore.setItemAsync('studyos_privacy_pin', newPin);
        setIsLoading(false);
        onSuccess();
        onClose();
      }
    } catch (e: any) {
      setErrorMsg('Failed to process PIN. Please try again.');
      setIsLoading(false);
    }
  };

  const getModalTitle = () => {
    if (title) return title;
    if (mode === 'verify') return 'Enter Security PIN';
    if (mode === 'set') return 'Set Security PIN';
    return 'Change Security PIN';
  };

  const getModalSubtitle = () => {
    if (subtitle) return subtitle;
    if (mode === 'verify') return 'Enter your 4-digit PIN or use biometrics';
    if (mode === 'set') return 'Choose a 4-digit PIN to protect your academic data';
    return 'Enter your current PIN and choose a new 4-digit PIN';
  };

  return (
    <CenterPopModal isVisible={isVisible} onClose={onClose}>
      <View style={styles.container}>
        <View style={styles.iconCircle}>
          <Ionicons name="lock-closed" size={28} color={colors.primary} />
        </View>

        <Text style={styles.title}>{getModalTitle()}</Text>
        <Text style={styles.subtitle}>{getModalSubtitle()}</Text>

        {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

        <View style={styles.form}>
          {(mode === 'verify' || mode === 'change') && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                {mode === 'change' ? 'Current PIN' : 'Security PIN'}
              </Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  maxLength={4}
                  secureTextEntry={!showPin}
                  value={currentPin}
                  onChangeText={(text) => {
                    setCurrentPin(text);
                    setErrorMsg('');
                  }}
                  placeholder="••••"
                  placeholderTextColor={colors.textDim}
                  autoFocus={mode === 'verify'}
                />
                <TouchableOpacity
                  onPress={() => setShowPin(!showPin)}
                  style={styles.eyeBtn}
                >
                  <Ionicons
                    name={showPin ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={colors.textDim}
                  />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {(mode === 'set' || mode === 'change') && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>
                  {mode === 'change' ? 'New 4-digit PIN' : 'Create 4-digit PIN'}
                </Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    maxLength={4}
                    secureTextEntry={!showPin}
                    value={newPin}
                    onChangeText={(text) => {
                      setNewPin(text);
                      setErrorMsg('');
                    }}
                    placeholder="••••"
                    placeholderTextColor={colors.textDim}
                    autoFocus={mode === 'set'}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPin(!showPin)}
                    style={styles.eyeBtn}
                  >
                    <Ionicons
                      name={showPin ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={colors.textDim}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Confirm PIN</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    maxLength={4}
                    secureTextEntry={!showPin}
                    value={confirmPin}
                    onChangeText={(text) => {
                      setConfirmPin(text);
                      setErrorMsg('');
                    }}
                    placeholder="••••"
                    placeholderTextColor={colors.textDim}
                  />
                </View>
              </View>
            </>
          )}
        </View>

        {canUseBiometrics && mode === 'verify' && (
          <TouchableOpacity
            style={styles.biometricBtn}
            onPress={handleBiometricPress}
            activeOpacity={0.7}
          >
            <Ionicons name="finger-print" size={20} color={colors.primary} />
            <Text style={styles.biometricBtnText}>Use Fingerprint / Phone Lock</Text>
          </TouchableOpacity>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onClose}
            disabled={isLoading}
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.submitBtn}
            onPress={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>
                {mode === 'verify' ? 'Unlock' : 'Save PIN'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </CenterPopModal>
  );
}

const useStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.surface,
      borderRadius: 24,
      padding: Spacing.xl,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    iconCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: `${colors.primary}20`,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: `${colors.primary}40`,
    },
    title: {
      ...Typography.h3,
      color: colors.text,
      fontWeight: '700',
      textAlign: 'center',
      marginBottom: 4,
    },
    subtitle: {
      ...Typography.small,
      color: colors.textDim,
      textAlign: 'center',
      marginBottom: Spacing.lg,
      lineHeight: 18,
    },
    errorText: {
      ...Typography.small,
      color: colors.error,
      textAlign: 'center',
      marginBottom: Spacing.md,
      fontWeight: '600',
    },
    form: {
      width: '100%',
      gap: Spacing.md,
      marginBottom: Spacing.md,
    },
    inputGroup: {
      width: '100%',
    },
    inputLabel: {
      ...Typography.small,
      color: colors.textMuted,
      marginBottom: 6,
      fontWeight: '600',
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: Spacing.md,
      height: 48,
    },
    input: {
      flex: 1,
      color: colors.text,
      fontSize: 18,
      letterSpacing: 8,
      fontWeight: '700',
      textAlign: 'center',
    },
    eyeBtn: {
      padding: 6,
    },
    biometricBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 12,
      backgroundColor: `${colors.primary}15`,
      borderWidth: 1,
      borderColor: `${colors.primary}35`,
      marginBottom: Spacing.lg,
      width: '100%',
    },
    biometricBtnText: {
      ...Typography.small,
      color: colors.primary,
      fontWeight: '700',
    },
    actions: {
      flexDirection: 'row',
      gap: Spacing.md,
      width: '100%',
    },
    cancelBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    cancelBtnText: {
      ...Typography.body,
      color: colors.textDim,
      fontWeight: '600',
    },
    submitBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitBtnText: {
      ...Typography.body,
      color: '#fff',
      fontWeight: '700',
    },
  });
