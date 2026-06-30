// Branded loading screen shown while fonts/auth are resolving.
// Bridges the gap between the native splash hiding and the first screen
// rendering, so the user never sees a blank black screen.
//
// Shows the app logo exactly the way it appears on the login screen (same
// asset, same rounded tile, same sizing) — no wordmark, no tagline. A subtle
// pulse plus three bouncing loader dots signal progress.
import React, { useEffect, useRef } from "react";
import { View, Animated, Easing, StyleSheet } from "react-native";
import { useThemeStore } from "../store/useThemeStore";

// Match the login screen's logo selection exactly: light tile on
// white/cream themes, dark tile everywhere else.
const darkLogo = require("../assets/logo-dark.png");
const lightLogo = require("../assets/logo-light.png");

// A single loader dot that bounces + fades on a staggered loop. Every dot
// shares the same 1600ms cycle length, so different `delay` values just shift
// the phase — keeping the three-dot wave perfectly even.
function Dot({ color, delay }: { color: string; delay: number }) {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0,
          duration: 400,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.delay(800 - delay),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay]);

  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });

  return (
    <Animated.View
      style={[styles.dot, { backgroundColor: color, opacity, transform: [{ translateY }] }]}
    />
  );
}

export default function AppLoading() {
  const colors = useThemeStore((state) => state.colors);
  const theme = useThemeStore((state) => state.theme);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();
    return () => pulseLoop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1.02] });

  const logo = theme === "white" || theme === "cream" ? lightLogo : darkLogo;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Animated.Image
        source={logo}
        resizeMode="contain"
        style={[styles.logo, { transform: [{ scale }] }]}
      />

      <View style={styles.dots}>
        <Dot color={colors.primary} delay={0} />
        <Dot color={colors.primary} delay={150} />
        <Dot color={colors.primary} delay={300} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  // Matches the login screen's logo (width/height 120, borderRadius 28).
  logo: {
    width: 120,
    height: 120,
    borderRadius: 28,
  },
  dots: {
    flexDirection: "row",
    marginTop: 32,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginHorizontal: 5,
  },
});
