import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert } from "react-native";
import { Lock } from "lucide-react-native";
import { CenterPopModal } from "../ui/CenterPopModal";
import { useThemeStore } from "../../store/useThemeStore";
import { Typography, Spacing } from "../../constants/theme";
import { useUser } from "@clerk/clerk-expo";

interface Props {
  isVisible: boolean;
  onClose: () => void;
}

export function ChangePasswordModal({ isVisible, onClose }: Props) {
  const colors = useThemeStore((s) => s.colors);
  const { user } = useUser();
  
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleClose = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setErrorMsg("");
    onClose();
  };

  const handleUpdatePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setErrorMsg("Please fill in all fields.");
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setErrorMsg("New passwords do not match.");
      return;
    }

    if (newPassword.length < 8) {
      setErrorMsg("Password must be at least 8 characters long.");
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg("");
      
      await user?.updatePassword({
        currentPassword,
        newPassword,
      });
      
      Alert.alert("Success", "Your password has been updated securely.");
      handleClose();
    } catch (err: any) {
      const msg = err.errors?.[0]?.message || err.message || "Failed to update password. Please check your current password and try again.";
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <CenterPopModal isVisible={isVisible} onClose={handleClose}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.iconWrapper, { backgroundColor: `${colors.primary}1A` }]}>
           <Lock size={32} color={colors.primary} strokeWidth={2} />
        </View>
        
        <Text style={[styles.title, { color: colors.text }]}>Change Password</Text>
        
        <View style={styles.formContainer}>
          {errorMsg ? (
            <Text style={styles.errorText}>{errorMsg}</Text>
          ) : null}

          <TextInput
            style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
            placeholder="Current Password"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            value={currentPassword}
            onChangeText={(text) => {
              setCurrentPassword(text);
              setErrorMsg("");
            }}
            autoCapitalize="none"
          />

          <TextInput
            style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
            placeholder="New Password"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            value={newPassword}
            onChangeText={(text) => {
              setNewPassword(text);
              setErrorMsg("");
            }}
            autoCapitalize="none"
          />

          <TextInput
            style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
            placeholder="Confirm New Password"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            value={confirmPassword}
            onChangeText={(text) => {
              setConfirmPassword(text);
              setErrorMsg("");
            }}
            autoCapitalize="none"
          />
        </View>
        
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.primary, opacity: isLoading ? 0.7 : 1 }]}
          onPress={handleUpdatePassword}
          activeOpacity={0.85}
          disabled={isLoading}
        >
          {isLoading ? (
             <ActivityIndicator color="#fff" />
          ) : (
             <Text style={styles.btnText}>Update Password</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} disabled={isLoading}>
          <Text style={[styles.cancelBtnText, { color: colors.textDim }]}>Cancel</Text>
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
    marginBottom: Spacing.lg,
    textAlign: "center",
    fontSize: 22,
  },
  formContainer: {
    width: "100%",
    marginBottom: Spacing.xl,
    gap: 12,
  },
  input: {
    width: "100%",
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 14,
    marginBottom: 4,
    textAlign: "center",
  },
  btn: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 16,
    width: "100%",
    alignItems: "center",
    marginBottom: 12,
  },
  btnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: 0.5,
  },
  cancelBtn: {
    paddingVertical: 8,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: "600",
  }
});
