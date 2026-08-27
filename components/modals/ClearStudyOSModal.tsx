import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TouchableWithoutFeedback,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MotiView } from "moti";
import { Spacing, Typography } from "../../constants/theme";
import { useThemeStore } from "../../store/useThemeStore";

interface Props {
  isVisible: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

const CLEAR_ITEMS = [
  { icon: "person-outline",        label: "CUIMS University ID & Password" },
  { icon: "key-outline",           label: "Login Cookies & Active Session" },
  { icon: "calendar-outline",      label: "Attendance Records & History" },
  { icon: "school-outline",        label: "Grades, Marks & Results" },
  { icon: "book-outline",          label: "Subjects & Timetable" },
  { icon: "notifications-outline", label: "Attendance Notification Cache" },
];

export function ClearStudyOSModal({ isVisible, onClose, onConfirm }: Props) {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  React.useEffect(() => {
    if (!isVisible) {
      setLoading(false);
      setDone(false);
    }
  }, [isVisible]);

  const handleConfirm = async () => {
    setLoading(true);
    await onConfirm();
    setLoading(false);
    setDone(true);
    setTimeout(() => { onClose(); }, 1400);
  };

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      onRequestClose={loading ? undefined : onClose}
    >
      <TouchableWithoutFeedback onPress={loading ? undefined : onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <MotiView
              from={{ opacity: 0, scale: 0.93, translateY: 20 }}
              animate={{ opacity: 1, scale: 1, translateY: 0 }}
              transition={{ type: "spring", damping: 18, stiffness: 250 }}
              style={styles.card}
            >
              {/* Amber Icon */}
              <View style={styles.iconWrap}>
                <Ionicons name="school" size={32} color="#f59e0b" />
              </View>

              <Text style={styles.title}>Reset StudyOS Data</Text>
              <Text style={styles.subtitle}>
                This action is{" "}
                <Text style={{ color: colors.text, fontWeight: "bold" }}>permanent and irreversible.</Text>
                {" "}All locally stored university data will be erased. You will need to reconnect your CUIMS account.
              </Text>

              {/* What gets cleared */}
              <View style={styles.listCard}>
                {CLEAR_ITEMS.map((item, i) => (
                  <View key={i} style={styles.listRow}>
                    <View style={styles.listIconWrap}>
                      <Ionicons name={item.icon as any} size={14} color="#f59e0b" />
                    </View>
                    <Text style={styles.listText}>{item.label}</Text>
                  </View>
                ))}
              </View>

              {/* Footer */}
              {done ? (
                <MotiView
                  from={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  style={styles.doneRow}
                >
                  <Ionicons name="checkmark-circle" size={24} color="#22c55e" />
                  <Text style={styles.doneText}>Data reset successfully.</Text>
                </MotiView>
              ) : (
                <View style={styles.btnRow}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={onClose}
                    disabled={loading}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.btnText, { color: colors.text }]}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.clearBtn, loading && { opacity: 0.75 }]}
                    onPress={handleConfirm}
                    disabled={loading}
                    activeOpacity={0.8}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="trash-outline" size={16} color="#fff" />
                        <Text style={[styles.btnText, { color: "#fff" }]}>Clear All Data</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </MotiView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.82)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: colors.background,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: Spacing.xl,
    alignItems: "center",
    gap: 14,
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
  },
  iconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#f59e0b22",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#f59e0b44",
  },
  title: {
    ...Typography.h2,
    color: colors.text,
    textAlign: "center",
  },
  subtitle: {
    ...Typography.body,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  listCard: {
    width: "100%",
    backgroundColor: "#f59e0b0f",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#f59e0b33",
    padding: Spacing.md,
    gap: 10,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  listIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#f59e0b22",
    alignItems: "center",
    justifyContent: "center",
  },
  listText: {
    ...Typography.small,
    color: colors.text,
    flex: 1,
  },
  btnRow: {
    flexDirection: "row",
    gap: Spacing.md,
    width: "100%",
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clearBtn: {
    flex: 1.6,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f59e0b",
    flexDirection: "row",
    gap: 6,
  },
  btnText: {
    ...Typography.label,
    fontWeight: "bold",
  },
  doneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  doneText: {
    ...Typography.body,
    color: "#22c55e",
    fontWeight: "bold",
  },
});
