import React, { useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Pressable,
} from "react-native";
import { useThemeStore } from "../../store/useThemeStore";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const ANIMATION_DURATION = 200;

interface SmoothSheetProps {
  isVisible: boolean;
  onClose: () => void;
  heightFraction?: number;
  children: React.ReactNode;
  avoidKeyboard?: boolean;
}

export function SmoothSheet({
  isVisible,
  onClose,
  heightFraction = 0.75,
  children,
  avoidKeyboard = false,
}: SmoothSheetProps) {
  const colors = useThemeStore((s) => s.colors);
  const sheetHeight = SCREEN_HEIGHT * heightFraction;

  // Keep separate animated values — do NOT mix in Animated.parallel with useNativeDriver
  const translateY = useRef(new Animated.Value(sheetHeight)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [modalVisible, setModalVisible] = React.useState(false);

  useEffect(() => {
    if (isVisible) {
      // Show modal first, then animate both independently
      setModalVisible(true);

      // Sheet slides in — native driver for smooth 60fps
      Animated.timing(translateY, {
        toValue: 0,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }).start();

      // Backdrop fades in — JS driver (more compatible on Android)
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: ANIMATION_DURATION,
        useNativeDriver: false,
      }).start();
    } else {
      // Animate out first, then hide modal
      Animated.timing(translateY, {
        toValue: sheetHeight,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }).start();

      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: ANIMATION_DURATION,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) setModalVisible(false);
      });
    }
  }, [isVisible]);

  const sheet = (
    <Animated.View
      style={[
        styles.container,
        {
          height: sheetHeight,
          backgroundColor: colors.surface,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={[styles.dragHandle, { backgroundColor: colors.border }]} />
      {children}
    </Animated.View>
  );

  if (!modalVisible) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 99 }]} pointerEvents="auto">
      {/* Dark backdrop — JS driver so opacity renders correctly on Android */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
      </Pressable>

      {avoidKeyboard ? (
        <KeyboardAvoidingView
          style={styles.keyboardWrapper}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          {sheet}
        </KeyboardAvoidingView>
      ) : (
        sheet
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  keyboardWrapper: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
  },
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    paddingTop: 12,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
});
