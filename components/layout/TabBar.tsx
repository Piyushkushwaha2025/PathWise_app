import React, { useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  Image,
} from "react-native";
import { type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useUser } from "@clerk/clerk-expo";
import { Typography } from "../../constants/theme";
import { useThemeStore } from "../../store/useThemeStore";

const TABS = [
  {
    name: "dashboard",
    label: "Dashboard",
    icon: "grid-outline",
    iconActive: "grid",
  },
  {
    name: "roadmaps",
    label: "Roadmaps",
    icon: "map-outline",
    iconActive: "map",
  },
  {
    name: "studyos",
    label: "StudyOS",
    icon: "flash-outline",
    iconActive: "flash",
  }, // StudyOS
  {
    name: "subscription",
    label: "Subscription",
    icon: "star-outline",
    iconActive: "star",
  },
  {
    name: "profile",
    label: "Profile",
    icon: "person-outline",
    iconActive: "person",
  },
] as const;

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { user } = useUser();
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);

  return (
    <View style={styles.container}>
      {(state.routes as Array<{ key: string; name: string }>).map(
        (route, index: number) => {
          const tab = TABS.find(
            (t) => route.name === t.name || route.name === `${t.name}/index`,
          );
          if (!tab) return null;

          const isFocused = state.index === index;
          const { options } = descriptors[route.key];
          const isCenter = tab.name === "studyos";

          const onPress = () => {
            if (isCenter) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            } else {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }

            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          if (isCenter) {
            return (
              <CenterTabButton
                key={route.key}
                tab={tab}
                isFocused={isFocused}
                onPress={onPress}
                accessibilityLabel={options.tabBarAccessibilityLabel}
                colors={colors}
                styles={styles}
              />
            );
          }

          return (
            <TouchableOpacity
              key={route.key}
              style={styles.tab}
              onPress={onPress}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
            >
              <View
                style={[styles.iconWrap, isFocused && styles.iconWrapActive]}
              >
                {tab.name === "profile" && user?.imageUrl ? (
                  <Image
                    source={{ uri: user.imageUrl }}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      borderWidth: isFocused ? 2 : 0,
                      borderColor: colors.primary,
                    }}
                  />
                ) : (
                  <Ionicons
                    name={isFocused ? tab.iconActive : tab.icon}
                    size={22}
                    color={isFocused ? colors.primary : colors.textDim}
                  />
                )}
              </View>
              <Text style={[styles.label, isFocused && styles.labelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        },
      )}
    </View>
  );
}

function CenterTabButton({ tab, isFocused, onPress, accessibilityLabel, colors, styles }: any) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.92,
      useNativeDriver: true,
      speed: 50,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1.0,
      useNativeDriver: true,
      bounciness: 12,
      speed: 20,
    }).start();
  };

  return (
    <View style={styles.centerTabContainer}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <Animated.View
          style={[styles.centerButtonWrapper, { transform: [{ scale }] }]}
        >
          <LinearGradient
            colors={[colors.primary, colors.accent]}
            style={styles.centerButton}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons
              name={isFocused ? tab.iconActive : tab.icon}
              size={28}
              color="white"
            />
          </LinearGradient>
        </Animated.View>
      </TouchableOpacity>
      <Text style={styles.centerLabel}>{tab.label}</Text>
    </View>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: Platform.OS === "ios" ? 28 : 12,
    paddingTop: 10,
    paddingHorizontal: 8,
    position: "relative",
    elevation: 0,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    justifyContent: "center",
  },
  iconWrap: {
    width: 40,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: {
    // No background needed
  },
  label: {
    ...Typography.label,
    fontSize: 10,
    color: colors.textDim,
  },
  labelActive: {
    color: colors.primary,
  },
  centerTabContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    position: "relative",
    zIndex: 10,
  },
  centerButtonWrapper: {
    marginBottom: 20,
    shadowColor: colors.primary,
    shadowRadius: 16,
    shadowOpacity: 0.6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  centerButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  centerLabel: {
    ...Typography.label,
    fontSize: 10,
    fontFamily: "SpaceGrotesk_600SemiBold",
    color: colors.primary,
    position: "absolute",
    bottom: -4, // Keep it aligned with other labels
  },
});
