import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Linking, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';

// ────────────────────────────────────────────────────────────
//  HOW TO USE
//  1. Set CURRENT_APP_VERSION below to match your app.json version
//  2. When you release a new mandatory update, host a JSON file at
//     REMOTE_CONFIG_URL with the content:
//     { "min_version": "1.0.4", "play_store_url": "https://play.google.com/store/apps/details?id=YOUR.PACKAGE" }
//  3. Old users will be blocked until they update.
// ────────────────────────────────────────────────────────────

const REMOTE_CONFIG_URL = 'https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/version.json';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.yourcompany.pathwise'; // CHANGE THIS

function parseVersion(v: string): number[] {
  return (v || '0.0.0').split('.').map(Number);
}

function isOutdated(current: string, minimum: string): boolean {
  const cur = parseVersion(current);
  const min = parseVersion(minimum);
  for (let i = 0; i < 3; i++) {
    if ((cur[i] || 0) < (min[i] || 0)) return true;
    if ((cur[i] || 0) > (min[i] || 0)) return false;
  }
  return false; // equal versions = not outdated
}

interface Props {
  children: React.ReactNode;
}

export function ForceUpdateGate({ children }: Props) {
  const [status, setStatus] = useState<'checking' | 'ok' | 'outdated'>('checking');
  const [storeUrl, setStoreUrl] = useState(PLAY_STORE_URL);

  const currentVersion = Constants.expoConfig?.version || '1.0.0';

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(REMOTE_CONFIG_URL, { cache: 'no-store' });
        const config = await res.json();

        if (config.min_version && isOutdated(currentVersion, config.min_version)) {
          if (config.play_store_url) setStoreUrl(config.play_store_url);
          setStatus('outdated');
        } else {
          setStatus('ok');
        }
      } catch (e) {
        // If remote config can't be reached, let the user in (don't block on network error)
        console.log('[ForceUpdate] Could not fetch version config, allowing access.');
        setStatus('ok');
      }
    };

    check();
  }, []);

  if (status === 'checking') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (status === 'outdated') {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Ionicons name="arrow-up-circle" size={40} color="#6366f1" />
          </View>
          <Text style={styles.title}>Update Required</Text>
          <Text style={styles.subtitle}>
            A new version of PathWise is available with important improvements and bug fixes. 
            Please update to continue.
          </Text>
          <Text style={styles.version}>Your version: {currentVersion}</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => Linking.openURL(storeUrl)}
          >
            <Ionicons name="logo-google-playstore" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.buttonText}>Update on Play Store</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f1a',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f1a',
    padding: 24,
  },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 24,
    padding: 28,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#6366f130',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#6366f115',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  version: {
    fontSize: 12,
    color: '#4b5563',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#6366f1',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    width: '100%',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
