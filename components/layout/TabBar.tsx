import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  Image,
  Dimensions,
  DeviceEventEmitter,
} from "react-native";
import { type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useUser } from "@clerk/clerk-expo";
import { useThemeStore } from "../../store/useThemeStore";
import { useStudySessionStore } from "../../store/studySessionStore";
import { useRouter } from "expo-router";

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { user } = useUser();
  const { isConnected, isStudyOSMode, setStudyOSMode } = useStudySessionStore();
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors, isStudyOSMode);
  const router = useRouter();

  // Tab config: STRICT mode separation between StudyOS mode and PathWise mode
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

  // Fixed order — always keep order stable
  const FIXED_ORDER: Record<string, number> = { dashboard: 1, roadmaps: 2, studyos: 3, subscription: 4, profile: 5 };
  const routesToRender = [...state.routes].sort((a: any, b: any) => {
    const nameA = a.name.replace('/index', '');
    const nameB = b.name.replace('/index', '');
    return (FIXED_ORDER[nameA] ?? 99) - (FIXED_ORDER[nameB] ?? 99);
  });

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['transparent', colors.primary + '55', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.topSpecularLine}
        pointerEvents="none"
      />
      {(routesToRender as Array<{ key: string; name: string }>).map((route) => {
        const index = state.routes.findIndex((r: any) => r.key === route.key);
        const baseName = route.name.replace('/index', '');
        const tab = getTabConfig(baseName);
        
        if (!tab) return null;

        const isFocused = state.index === index;
        const { options } = descriptors[route.key];
        const isStudyOSTab = baseName === "studyos";

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
          try {
            Haptics.impactAsync(
              isStudyOSTab && !isStudyOSMode
                ? Haptics.ImpactFeedbackStyle.Medium
                : Haptics.ImpactFeedbackStyle.Light
            ).catch(() => {});
          } catch {}
        };

        // Center tab: StudyOS with Ambient Breathing Glow
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
              isStudyOSMode={isStudyOSMode}
            />
          );
        }

        // Profile Tab with Arc Switcher responder
        if (baseName === "profile") {
          return (
            <ProfileTabButton
              key={route.key}
              routeKey={route.key}
              tab={tab}
              isFocused={isFocused}
              onPress={onPress}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              colors={colors}
              styles={styles}
              user={user}
              isConnected={isConnected}
              isStudyOSMode={isStudyOSMode}
              setStudyOSMode={setStudyOSMode}
              router={router}
            />
          );
        }

        // Normal Tabs (Dashboard, Roadmaps, Subscription/Marks)
        return (
          <NormalTabButton
            key={route.key}
            routeKey={route.key}
            tab={tab}
            isFocused={isFocused}
            onPress={onPress}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            colors={colors}
            styles={styles}
          />
        );
      })}
    </View>
  );
}

// -------------------------------------------------------------
// Normal Tab Button with Elegant Spring Scaling & Borderless Wash
// -------------------------------------------------------------
interface NormalTabButtonProps {
  routeKey: string;
  tab: { label: string; icon: string; iconActive: string };
  isFocused: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  colors: any;
  styles: any;
}

