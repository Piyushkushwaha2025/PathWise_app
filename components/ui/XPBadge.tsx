import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MotiView } from "moti";
import { Colors, Typography } from "../../constants/theme";

interface XPBadgeProps {
  xp: number;
  animate?: boolean; // pulse animation when XP is earned
}

export function XPBadge({ xp, animate = false }: XPBadgeProps) {
  return (
    <MotiView
      animate={{ scale: animate ? [1, 1.2, 1] : 1 }}
      transition={{ type: "spring", duration: 600 }}
    >
      <View style={styles.badge}>
        <Text style={styles.icon}>⚡</Text>
        <Text style={styles.text}>{xp.toLocaleString()}</Text>
        <Text style={styles.label}>{"XP"}</Text>
      </View>
    </MotiView>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  icon: {
    fontSize: 18,
  },
  text: {
    ...Typography.mono,
    fontSize: 28,
    color: Colors.xpGold,
    fontWeight: "700",
  },
  label: {
    ...Typography.label,
    color: Colors.xpGold,
    opacity: 0.8,
  },
});
