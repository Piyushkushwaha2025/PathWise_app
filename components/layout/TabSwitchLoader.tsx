import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Dimensions, DeviceEventEmitter } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeStore } from '../../store/useThemeStore';

const { width } = Dimensions.get('window');

export function TabSwitchLoader() {
  const colors = useThemeStore((s) => s.colors);
  const [active, setActive] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const timeoutRef = useRef<any>(null);

  useEffect(() => {
    const startSub = DeviceEventEmitter.addListener('tab_switch_start', () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setActive(true);
      progressAnim.setValue(0);
      opacityAnim.setValue(1);

      Animated.timing(progressAnim, {
        toValue: 0.75,
        duration: 350,
        useNativeDriver: false,
      }).start();

      // Auto safety net: complete if no end signal within 2.5s
      timeoutRef.current = setTimeout(() => {
        completeAnimation();
      }, 2500);
    });

    const endSub = DeviceEventEmitter.addListener('tab_switch_end', () => {
      completeAnimation();
    });

    const completeAnimation = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: false,
      }).start(() => {
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }).start(() => {
          setActive(false);
          progressAnim.setValue(0);
        });
      });
    };

    return () => {
      startSub.remove();
      endSub.remove();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [progressAnim, opacityAnim]);

  if (!active) return null;

  const barWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, width],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        { opacity: opacityAnim },
      ]}
    >
      <Animated.View style={[styles.bar, { width: barWidth }]}>
        <LinearGradient
          colors={[colors.primary, '#38bdf8', '#818cf8', colors.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    zIndex: 99999,
  },
  bar: {
    height: '100%',
    borderRadius: 1.5,
    overflow: 'hidden',
  },
});
