import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MotiView } from "moti";
import { Colors, Typography } from "../../constants/theme";

interface StreakCounterProps {
  streak: number;
}

export function StreakCounter({ streak }: StreakCounterProps) {
  const isHot = streak >= 7;
  const isDead = streak === 0;

  return (
    <View style={styles.container}>
      <MotiView
        animate={{ scale: isHot ? [1, 1.15, 1] : 1 }}
        transition={{ type: "timing", duration: 800, loop: isHot }}
      >
        <Text style={styles.flame}>{isDead ? "💤" : "🔥"}</Text>
      </MotiView>
      <View style={styles.info}>
        <Text
          style={[
            styles.count,
            isHot && styles.countHot,
            isDead && styles.countDead,
          ]}
        >
          {streak}
        </Text>
        <Text style={styles.sub}>
          {isDead ? "Start your streak!" : isHot ? "On fire! 🔥" : "day streak"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  flame: {
    fontSize: 32,
  },
  info: {
    gap: 2,
  },
  count: {
    ...Typography.h2,
    color: Colors.text,
  },
  countHot: {
    color: Colors.accent,
  },
  countDead: {
    color: Colors.textMuted,
  },
  sub: {
    ...Typography.small,
    color: Colors.textMuted,
  },
});
