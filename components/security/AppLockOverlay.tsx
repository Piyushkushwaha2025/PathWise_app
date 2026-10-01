import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  AppState,
  AppStateStatus,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useThemeStore } from '../../store/useThemeStore';
import { Typography, Spacing } from '../../constants/theme';
import { authenticateDevice, checkBiometrics } from '../../lib/security';

export function AppLockOverlay() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);

  const [isLockEnabled, setIsLockEnabled] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(true);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [hasBiometrics, setHasBiometrics] = useState(false);

  const appState = useRef(AppState.currentState);

  const checkLockState = async () => {
    try {
      const enabledVal = await SecureStore.getItemAsync('studyos_app_lock_enabled');
      const isEnabled = enabledVal === 'true';
      setIsLockEnabled(isEnabled);

      if (isEnabled) {
        setIsUnlocked(false);
        setPinInput('');
        setPinError('');

        const bio = await checkBiometrics();
        const bioOk = bio.hasHardware && bio.isEnrolled;
        setHasBiometrics(bioOk);

        const secType = await SecureStore.getItemAsync('studyos_security_type');
        if (secType !== 'pin' && bioOk) {
          const success = await authenticateDevice('Unlock PathWise');
          if (success) {
            setIsUnlocked(true);
          }
        }
      } else {
        setIsUnlocked(true);
      }
    } catch (e) {
      setIsUnlocked(true);
    }
  };

  useEffect(() => {
    checkLockState();

    const subscription = AppState.addEventListener(
      'change',
      (nextAppState: AppStateStatus) => {
        if (
          appState.current.match(/inactive|background/) &&
          nextAppState === 'active'
        ) {
          checkLockState();
        } else if (nextAppState === 'background') {
          // Lock again when leaving app
          SecureStore.getItemAsync('studyos_app_lock_enabled').then((val) => {
            if (val === 'true') {
              setIsUnlocked(false);
            }
          });
        }
        appState.current = nextAppState;
      }
    );

    return () => {
      subscription.remove();
    };
  }, []);

  const handleBiometricPress = async () => {
    const success = await authenticateDevice('Unlock PathWise');
    if (success) {
      setIsUnlocked(true);
    }
  };

  const handlePinSubmit = async () => {
    try {
      const storedPin = await SecureStore.getItemAsync('studyos_privacy_pin');
      if (storedPin && pinInput !== storedPin) {
        setPinError('Incorrect PIN. Please try again.');
        return;
      }
      setIsUnlocked(true);
    } catch (e) {
      setPinError('Failed to verify PIN.');
    }
  };

  if (!isLockEnabled || isUnlocked) {
    return null;
  }

  return (
    <Modal visible={true} transparent={false} animationType="fade">
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Ionicons name="lock-closed" size={38} color={colors.primary} />
          </View>

          <Text style={styles.title}>PathWise Locked</Text>
          <Text style={styles.subtitle}>
            Authenticate with fingerprint or enter your 4-digit PIN to continue
          </Text>

          {pinError ? <Text style={styles.errorText}>{pinError}</Text> : null}

          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              maxLength={4}
              secureTextEntry={!showPin}
              value={pinInput}
              onChangeText={(t) => {
                setPinInput(t);
                setPinError('');
              }}
              placeholder="••••"
              placeholderTextColor={colors.textDim}
              autoFocus={!hasBiometrics}
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

          <TouchableOpacity
            style={styles.unlockBtn}
            onPress={handlePinSubmit}
            activeOpacity={0.8}
          >
            <Text style={styles.unlockBtnText}>Unlock with PIN</Text>
          </TouchableOpacity>

          {hasBiometrics && (
            <TouchableOpacity
              style={styles.biometricBtn}
              onPress={handleBiometricPress}
              activeOpacity={0.8}
            >
              <Ionicons name="finger-print" size={22} color={colors.primary} />
              <Text style={styles.biometricBtnText}>
                Use Fingerprint / Phone Lock
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const useStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
      padding: Spacing.xl,
    },
    card: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: colors.surface,
      borderRadius: 28,
      padding: Spacing.xl,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    iconCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: `${colors.primary}18`,
      borderWidth: 1,
      borderColor: `${colors.primary}40`,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: Spacing.lg,
    },
    title: {
      ...Typography.h2,
      color: colors.text,
      fontWeight: '800',
      textAlign: 'center',
      marginBottom: 6,
    },
    subtitle: {
      ...Typography.small,
      color: colors.textDim,
      textAlign: 'center',
      marginBottom: Spacing.xl,
      lineHeight: 20,
    },
    errorText: {
      ...Typography.small,
      color: colors.error,
      textAlign: 'center',
      marginBottom: Spacing.md,
      fontWeight: '600',
    },
    inputWrapper: {
      position: 'relative',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      height: 52,
      width: '100%',
      marginBottom: Spacing.lg,
    },
    input: {
      width: '100%',
      height: '100%',
      color: colors.text,
      fontSize: 20,
      letterSpacing: 10,
      fontWeight: '700',
      textAlign: 'center',
      paddingHorizontal: 44,
    },
    eyeBtn: {
      position: 'absolute',
      right: 8,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 8,
    },
    unlockBtn: {
      width: '100%',
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.md,
    },
    unlockBtnText: {
      ...Typography.body,
      color: '#fff',
      fontWeight: '700',
    },
    biometricBtn: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingVertical: 13,
      borderRadius: 14,
      backgroundColor: `${colors.primary}15`,
      borderWidth: 1,
      borderColor: `${colors.primary}35`,
    },
    biometricBtnText: {
      ...Typography.body,
      color: colors.primary,
      fontWeight: '700',
      fontSize: 14,
    },
  });
