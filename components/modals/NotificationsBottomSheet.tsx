import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
} from "react-native";
import Modal from "react-native-modal";
import { Ionicons } from "@expo/vector-icons";
import { Typography, Spacing } from "../../constants/theme";
import { useThemeStore } from "../../store/useThemeStore";
import { useNotificationStore } from "../../store/useNotificationStore";
import * as Notifications from "expo-notifications";

interface Props {
  isVisible: boolean;
  onClose: () => void;
}

export function NotificationsBottomSheet({ isVisible, onClose }: Props) {
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

  const handleTestNotification = async (type: "coin" | "death") => {
    const isCoin = type === "coin";
    const soundFile = isCoin ? "mario_coin.wav" : "mario_death.wav";
    
    await Notifications.scheduleNotificationAsync({
      content: {
        title: isCoin ? "PathWise 🚀" : "Streak Broken 💀",
        body: isCoin ? "Notification working perfectly!" : "You missed a day of learning!",
        sound: customRingtoneEnabled ? soundFile : true,
      },
      trigger: null,
    });
    
    addNotification(
      isCoin ? "Test Notification Fired" : "Streak Broken Fired", 
      isCoin ? "You tested the normal notification." : "You tested the streak broken alert."
    );
  };

  return (
    <Modal
      isVisible={isVisible}
      onSwipeComplete={onClose}
      swipeDirection={["down"]}
      style={styles.modal}
      propagateSwipe
    >
      <View style={styles.container}>
        <View style={styles.dragHandle} />
        
        <View style={styles.header}>
          <Text style={styles.title}>Notifications Hub</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={colors.textDim} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Settings Section */}
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
            
            <View style={styles.divider} />
            
            <View style={{ flexDirection: "row", gap: 10, marginTop: Spacing.sm }}>
              <TouchableOpacity 
                style={[styles.testBtn, { backgroundColor: `${colors.primary}1A`, borderColor: colors.primary }]}
                onPress={() => handleTestNotification("coin")}
              >
                <Ionicons name="notifications" size={16} color={colors.primary} />
                <Text style={[styles.testBtnText, { color: colors.primary }]}>Test Mario Coin</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.testBtn, { backgroundColor: `${colors.danger || '#ef4444'}1A`, borderColor: colors.danger || '#ef4444' }]}
                onPress={() => handleTestNotification("death")}
              >
                <Ionicons name="skull" size={16} color={colors.danger || '#ef4444'} />
                <Text style={[styles.testBtnText, { color: colors.danger || '#ef4444' }]}>Test Mario Death</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* History Section */}
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
              history.map((item) => (
                <View key={item.id} style={styles.historyItem}>
                  <View style={styles.historyIcon}>
                    <Ionicons name="notifications-outline" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.historyContent}>
                    <Text style={styles.historyTitle}>{item.title}</Text>
                    <Text style={styles.historyMessage}>{item.message}</Text>
                    <Text style={styles.historyDate}>
                      {new Date(item.date).toLocaleDateString()} at {new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const useStyles = (colors: any) =>
  StyleSheet.create({
    modal: {
      justifyContent: "flex-end",
      margin: 0,
    },
    container: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      height: "75%",
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
      color: colors.textMuted,
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
