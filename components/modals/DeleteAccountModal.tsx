import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, TouchableWithoutFeedback, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Typography, Spacing } from "../../constants/theme";
import { useThemeStore } from "../../store/useThemeStore";
import { GlassCard } from "../ui/GlassCard";

interface DeleteAccountModalProps {
  isVisible: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function DeleteAccountModal({ isVisible, onClose, onConfirm }: DeleteAccountModalProps) {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const isConfirmed = confirmText.trim().toUpperCase() === 'DELETE';

  React.useEffect(() => {
    if (!isVisible) {
      setConfirmText('');
      setIsDeleting(false);
    }
  }, [isVisible]);

  const handleConfirm = async () => {
    if (!isConfirmed) return;
    setIsDeleting(true);
    await onConfirm();
    setIsDeleting(false);
    onClose();
  };

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="fade"
      onRequestClose={isDeleting ? undefined : onClose}
    >
      <TouchableWithoutFeedback onPress={isDeleting ? undefined : onClose}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.overlay}
        >
          <TouchableWithoutFeedback>
            <View style={styles.modalContainer}>
              <View style={styles.content}>

                {/* Icon */}
                <View style={[styles.iconContainer, { backgroundColor: colors.error + '22' }]}>
                  <Ionicons name="warning" size={34} color={colors.error} />
                </View>

                <Text style={styles.title}>Delete Account</Text>
                <Text style={styles.description}>
                  This action is{' '}
                  <Text style={{ fontWeight: 'bold', color: colors.text }}>permanent and irreversible.</Text>
                  {' '}All your data — progress, roadmaps, and settings — will be erased forever.
                </Text>

                {/* Danger List */}
                <GlassCard style={styles.dangerCard}>
                  {[
                    "All progress & achievements",
                    "Enrolled roadmaps",
                    "Custom settings & preferences",
                    "Account cannot be recovered",
                  ].map((item, i) => (
                    <View key={i} style={styles.dangerRow}>
                      <Ionicons name="close-circle" size={16} color={colors.error} />
                      <Text style={styles.dangerText}>{item}</Text>
                    </View>
                  ))}
                </GlassCard>

                {/* Type to confirm */}
                <Text style={styles.confirmLabel}>
                  Type <Text style={{ color: colors.error, fontWeight: 'bold' }}>DELETE</Text> to confirm
                </Text>
                <TextInput
                  style={[
                    styles.confirmInput,
                    {
                      borderColor: confirmText.length > 0
                        ? isConfirmed ? '#22c55e' : colors.error
                        : colors.border,
                    }
                  ]}
                  value={confirmText}
                  onChangeText={setConfirmText}
                  placeholder="Type DELETE here"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!isDeleting}
                />

                {/* Buttons */}
                <View style={styles.buttonContainer}>
                  <TouchableOpacity
                    style={[styles.button, styles.cancelBtn]}
                    onPress={onClose}
                    disabled={isDeleting}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.button,
                      styles.deleteBtn,
                      {
                        backgroundColor: isConfirmed ? colors.error : colors.error + '44',
                      }
                    ]}
                    onPress={handleConfirm}
                    disabled={!isConfirmed || isDeleting}
                  >
                    {isDeleting ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={[styles.deleteBtnText, { opacity: isConfirmed ? 1 : 0.5 }]}>
                        Delete Forever
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>

              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.background,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    overflow: 'hidden',
  },
  content: {
    padding: Spacing.xl,
    alignItems: 'center',
    gap: 14,
  },
  iconContainer: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...Typography.h2,
    color: colors.text,
    textAlign: 'center',
  },
  description: {
    ...Typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  dangerCard: {
    width: '100%',
    padding: Spacing.md,
    backgroundColor: colors.error + '11',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.error + '33',
    gap: 8,
  },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dangerText: {
    ...Typography.small,
    color: colors.text,
  },
  confirmLabel: {
    ...Typography.body,
    color: colors.textMuted,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  confirmInput: {
    width: '100%',
    height: 52,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1.5,
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
    paddingHorizontal: 16,
    letterSpacing: 2,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
    marginTop: 4,
  },
  button: {
    flex: 1,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelBtnText: {
    ...Typography.label,
    color: colors.text,
    fontWeight: 'bold',
  },
  deleteBtn: {},
  deleteBtnText: {
    ...Typography.label,
    color: '#fff',
    fontWeight: 'bold',
  },
});
