import React, { useRef } from "react";
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
import { Typography, Radius } from "../../constants/theme";
import { useThemeStore } from "../../store/useThemeStore";
import { useStudySessionStore } from "../../store/studySessionStore";
import { useRouter } from "expo-router";

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { user } = useUser();
  const { isConnected, isStudyOSMode, setStudyOSMode } = useStudySessionStore();
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors, isStudyOSMode);
  const router = useRouter();

  const profileLongPressTimer = useRef<any>(null);
  const isProfileMenuVisible = useRef(false);
  const profileHoveredRef = useRef<'studyos' | 'pathwise' | null>(null);
  const profileTouchStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

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
      <LinearGradient
        colors={['transparent', colors.primary + '55', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.topSpecularLine}
        pointerEvents="none"
      />
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
          
          if (baseName === "profile") {
             return (
               <View
                 key={route.key}
                 style={styles.tab}
                 accessibilityRole="button"
                 accessibilityState={isFocused ? { selected: true } : {}}
                 accessibilityLabel={options.tabBarAccessibilityLabel}
                 onStartShouldSetResponder={() => true}
                 onStartShouldSetResponderCapture={() => true}
                 onMoveShouldSetResponder={() => true}
                 onMoveShouldSetResponderCapture={() => true}
                 onResponderTerminationRequest={() => false}
                 onResponderGrant={(e) => {
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
                            // Slide UP: negative dy dominates
                            if (-dy > 16 && -dy > Math.abs(dx) * 0.55) {
                                hovered = 'studyos';
                            } 
                            // Slide LEFT: negative dx dominates
                            else if (-dx > 16 && -dx > Math.abs(dy) * 0.55) {
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
                    clearTimeout(profileLongPressTimer.current);
                    if (isProfileMenuVisible.current) {
                        isProfileMenuVisible.current = false;
                        const hovered = profileHoveredRef.current;
                        profileHoveredRef.current = null;
                        DeviceEventEmitter.emit('profileSwitchHover', null);
                        
                        if (hovered) {
                            const targetMode = hovered === 'studyos';
                            if (targetMode !== isStudyOSMode) {
                                // Immediately hide Arc Switcher without delay
                                DeviceEventEmitter.emit('profileSwitchVisible', { visible: false, immediate: true });
                                // Immediately show global loading screen
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
                        onPress(); // Normal tap
                    }
                 }}
                 onResponderTerminate={() => {
                    clearTimeout(profileLongPressTimer.current);
                    if (isProfileMenuVisible.current) {
                        isProfileMenuVisible.current = false;
                        DeviceEventEmitter.emit('profileSwitchVisible', { visible: false });
                        profileHoveredRef.current = null;
                        DeviceEventEmitter.emit('profileSwitchHover', null);
                    }
                 }}
               >
                 <View style={[styles.iconWrap, isFocused && styles.iconWrapActive]}>
                   {user?.imageUrl ? (
                     <Image
                       source={{ uri: user.imageUrl }}
                       style={[
                         styles.avatarImage,
                         isFocused && { borderColor: colors.primary, borderWidth: 2 }
                       ]}
                     />
                   ) : (
                     <Ionicons
                       name={(isFocused ? tab.iconActive : tab.icon) as any}
                       size={21}
                       color={isFocused ? colors.primary : colors.textDim}
                     />
                   )}
                   {isFocused && (
                     <View style={[styles.activeDot, { backgroundColor: colors.primary }]} />
                   )}
                 </View>
                 <Text style={[styles.label, isFocused && styles.labelActive]}>
                   {tab.label}
                 </Text>
               </View>
             );
          }

          return (
            <TouchableOpacity
              key={route.key}
              style={styles.tab}
              onPress={onPress}
              activeOpacity={1}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
            >
              <View style={[styles.iconWrap, isFocused && styles.iconWrapActive]}>
                <Ionicons
                  name={(isFocused ? tab.iconActive : tab.icon) as any}
                  size={21}
                  color={isFocused ? colors.primary : colors.textDim}
                />
                {isFocused && (
                  <View style={[styles.activeDot, { backgroundColor: colors.primary }]} />
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
      toValue: 0.90,
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
        style={styles.centerTouchable}
      >
        <Animated.View
          style={[styles.centerButtonWrapper, { transform: [{ scale }] }]}
        >
          {/* Ambient outer halo ring */}
          <View
            style={[
              styles.centerHaloRing,
              {
                backgroundColor: isFocused ? colors.primary + '25' : colors.primary + '12',
                borderColor: isFocused ? colors.primary + '55' : colors.primary + '25',
              },
            ]}
          >
            <LinearGradient
              colors={[colors.primary, colors.accent || '#8b5cf6']}
              style={styles.centerButton}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              {/* Subtle top specular sheen */}
              <View style={styles.centerSpecularShine} />
              <Ionicons
                name={(isFocused ? tab.iconActive : tab.icon) as any}
                size={25}
                color="#ffffff"
              />
            </LinearGradient>
          </View>
        </Animated.View>
      </TouchableOpacity>
      <Text style={[styles.centerLabel, isFocused && styles.centerLabelActive]}>
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
    gap: 3,
    paddingVertical: 2,
  },
  iconWrap: {
    width: 40,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    position: 'relative',
  },
  iconWrapActive: {},
  activeDot: {
    position: 'absolute',
    bottom: -4,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  avatarImage: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  label: {
    ...Typography.label,
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: colors.textDim,
    paddingHorizontal: 2,
    letterSpacing: 0.1,
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
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowRadius: 14,
    shadowOpacity: 0.55,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  centerHaloRing: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
    ...Typography.label,
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: colors.textDim,
    position: "absolute",
    bottom: -3,
    paddingHorizontal: 2,
    letterSpacing: 0.1,
  },
  centerLabelActive: {
    color: colors.primary,
    fontFamily: "Inter_700Bold",
  },
});

