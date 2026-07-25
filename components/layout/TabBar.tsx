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
import { Typography, Radius } from "../../constants/theme";
import { useThemeStore } from "../../store/useThemeStore";
import { useStudySessionStore } from "../../store/studySessionStore";
import { useRouter } from "expo-router";

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { user } = useUser();
  const { isConnected, isStudyOSMode } = useStudySessionStore();
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors, isStudyOSMode);
  const router = useRouter();

  // Tab config — only labels/icons change per mode, ORDER never changes.
  // Never reorder tabs array — reordering causes visual shift/glitch during mode transition.
  const getTabConfig = (routeName: string) => {
    switch (routeName) {
      case "dashboard":
        return isStudyOSMode 
          ? { label: "Home", icon: "school-outline", iconActive: "school" }
          : { label: "Dashboard", icon: "grid-outline", iconActive: "grid" };
      case "roadmaps":
        return isStudyOSMode
          ? { label: "TimeTable", icon: "time-outline", iconActive: "time" }
          : { label: "Roadmaps", icon: "map-outline", iconActive: "map" };
      case "studyos":
        return isStudyOSMode
          ? { label: "LMS", icon: "library-outline", iconActive: "library" }
          : { label: "StudyOS", icon: "flash-outline", iconActive: "flash" };
      case "subscription":
        return isStudyOSMode
          ? { label: "Marks", icon: "ribbon-outline", iconActive: "ribbon" }
          : { label: "Subscription", icon: "star-outline", iconActive: "star" };
      case "profile":
        return { label: "Profile", icon: "person-outline", iconActive: "person" };
      default:
        return null;
    }
  };

  // Fixed order — always use _layout.tsx order, never sort dynamically.
  // Sorting causes tabs to visually shift/jump during mode transitions.
  const FIXED_ORDER: Record<string, number> = { dashboard: 1, roadmaps: 2, studyos: 3, subscription: 4, profile: 5 };
  const routesToRender = [...state.routes].sort((a: any, b: any) => {
    const nameA = a.name.replace('/index', '');
    const nameB = b.name.replace('/index', '');
    return (FIXED_ORDER[nameA] ?? 99) - (FIXED_ORDER[nameB] ?? 99);
  });

  return (
    <View style={styles.container}>
      {(routesToRender as Array<{ key: string; name: string }>).map(
        (route) => {
          const index = state.routes.findIndex((r: any) => r.key === route.key);
          const baseName = route.name.replace('/index', '');
          const tab = getTabConfig(baseName);
          
          if (!tab) return null;

          const isFocused = state.index === index;
          const { options } = descriptors[route.key];
          const isStudyOSTab = baseName === "studyos";

          const onPress = () => {
            Haptics.impactAsync(
              isStudyOSTab && !isStudyOSMode
                ? Haptics.ImpactFeedbackStyle.Medium
                : Haptics.ImpactFeedbackStyle.Light
            );
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          // Center tab: ALWAYS rendered as CenterTabButton wrapper (flex:1)
          if (isStudyOSTab) {
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

          // Normal Mode Default Design
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
              <View style={[styles.iconWrap, isFocused && styles.iconWrapActive]}>
                {baseName === "profile" && user?.imageUrl ? (
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
                    name={(isFocused ? tab.iconActive : tab.icon) as any}
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
              name={(isFocused ? tab.iconActive : tab.icon) as any}
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

const useStyles = (colors: any, _isStudyOSMode: boolean) => StyleSheet.create({
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
    justifyContent: "space-between",
    alignItems: 'center'
  },
  // Normal Tab Styles
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
  iconWrapActive: {},
  label: {
    ...Typography.label,
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: colors.textDim,
  },
  labelActive: {
    color: colors.primary,
    fontFamily: "Inter_600SemiBold",
  },
  


  // Center Floating Tab Styles (Normal Mode)
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
    fontFamily: "Inter_600SemiBold",
    color: colors.primary,
    position: "absolute",
    bottom: -4,
  },
});
