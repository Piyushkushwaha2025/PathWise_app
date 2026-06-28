import React from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Colors, Radius } from "../../constants/theme";

interface GlassCardProps {
  children: React.ReactNode;
  gradientBorder?: boolean;
  style?: ViewStyle;
  onPress?: () => void;
}

export function GlassCard({
  children,
  gradientBorder = false,
  style,
  onPress,
}: GlassCardProps) {
  const content = <View style={[styles.card, style]}>{children}</View>;

  if (gradientBorder) {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={!onPress}
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={Colors.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBorderWrap}
        >
          {content}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff08",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    overflow: "hidden",
    padding: 16,
  },
  gradientBorderWrap: {
    borderRadius: Radius.lg + 2,
    padding: 1.5,
  },
});
