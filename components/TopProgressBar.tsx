import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useUploadStore } from '../store/useUploadStore';
import { useThemeStore } from '../store/useThemeStore';
import { Typography, Radius } from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function TopProgressBar() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'android' 
    ? Math.max(insets.top, StatusBar.currentHeight || 0) 
    : insets.top;

  const isUploading = useUploadStore((s) => s.isUploading);
  const currentUpload = useUploadStore((s) => s.currentUpload);
  const colors = useThemeStore((s) => s.colors);
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === 'black' || theme === 'emerald';

  const slideAnim = useRef(new Animated.Value(-SCREEN_WIDTH)).current;
  const pillAnim = useRef(new Animated.Value(-80)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isUploading) {
      // 1. Slide down status pill cleanly below the notification bar
      Animated.spring(pillAnim, {
        toValue: 12,
        useNativeDriver: true,
        friction: 8,
        tension: 40,
      }).start();

      // 2. Loop indeterminate progress line
      slideAnim.setValue(-SCREEN_WIDTH * 0.7);
      loopRef.current = Animated.loop(
        Animated.timing(slideAnim, {
          toValue: SCREEN_WIDTH,
          duration: 1400,
          useNativeDriver: true,
        })
      );
      loopRef.current.start();
    } else {
      // Retract pill back up
      Animated.timing(pillAnim, {
        toValue: -80,
        duration: 250,
        useNativeDriver: true,
      }).start();

      if (loopRef.current) {
        loopRef.current.stop();
      }
    }

    return () => {
      if (loopRef.current) loopRef.current.stop();
    };
  }, [isUploading]);

  if (!isUploading && !currentUpload) {
    return null;
  }

  const isAssignment = currentUpload?.type === 'assignment';
  const label = isAssignment ? 'Uploading Assignment...' : 'Publishing Announcement...';

  return (
    <View style={styles.outerContainer} pointerEvents="none">
      {/* Top 3.5px Indeterminate Animated Bar */}
      <View 
        style={[
          styles.barTrack, 
          { 
            marginTop: topInset,
            backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(37, 99, 235, 0.12)' 
          }
        ]}
      >
        <Animated.View
          style={[
            styles.animatedBarFill,
            {
              transform: [{ translateX: slideAnim }],
            },
          ]}
        >
          <LinearGradient
            colors={['#3b82f6', '#8b5cf6', '#06b6d4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>

      {/* Floating Status Pill */}
      <Animated.View
        style={[
          styles.pillContainer,
          {
            transform: [{ translateY: pillAnim }],
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            borderColor: isDark ? 'rgba(59, 130, 246, 0.35)' : 'rgba(59, 130, 246, 0.25)',
          },
        ]}
      >
        <View style={styles.pillIconCircle}>
          <Ionicons
            name={isAssignment ? 'cloud-upload' : 'megaphone'}
            size={13}
            color="#3b82f6"
          />
        </View>
        <Text style={[styles.pillText, { color: colors.text }]} numberOfLines={1}>
          {label}
        </Text>
        <View style={styles.pulsingDot} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 99999,
    alignItems: 'center',
  },
  barTrack: {
    width: '100%',
    height: 3.5,
    overflow: 'hidden',
  },
  animatedBarFill: {
    width: SCREEN_WIDTH * 0.7,
    height: '100%',
  },
  pillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    gap: 7,
  },
  pillIconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    fontFamily: Typography.h3.fontFamily,
    fontSize: 11.5,
    maxWidth: 220,
  },
  pulsingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3b82f6',
  },
});
