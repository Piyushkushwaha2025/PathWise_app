import { create } from "zustand";
import * as Notifications from "expo-notifications";

interface NotificationHistoryItem {
  id: string;
  title: string;
  message: string;
  date: string;
  type: "default" | "success" | "alert";
  isRead: boolean;
}

interface NotificationState {
  remindersEnabled: boolean;
  inactivityAlertsEnabled: boolean;
  customRingtoneEnabled: boolean;
  history: NotificationHistoryItem[];
  setReminders: (enabled: boolean) => void;
  setInactivityAlerts: (enabled: boolean) => void;
  setCustomRingtone: (enabled: boolean) => void;
  addNotification: (title: string, message: string, type?: "default" | "success" | "alert") => void;
  markAllAsRead: () => void;
  clearHistory: () => void;
}

import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
  remindersEnabled: true,
  inactivityAlertsEnabled: true,
  customRingtoneEnabled: true,
  history: [
    {
      id: "1",
      title: "Welcome to PathWise! 🚀",
      message: "Let's build some logic today.",
      date: new Date().toISOString(),
      type: "default",
      isRead: false,
    },
  ],
  setReminders: (enabled) => set({ remindersEnabled: enabled }),
  setInactivityAlerts: (enabled) => set({ inactivityAlertsEnabled: enabled }),
  setCustomRingtone: (enabled) => set({ customRingtoneEnabled: enabled }),
  addNotification: async (title, message, type = "default") => {
    try {
      const state = get();
      let shouldPush = true;
      
      // Respect notification settings
      if (type === "alert" && !state.inactivityAlertsEnabled) shouldPush = false;
      if ((type === "success" || type === "default") && !state.remindersEnabled) shouldPush = false;

      if (shouldPush) {
        let soundFile = "ting.mp3";
        let channel = "pathwise-default-v2";

        if (state.customRingtoneEnabled) {
          if (type === "success") {
            soundFile = "mario_coin.mp3";
            channel = "pathwise-coin-v2";
          } else if (type === "alert") {
            soundFile = "mario_death.mp3";
            channel = "pathwise-streak-v2";
          }
        }

        await Notifications.scheduleNotificationAsync({
          content: {
            title,
            body: message,
            sound: soundFile,
          },
          trigger: {
            seconds: 1,
            channelId: channel,
          } as any,
        });
      }
    } catch (error) {
      console.log("Failed to schedule local notification:", error);
    }

    set((state) => ({
      history: [
        {
          id: Date.now().toString(),
          title,
          message,
          date: new Date().toISOString(),
          type,
          isRead: false,
        },
        ...state.history,
      ].slice(0, 50),
    }));
  },
  markAllAsRead: () =>
    set((state) => ({
      history: state.history.map((item) => ({ ...item, isRead: true })),
    })),
  clearHistory: () => set({ history: [] }),
    }),
    {
      name: "notification-storage",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
