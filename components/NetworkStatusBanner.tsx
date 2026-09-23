import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNetworkStatus, checkConnectivity } from '../lib/networkManager';

export const NetworkStatusBanner: React.FC = () => {
  const { isOnline } = useNetworkStatus();
  const prevOnline = useRef(isOnline);
  const [showBackOnline, setShowBackOnline] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const backOnlineTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Height and Opacity animations for smooth inline collapsible behavior (non-overlapping)
  const heightAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  // Track online / offline transitions safely with useRef to avoid cancelling timers
  useEffect(() => {
    if (!isOnline) {
      // Transitioned to offline: clear any pending timer, un-dismiss so banner shows
      setIsDismissed(false);
      if (backOnlineTimerRef.current) {
        clearTimeout(backOnlineTimerRef.current);
        backOnlineTimerRef.current = null;
      }
      setShowBackOnline(false);
    } else if (!prevOnline.current && isOnline) {
      // Transitioned from offline to online: show "Back Online" for 2 seconds then cleanly dismiss
      setIsDismissed(false);
      setShowBackOnline(true);
      if (backOnlineTimerRef.current) {
        clearTimeout(backOnlineTimerRef.current);
      }
      backOnlineTimerRef.current = setTimeout(() => {
        setShowBackOnline(false);
      }, 2000);
    }
    prevOnline.current = isOnline;
  }, [isOnline]);

  useEffect(() => {
    return () => {
      if (backOnlineTimerRef.current) {
        clearTimeout(backOnlineTimerRef.current);
      }
    };
  }, []);

  const shouldShow = (!isOnline || showBackOnline) && !isDismissed;

  useEffect(() => {
    if (shouldShow) {
      Animated.parallel([
        Animated.timing(heightAnim, {
          toValue: 36,
          duration: 200,
          useNativeDriver: false,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: false,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(heightAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: false,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [shouldShow]);

  const bg = showBackOnline ? '#10b981' : '#ef4444';
  const iconName: any = showBackOnline ? 'checkmark-circle-outline' : 'cloud-offline-outline';
  const message = showBackOnline ? 'Back Online' : 'Offline Mode • No Internet';

  return (
    <Animated.View
      style={[
        styles.container,
        {
          height: heightAnim,
          opacity: opacityAnim,
          backgroundColor: bg,
        },
      ]}
    >
      <View style={styles.contentRow}>
        <View style={styles.leftSection}>
          <Ionicons name={iconName} size={15} color="#ffffff" style={{ marginRight: 6 }} />
          <Text style={styles.text} numberOfLines={1}>{message}</Text>
        </View>

        <View style={styles.rightSection}>
          {!isOnline && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => checkConnectivity(2000)}
              style={styles.retryBadge}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setIsDismissed(true)}
            style={styles.closeBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={15} color="rgba(255, 255, 255, 0.85)" />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  contentRow: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
  },
  text: {
    color: '#ffffff',
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.1,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  retryBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  retryText: {
    color: '#ffffff',
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
  },
  closeBtn: {
    padding: 2,
  },
});
