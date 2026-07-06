import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from "react-native";
import { Rocket, ArrowRight, Download } from "lucide-react-native";
import { useUpdateStore } from "../../store/useUpdateStore";
import { useThemeStore } from "../../store/useThemeStore";
import { Typography, Spacing } from "../../constants/theme";
import { CenterPopModal } from "../ui/CenterPopModal";

export function AppUpdateModal() {
  const colors = useThemeStore((s) => s.colors);
  const {
    updateModalVisible,
    setUpdateModalVisible,
    currentVersion,
    latestVersion,
    downloadUrl,
    releaseNotes,
  } = useUpdateStore();

  const handleUpgrade = async () => {
    if (!downloadUrl) return;
    try {
      await Linking.openURL(downloadUrl);
    } catch (e) {
      console.error("Failed to open download URL", e);
    }
  };

  const handleSkip = () => {
    setUpdateModalVisible(false);
  };

  return (
    <CenterPopModal isVisible={updateModalVisible} onClose={handleSkip}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {/* Icon */}
        <View style={[styles.iconWrapper, { backgroundColor: `${colors.primary}1A` }]}>
          <Rocket size={32} color={colors.primary} strokeWidth={2} />
        </View>

        <Text style={[styles.title, { color: colors.text }]}>
          Update Available
        </Text>

        <View style={styles.versionRow}>
          <View style={[styles.versionBadge, { backgroundColor: colors.border }]}>
            <Text style={[styles.versionText, { color: colors.textDim }]}>
              v{currentVersion}
            </Text>
          </View>
          <ArrowRight size={16} color={colors.textDim} />
          <View style={[styles.versionBadge, { backgroundColor: colors.primary + "20" }]}>
            <Text style={[styles.versionText, { color: colors.primary }]}>
              v{latestVersion}
            </Text>
          </View>
        </View>

        <Text style={[styles.description, { color: colors.textDim }]}>
          {releaseNotes ||
            "A new version of PathWise is ready. Update now for the latest features, improvements, and bug fixes."}
        </Text>

        {/* Buttons */}
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={handleUpgrade}
          activeOpacity={0.85}
        >
          <Download size={18} color="#fff" strokeWidth={2.5} />
          <Text style={styles.primaryBtnText}>Download Update</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.skipBtn}
          onPress={handleSkip}
          activeOpacity={0.7}
        >
          <Text style={[styles.skipBtnText, { color: colors.textDim }]}>
            Skip for now
          </Text>
        </TouchableOpacity>
      </View>
    </CenterPopModal>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderRadius: 24,
    borderWidth: 1,
    padding: Spacing.xl,
    alignItems: "center",
  },
  iconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.h2,
    textAlign: "center",
    marginBottom: Spacing.sm,
    fontSize: 22,
  },
  versionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: Spacing.md,
  },
  versionBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  versionText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  description: {
    ...Typography.body,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  primaryBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 16,
    marginBottom: Spacing.sm,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: 0.5,
  },
  skipBtn: {
    width: "100%",
    paddingVertical: 12,
    alignItems: "center",
  },
  skipBtnText: {
    fontWeight: "600",
    fontSize: 15,
  },
});