function NormalTabButton({
  routeKey,
  tab,
  isFocused,
  onPress,
  accessibilityLabel,
  colors,
  styles,
}: NormalTabButtonProps) {
  const focusAnim = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(focusAnim, {
      toValue: isFocused ? 1 : 0,
      useNativeDriver: true,
      tension: 70,
      friction: 10,
    }).start();
  }, [isFocused]);

  const handlePressIn = () => {
    Animated.spring(pressScale, {
      toValue: 0.92,
      useNativeDriver: true,
      speed: 60,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(pressScale, {
      toValue: 1,
      useNativeDriver: true,
      bounciness: 10,
      speed: 20,
    }).start();
  };

  const translateY = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -2],
  });

  const iconScale = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.10],
  });

  return (
    <TouchableOpacity
      key={routeKey}
      style={styles.tab}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View
        style={[
          styles.tabContentWrap,
          {
            transform: [{ scale: pressScale }, { translateY }],
          },
        ]}
      >
        <View style={styles.iconWrap}>
          <Animated.View style={{ transform: [{ scale: iconScale }] }}>
            <Ionicons
              name={(isFocused ? tab.iconActive : tab.icon) as any}
              size={22}
              color={isFocused ? colors.primary : colors.textDim}
            />
          </Animated.View>

          {/* Animated Micro Active Dot */}
          <Animated.View
            style={[
              styles.activeDot,
              {
                backgroundColor: colors.primary,
                opacity: focusAnim,
                transform: [{ scale: focusAnim }],
              },
            ]}
          />
        </View>

        <Text
          style={[styles.label, isFocused && styles.labelActive]}
          numberOfLines={1}
          textBreakStrategy="simple"
        >
          {tab.label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// -------------------------------------------------------------
// Profile Tab Button with Smooth Animation & Arc Switcher Gesture
// -------------------------------------------------------------
function ProfileTabButton({
  routeKey,
  tab,
  isFocused,
  onPress,
  accessibilityLabel,
  colors,
  styles,
  user,
  isConnected,
  isStudyOSMode,
  setStudyOSMode,
  router,
}: any) {
  const focusAnim = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  const profileLongPressTimer = useRef<any>(null);
  const isProfileMenuVisible = useRef(false);
  const profileHoveredRef = useRef<'studyos' | 'pathwise' | null>(null);
  const profileTouchStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    Animated.spring(focusAnim, {
      toValue: isFocused ? 1 : 0,
      useNativeDriver: true,
      tension: 70,
      friction: 10,
    }).start();
  }, [isFocused]);

  const handlePressIn = () => {
    Animated.spring(pressScale, {
      toValue: 0.92,
      useNativeDriver: true,
      speed: 60,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(pressScale, {
      toValue: 1,
      useNativeDriver: true,
      bounciness: 10,
      speed: 20,
    }).start();
  };

  const translateY = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -2],
  });

  const iconScale = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.10],
  });

  return (
    <View
      key={routeKey}
      style={styles.tab}
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={accessibilityLabel}
      onStartShouldSetResponder={() => true}
      onStartShouldSetResponderCapture={() => true}
      onMoveShouldSetResponder={() => true}
      onMoveShouldSetResponderCapture={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        handlePressIn();
        if (!isConnected) return;
        const { pageX, pageY } = e.nativeEvent;
        profileTouchStart.current = { x: pageX, y: pageY };
        profileHoveredRef.current = null;
        clearTimeout(profileLongPressTimer.current);
        profileLongPressTimer.current = setTimeout(() => {
          isProfileMenuVisible.current = true;
          const { width, height } = Dimensions.get('window');
          const fixedX = width - (width / 10) - 15;
          const fixedY = height - 25;
          DeviceEventEmitter.emit('profileSwitchVisible', { visible: true, x: fixedX, y: fixedY });
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }, 170);
      }}
      onResponderMove={(e) => {
        if (isProfileMenuVisible.current) {
          const { pageX, pageY } = e.nativeEvent;
          const dx = pageX - profileTouchStart.current.x;
          const dy = pageY - profileTouchStart.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          let hovered: 'studyos' | 'pathwise' | null = null;

          if (dist > 22) {
            if (-dy > 16 && -dy > Math.abs(dx) * 0.55) {
              hovered = 'studyos';
            } else if (-dx > 16 && -dx > Math.abs(dy) * 0.55) {
              hovered = 'pathwise';
            }
          }
          
          if (hovered !== profileHoveredRef.current) {
            profileHoveredRef.current = hovered;
            DeviceEventEmitter.emit('profileSwitchHover', hovered);
            if (hovered) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
          }
        }
      }}
      onResponderRelease={(e) => {
        handlePressOut();
        clearTimeout(profileLongPressTimer.current);
        if (isProfileMenuVisible.current) {
          isProfileMenuVisible.current = false;
          const hovered = profileHoveredRef.current;
          profileHoveredRef.current = null;
          DeviceEventEmitter.emit('profileSwitchHover', null);
          
          if (hovered) {
            const targetMode = hovered === 'studyos';
            if (targetMode !== isStudyOSMode) {
              DeviceEventEmitter.emit('profileSwitchVisible', { visible: false, immediate: true });
              useStudySessionStore.getState().setSwitchingMode(true);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setStudyOSMode(targetMode);
              router.replace('/(app)/dashboard');
            } else {
              DeviceEventEmitter.emit('profileSwitchVisible', { visible: false });
            }
          } else {
            DeviceEventEmitter.emit('profileSwitchVisible', { visible: false });
          }
        } else {
          onPress();
        }
      }}
      onResponderTerminate={() => {
        handlePressOut();
        clearTimeout(profileLongPressTimer.current);
        if (isProfileMenuVisible.current) {
          isProfileMenuVisible.current = false;
          DeviceEventEmitter.emit('profileSwitchVisible', { visible: false, immediate: true });
          profileHoveredRef.current = null;
          DeviceEventEmitter.emit('profileSwitchHover', null);
        }
      }}
    >
      <Animated.View
        style={[
          styles.tabContentWrap,
          {
            transform: [{ scale: pressScale }, { translateY }],
          },
        ]}
      >
        <View style={styles.iconWrap}>
          {user?.imageUrl ? (
            <Animated.View style={{ transform: [{ scale: iconScale }] }}>
              <Image
                source={{ uri: user.imageUrl }}
                style={[
                  styles.avatarImage,
                  isFocused && { borderColor: colors.primary, borderWidth: 2 },
                ]}
              />
            </Animated.View>
          ) : (
            <Animated.View style={{ transform: [{ scale: iconScale }] }}>
              <Ionicons
                name={(isFocused ? tab.iconActive : tab.icon) as any}
                size={22}
                color={isFocused ? colors.primary : colors.textDim}
              />
            </Animated.View>
          )}

          {/* Animated Micro Active Dot */}
          <Animated.View
            style={[
              styles.activeDot,
              {
                backgroundColor: colors.primary,
                opacity: focusAnim,
                transform: [{ scale: focusAnim }],
              },
            ]}
          />
        </View>

        <Text
          style={[styles.label, isFocused && styles.labelActive]}
          numberOfLines={1}
          textBreakStrategy="simple"
        >
          {tab.label}
        </Text>
      </Animated.View>
    </View>
  );
}

