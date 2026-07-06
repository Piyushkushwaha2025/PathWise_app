import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { CheckCircle2 } from "lucide-react-native";
import { CenterPopModal } from "../ui/CenterPopModal";
import { useThemeStore } from "../../store/useThemeStore";
import { Typography, Spacing } from "../../constants/theme";

interface Props {
  isVisible: boolean;
  onClose: () => void;
}

export function UpToDateModal({ isVisible, onClose }: Props) {
  const colors = useThemeStore((s) => s.colors);
  const successColor = colors.success || "#10b981";

  return (
    <CenterPopModal isVisible={isVisible} onClose={onClose}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.iconWrapper, { backgroundColor: `${successColor}1A` }]}>
           <CheckCircle2 size={32} color={successColor} strokeWidth={2} />
        </View>
        
        <Text style={[styles.title, { color: colors.text }]}>Up to Date</Text>
        
        <Text style={[styles.text, { color: colors.textDim }]}>
          You are already running the latest and greatest version of PathWise. 
        </Text>
        
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: successColor }]}
          onPress={onClose}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>Awesome!</Text>
        </TouchableOpacity>
      </View>
    </CenterPopModal>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.xl,
    alignItems: "center",
    borderRadius: 24,
    borderWidth: 1,
    width: "100%",
  },
  iconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.h2,
    marginBottom: Spacing.sm,
    textAlign: "center",
    fontSize: 22,
  },
  text: {
    ...Typography.body,
    textAlign: "center",
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  btn: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 16,
    width: "100%",
    alignItems: "center",
  },
  btnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: 0.5,
  },
});
