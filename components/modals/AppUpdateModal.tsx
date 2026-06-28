import React from "react";
import { View, Text, StyleSheet, Modal, TouchableOpacity, Linking, Image } from "react-native";
import { useUpdateStore } from "../../store/useUpdateStore";
import { useThemeStore } from "../../store/useThemeStore";
import { Typography, Spacing } from "../../constants/theme";

export function AppUpdateModal() {
  const { colors } = useThemeStore();
  const { updateModalVisible, setUpdateModalVisible, currentVersion, latestVersion, downloadUrl } = useUpdateStore();

  const handleUpgrade = async () => {
    try {
      await Linking.openURL(downloadUrl);
      // We don't automatically close the modal, as they might want to return to it if download fails,
      // but typically we'd let them skip to close it.
    } catch (e) {
      console.error("Failed to open URL", e);
    }
  };

  const handleSkip = () => {
    setUpdateModalVisible(false);
  };

  return (
    <Modal
      visible={updateModalVisible}
      transparent
      animationType="slide"
      onRequestClose={handleSkip}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: colors.surface }]}>
          
          <View style={styles.iconContainer}>
            <Text style={{ fontSize: 40 }}>🚀</Text>
          </View>

          <Text style={[styles.title, { color: colors.text }]}>
            Update Available!
          </Text>
          <Text style={[styles.message, { color: colors.textDim }]}>
            You are currently on version {currentVersion}. A new version ({latestVersion}) of Pathwise AI is ready. We've squashed some bugs and added new features to make your experience even better.
          </Text>

          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={[styles.primaryButton, { backgroundColor: colors.primary }]} 
              onPress={handleUpgrade}
            >
              <Text style={styles.primaryButtonText}>Upgrade Now</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.secondaryButton, { borderColor: colors.border }]} 
              onPress={handleSkip}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.textDim }]}>
                Skip for now
              </Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  container: {
    width: "100%",
    borderRadius: 24,
    padding: Spacing.xl,
    alignItems: "center",
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.h2,
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  message: {
    ...Typography.body,
    textAlign: "center",
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  buttonContainer: {
    width: "100%",
    gap: Spacing.md,
  },
  primaryButton: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  secondaryButton: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
  },
  secondaryButtonText: {
    fontWeight: "600",
    fontSize: 16,
  }
});
