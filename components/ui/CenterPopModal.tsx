import React, { useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Animated,
  Pressable,
  Easing,
  Modal,
  Dimensions,
} from "react-native";

const { width, height } = Dimensions.get("screen");

interface CenterPopModalProps {
  isVisible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function CenterPopModal({ isVisible, onClose, children }: CenterPopModalProps) {
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  // We only run the pop-in bounce animation when the modal becomes visible.
  // The fade-in and fade-out is 100% handled natively by the OS via Modal's animationType="fade".
  useEffect(() => {
    if (isVisible) {
      scaleAnim.setValue(0.95);
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.back(1.2)),
        useNativeDriver: true,
      }).start();
    }
  }, [isVisible, scaleAnim]);

  return (
    <Modal 
      visible={isVisible} 
      transparent={true} 
      animationType="fade" 
      onRequestClose={onClose}
      statusBarTranslucent={true}
      navigationBarTranslucent={true}
      presentationStyle="overFullScreen"
    >
      <View style={styles.container}>
        {/* Static Dark Backdrop - Opacity is handled by the Modal's native fade */}
        <View style={styles.backdrop} />
        
        {/* Invisible Pressable for closing */}
        <Pressable style={styles.backdrop} onPress={onClose} />

        {/* Centered Content */}
        <View style={styles.centeredWrapper} pointerEvents="box-none">
          <Animated.View
            style={[
              {
                transform: [{ scale: scaleAnim }],
                width: "100%",
              },
            ]}
          >
            {children}
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width,
    height,
    position: "absolute",
    top: 0,
    left: 0,
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    width,
    height,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  centeredWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    zIndex: 2,
    width,
    height,
    position: "absolute",
    top: 0,
    left: 0,
  },
});

