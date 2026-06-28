import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { Colors, Typography, Radius } from "../../constants/theme";

interface ProgressBarProps {
  progress: number; // 0 to 1
  height?: number;
  showLabel?: boolean;
}

export function ProgressBar({
  progress,
  height = 6,
  showLabel = false,
}: ProgressBarProps) {
  const clampedProgress = Math.min(Math.max(progress, 0), 1);
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withSpring(clampedProgress, { damping: 20, stiffness: 80 });
  }, [clampedProgress]);

  const animatedStyle = useAnimatedStyle(() => ({
    flex: width.value,
  }));

  const percentage = Math.round(clampedProgress * 100);

  return (
    <View>
      {showLabel && <Text style={styles.label}>{percentage}%</Text>}
      <View style={[styles.track, { height }]}>
        <Animated.View style={[styles.fillWrap, animatedStyle]}>
          <LinearGradient
            colors={Colors.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <Animated.View style={{ flex: 1 - clampedProgress }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: Colors.surfaceHigh,
    borderRadius: Radius.full,
    overflow: "hidden",
    flexDirection: "row",
  },
  fillWrap: {
    borderRadius: Radius.full,
    overflow: "hidden",
  },
  label: {
    ...Typography.label,
    color: Colors.textMuted,
    marginBottom: 4,
    textAlign: "right",
  },
});
