import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

export type SecurityType = 'biometric' | 'pin';

export interface BiometricStatus {
  hasHardware: boolean;
  isEnrolled: boolean;
  biometricName: string;
}

export async function checkBiometrics(): Promise<BiometricStatus> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

    let biometricName = 'Fingerprint / Screen Lock';
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      biometricName = 'Face ID / Biometrics';
    } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      biometricName = 'Fingerprint';
    }

    return {
      hasHardware,
      isEnrolled,
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
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      fallbackLabel: 'Use PIN',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    return result.success;
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
