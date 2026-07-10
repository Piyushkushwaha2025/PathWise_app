import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  Modal,
  Animated,
  Dimensions,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Typography, Spacing } from "../../constants/theme";
import { useThemeStore } from "../../store/useThemeStore";
import { useNotificationStore } from "../../store/useNotificationStore";
import * as Notifications from "expo-notifications";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const ANIMATION_DURATION = 320;

interface Props {
  isVisible: boolean;
  onClose: () => void;
  type?: "history" | "settings" | "both";
}

export function NotificationsBottomSheet({ isVisible, onClose, type = "both" }: Props) {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);

  const {
    remindersEnabled,
    inactivityAlertsEnabled,
    customRingtoneEnabled,
    history,
    setReminders,
    setInactivityAlerts,
    setCustomRingtone,
    addNotification,
    clearHistory,
  } = useNotificationStore();

  const sheetHeight = type === "history" ? SCREEN_HEIGHT * 0.75 : SCREEN_HEIGHT * 0.85;

  // Animated values
  const translateY = useRef(new Animated.Value(sheetHeight)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [modalVisible, setModalVisible] = React.useState(false);

  useEffect(() => {
    if (isVisible) {
      setModalVisible(true);
      if (type === "history" || type === "both") {
        useNotificationStore.getState().markAllAsRead();
      }

      // Sheet — native driver (smooth transforms)
      Animated.timing(translateY, {
        toValue: 0,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }).start();

      // Backdrop — JS driver (reliable opacity on Android)
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: ANIMATION_DURATION,
        useNativeDriver: false,
      }).start();
    } else {
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

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Dark backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />

      {/* Sheet */}
      <Animated.View
        style={[
          styles.container,
          { height: sheetHeight, transform: [{ translateY }] },
        ]}
      >
        {/* Drag Handle */}
        <View style={styles.dragHandle} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Notifications</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={colors.textDim} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Settings Section */}
          {(type === "settings" || type === "both") && (
            <>
              <Text style={styles.sectionTitle}>Settings</Text>
              <View style={styles.settingsGroup}>
                <View style={styles.settingRow}>
                  <View style={styles.settingTextContent}>
                    <Text style={styles.settingLabel}>Streak Reminders</Text>
                    <Text style={styles.settingDesc}>Daily push notifications to keep you on track</Text>
                  </View>
                  <Switch
                    value={remindersEnabled}
                    onValueChange={setReminders}
                    trackColor={{ false: colors.border, true: colors.primary }}
                  />
                </View>
                <View style={styles.divider} />
                <View style={styles.settingRow}>
                  <View style={styles.settingTextContent}>
                    <Text style={styles.settingLabel}>Inactivity Alerts</Text>
                    <Text style={styles.settingDesc}>Notify me if I miss learning for 3+ days</Text>
                  </View>
                  <Switch
                    value={inactivityAlertsEnabled}
                    onValueChange={setInactivityAlerts}
                    trackColor={{ false: colors.border, true: colors.primary }}
                  />
                </View>
                <View style={styles.divider} />
                <View style={styles.settingRow}>
                  <View style={styles.settingTextContent}>
                    <Text style={styles.settingLabel}>Custom Ringtone</Text>
                    <Text style={styles.settingDesc}>Play Mario Coin & Death sounds for alerts</Text>
                  </View>
                  <Switch
                    value={customRingtoneEnabled}
                    onValueChange={setCustomRingtone}
                    trackColor={{ false: colors.border, true: colors.primary }}
                  />
                </View>

              </View>
            </>
          )}

          {/* History Section */}
          {(type === "history" || type === "both") && (
            <>
              <View style={styles.historyHeader}>
                <Text style={styles.sectionTitle}>History</Text>
                {history.length > 0 && (
                  <TouchableOpacity onPress={clearHistory}>
                    <Text style={styles.clearText}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.historyList}>
                {history.length === 0 ? (
                  <Text style={styles.emptyText}>No recent notifications.</Text>
                ) : (
                  history.map((item) => {
                    let iconName: any = "notifications-outline";
                    let iconColor = colors.primary;
                    if (item.type === "success") {
                      iconName = "checkmark-circle";
                      iconColor = "#10b981"; // green
                    } else if (item.type === "alert") {
                      iconName = "warning";
                      iconColor = "#ef4444"; // red
                    }

                    return (
                    <View key={item.id} style={[styles.historyItem, !item.isRead && { backgroundColor: `${colors.primary}15` }]}>
                      <View style={[styles.historyIcon, { backgroundColor: `${iconColor}22` }]}>
                        <Ionicons name={iconName} size={20} color={iconColor} />
                      </View>
                      <View style={styles.historyContent}>
                        <Text style={styles.historyTitle}>{item.title}</Text>
                        <Text style={styles.historyMessage}>{item.message}</Text>
                        <Text style={styles.historyDate}>
                          {new Date(item.date).toLocaleDateString()} at{" "}
                          {new Date(item.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </Text>
                      </View>
                    </View>
                    );
                  })
                )}
              </View>
            </>
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const useStyles = (colors: any) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: "rgba(0, 0, 0, 0.65)",
    },
    container: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      overflow: "hidden",
      paddingTop: 12,
    },
    dragHandle: {
      width: 40,
      height: 4,
      backgroundColor: colors.border,
      borderRadius: 2,
      alignSelf: "center",
      marginBottom: 12,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: Spacing.lg,
      paddingBottom: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: {
      ...Typography.h2,
      color: colors.text,
    },
    closeBtn: {
      padding: 4,
    },
    scrollContent: {
      flex: 1,
      padding: Spacing.lg,
    },
    sectionTitle: {
      ...Typography.h3,
      color: colors.text,
      marginBottom: Spacing.md,
    },
    settingsGroup: {
      backgroundColor: colors.background,
      borderRadius: 16,
      padding: Spacing.md,
      marginBottom: Spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    settingRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    settingTextContent: {
      flex: 1,
      paddingRight: Spacing.md,
    },
    settingLabel: {
      ...Typography.body,
      color: colors.text,
      fontWeight: "600",
    },
    settingDesc: {
      ...Typography.small,
      color: colors.textDim,
      marginTop: 2,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: Spacing.md,
    },
    historyHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    clearText: {
      ...Typography.body,
      color: colors.primary,
    },
    historyList: {
      marginBottom: 40,
    },
    emptyText: {
      ...Typography.body,
      color: colors.textDim,
      textAlign: "center",
      marginTop: Spacing.lg,
    },
    historyItem: {
      flexDirection: "row",
      alignItems: "flex-start",
      backgroundColor: colors.background,
      padding: Spacing.md,
      borderRadius: 16,
      marginBottom: Spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    historyIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: `${colors.primary}1A`,
      alignItems: "center",
      justifyContent: "center",
      marginRight: Spacing.md,
    },
    historyContent: {
      flex: 1,
    },
    historyTitle: {
      ...Typography.body,
      fontWeight: "bold",
      color: colors.text,
    },
    historyMessage: {
      ...Typography.small,
      color: colors.textDim,
      marginTop: 2,
    },
    historyDate: {
      ...Typography.small,
      color: colors.textDim,
      marginTop: 6,
      fontSize: 10,
    },
    testBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
    },
    testBtnText: {
      ...Typography.label,
      fontWeight: "bold",
    },
  });