// -------------------------------------------------------------
// Center Floating Tab Button with Vivid Ambient Breathing Glow
// -------------------------------------------------------------
function CenterTabButton({ tab, isFocused, onPress, accessibilityLabel, colors, styles, isStudyOSMode }: any) {
  const pressScale = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Continuous ambient breathing pulse animation
  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 1300,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 1300,
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();
    return () => pulseLoop.stop();
  }, []);

  const handlePressIn = () => {
    Animated.spring(pressScale, {
      toValue: 0.90,
      useNativeDriver: true,
      speed: 50,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(pressScale, {
      toValue: 1.0,
      useNativeDriver: true,
      bounciness: 12,
      speed: 20,
    }).start();
  };

  // StudyOS in PathWise mode should always glow with vibrant ambient breathing halo!
  // In StudyOS mode, LMS glows when active.
  const shouldGlow = !isStudyOSMode || isFocused;

  return (
    <View style={styles.centerTabContainer}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={styles.centerTouchable}
      >
        <Animated.View
          style={[styles.centerButtonWrapper, { transform: [{ scale: pressScale }] }]}
        >
          {/* Layer 1: Ambient Outer Breathing Glow Ring (Visible on Android + iOS) */}
          {shouldGlow && (
            <Animated.View
              style={[
                styles.centerGlowRingOuter,
                {
                  backgroundColor: colors.primary + (isFocused ? '42' : '28'),
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            />
          )}

          {/* Layer 2: Inner Halo Ring */}
          <View
            style={[
              styles.centerHaloRing,
              {
                backgroundColor: colors.primary + (isFocused ? '30' : (shouldGlow ? '18' : '10')),
                borderColor: colors.primary + (isFocused ? '80' : (shouldGlow ? '50' : '20')),
              },
            ]}
          >
            {/* Core Gradient Button */}
            <LinearGradient
              colors={[colors.primary, colors.accent || '#8b5cf6']}
              style={styles.centerButton}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.centerSpecularShine} />
              <Ionicons
                name={(isFocused ? tab.iconActive : tab.icon) as any}
                size={24}
                color="#ffffff"
              />
            </LinearGradient>
          </View>
        </Animated.View>
      </TouchableOpacity>
      <Text 
        style={[styles.centerLabel, isFocused && styles.centerLabelActive]}
        numberOfLines={1}
        textBreakStrategy="simple"
      >
        {tab.label}
      </Text>
    </View>
  );
}

const useStyles = (colors: any, _isStudyOSMode: boolean) => StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: Platform.OS === "ios" ? 28 : 10,
    paddingTop: 8,
    paddingHorizontal: 6,
    position: "relative",
    elevation: 16,
    justifyContent: "space-between",
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  topSpecularLine: {
    position: 'absolute',
    top: -1,
    left: 0,
    right: 0,
    height: 1.5,
  },

  // Normal Tab Styles
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
  },
  tabContentWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  iconWrap: {
    width: 44,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    position: 'relative',
  },
  activeWash: {
    position: 'absolute',
    top: 1,
    left: 4,
    right: 4,
    bottom: 1,
    borderRadius: 14,
  },
  activeDot: {
    position: 'absolute',
    bottom: -3,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  avatarImage: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  label: {
    fontSize: 10,
    lineHeight: 13,
    fontFamily: "Inter_600SemiBold",
    color: colors.textDim,
    paddingHorizontal: 0,
    letterSpacing: 0,
    textAlign: 'center',
    includeFontPadding: false,
  },
  labelActive: {
    color: colors.primary,
    fontFamily: "Inter_700Bold",
  },

  // Center Floating Tab Styles
  centerTabContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    position: "relative",
    zIndex: 10,
  },
  centerTouchable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerButtonWrapper: {
    marginBottom: 4,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: colors.primary,
    shadowRadius: 16,
    shadowOpacity: 0.6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  centerGlowRingOuter: {
    position: 'absolute',
    width: 66,
    height: 66,
    borderRadius: 33,
  },
  centerHaloRing: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    position: 'relative',
    overflow: 'hidden',
  },
  centerSpecularShine: {
    position: 'absolute',
    top: 0,
    left: 6,
    right: 6,
    height: 12,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  centerLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontFamily: "Inter_600SemiBold",
    color: colors.textDim,
    paddingHorizontal: 0,
    letterSpacing: 0,
    marginTop: 2,
    textAlign: 'center',
    includeFontPadding: false,
  },
  centerLabelActive: {
    color: colors.primary,
    fontFamily: "Inter_700Bold",
  },
});
