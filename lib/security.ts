import { requireOptionalNativeModule } from 'expo-modules-core';
import * as SecureStore from 'expo-secure-store';

export type SecurityType = 'biometric' | 'pin';

export interface BiometricStatus {
  hasHardware: boolean;
  isEnrolled: boolean;
  biometricName: string;
}

function getLocalAuth(): typeof import('expo-local-authentication') | null {
  try {
    // Only require expo-local-authentication if the native module is actually present in the installed APK
    const nativeModule = typeof requireOptionalNativeModule === 'function'
      ? requireOptionalNativeModule('ExpoLocalAuthentication')
      : null;
    if (!nativeModule) {
      return null;
    }
    return require('expo-local-authentication');
  } catch {
    return null;
  }
}

export function isDeviceAuthAvailable(): boolean {
  return !!getLocalAuth();
}

export async function checkBiometrics(): Promise<BiometricStatus> {
  try {
    const LocalAuth = getLocalAuth();
    if (!LocalAuth || typeof LocalAuth.hasHardwareAsync !== 'function') {
      return {
        hasHardware: false,
        isEnrolled: false,
        biometricName: 'Fingerprint / Screen Lock',
      };
    }
    const hasHardware = await LocalAuth.hasHardwareAsync();
    const isEnrolled = await LocalAuth.isEnrolledAsync();
    const types = (await LocalAuth.supportedAuthenticationTypesAsync?.()) || [];

    let biometricName = 'Fingerprint / Screen Lock';
    if (types.includes(LocalAuth.AuthenticationType?.FACIAL_RECOGNITION)) {
      biometricName = 'Face ID / Biometrics';
    } else if (types.includes(LocalAuth.AuthenticationType?.FINGERPRINT)) {
      biometricName = 'Fingerprint';
    }

    return {
      hasHardware: !!hasHardware,
      isEnrolled: !!isEnrolled,
      biometricName,
    };
  } catch (e) {
    return {
      hasHardware: false,
      isEnrolled: false,
      biometricName: 'Fingerprint / Screen Lock',
    };
  }
}

export async function authenticateDevice(promptMessage: string = 'Unlock to continue'): Promise<boolean> {
  try {
    const LocalAuth = getLocalAuth();
    if (!LocalAuth || typeof LocalAuth.authenticateAsync !== 'function') {
      return false;
    }
    const result = await LocalAuth.authenticateAsync({
      promptMessage,
      fallbackLabel: 'Use PIN',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    return !!result.success;
  } catch (e) {
    return false;
  }
}

export async function getSecuritySettings(): Promise<{
  isGpaMarksLocked: boolean;
  isAppLocked: boolean;
  securityType: SecurityType;
  hasPin: boolean;
}> {
  try {
    const [gpaMarksVal, appLockVal, secTypeVal, pinVal] = await Promise.all([
      SecureStore.getItemAsync('studyos_pin_enabled'),
      SecureStore.getItemAsync('studyos_app_lock_enabled'),
      SecureStore.getItemAsync('studyos_security_type'),
      SecureStore.getItemAsync('studyos_privacy_pin'),
    ]);

    return {
      isGpaMarksLocked: gpaMarksVal === 'true',
      isAppLocked: appLockVal === 'true',
      securityType: (secTypeVal as SecurityType) || 'biometric',
      hasPin: !!pinVal,
    };
  } catch (e) {
    return {
      isGpaMarksLocked: false,
      isAppLocked: false,
      securityType: 'biometric',
      hasPin: false,
    };
  }
}
