import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetworkStatus, checkConnectivity } from '../lib/networkManager';

export const NetworkStatusBanner: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { isOnline } = useNetworkStatus();
  const [wasOffline, setWasOffline] = useState(false);
  const [showBackOnline, setShowBackOnline] = useState(false);
  const translateY = useRef(new Animated.Value(-70)).current;

  // Banner should ONLY be visible when actually offline, or temporarily for 2s when restored
  const shouldShow = !isOnline || showBackOnline;
  const [rendered, setRendered] = useState(shouldShow);

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true);
      setShowBackOnline(false);
    } else if (wasOffline && isOnline) {
      setShowBackOnline(true);
      setWasOffline(false);
      const timer = setTimeout(() => {
        setShowBackOnline(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline]);

  useEffect(() => {
    if (shouldShow) {
      setRendered(true);
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 4,
        speed: 16,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: -70,
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        setRendered(false);
      });
    }
  }, [shouldShow]);

  if (!rendered && !shouldShow) return null;

  const bg = showBackOnline ? '#10b981' : '#ef4444';
  const iconName: any = showBackOnline ? 'checkmark-circle-outline' : 'cloud-offline-outline';
  const message = showBackOnline ? 'Back Online' : 'No Internet Connection • Offline Mode';

  return (
    <Animated.View
      style={[
        styles.container,
        {
          paddingTop: Math.max(insets.top, 8),
          backgroundColor: bg,
          transform: [{ translateY }],
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => checkConnectivity(2000)}
        style={styles.contentRow}
      >
        <Ionicons name={iconName} size={15} color="#ffffff" style={{ marginRight: 6 }} />
        <Text style={styles.text}>{message}</Text>
        {!isOnline && (
          <View style={styles.retryBadge}>
            <Text style={styles.retryText}>Retry</Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 99999,
    paddingBottom: 7,
    paddingHorizontal: 16,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#ffffff',
    fontSize: 12.5,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.1,
  },
  retryBadge: {
    marginLeft: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: 8,
  },
  retryText: {
    color: '#ffffff',
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
  },
});
