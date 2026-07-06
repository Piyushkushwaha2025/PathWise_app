import { create } from "zustand";
import * as Notifications from "expo-notifications";

interface NotificationHistoryItem {
  id: string;
  title: string;
  message: string;
  date: string;
}

interface NotificationState {
  remindersEnabled: boolean;
  inactivityAlertsEnabled: boolean;
  customRingtoneEnabled: boolean;
  history: NotificationHistoryItem[];
  setReminders: (enabled: boolean) => void;
  setInactivityAlerts: (enabled: boolean) => void;
  setCustomRingtone: (enabled: boolean) => void;
  addNotification: (title: string, message: string) => void;
  clearHistory: () => void;
}

export const useNotificationStore = create<NotificationState>()((set) => ({
  remindersEnabled: true,
  inactivityAlertsEnabled: true,
  customRingtoneEnabled: true,
  history: [
    {
      id: "1",
      title: "Welcome to PathWise! 🚀",
      message: "Let's build some logic today.",
      date: new Date().toISOString(),
    },
  ],
  setReminders: (enabled) => set({ remindersEnabled: enabled }),
  setInactivityAlerts: (enabled) => set({ inactivityAlertsEnabled: enabled }),
  setCustomRingtone: (enabled) => set({ customRingtoneEnabled: enabled }),
  addNotification: async (title, message) => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body: message,
          sound: "ting.mp3",
        },
        trigger: {
          channelId: "pathwise-default-v2",
        } as any,
      });
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
        },
        ...state.history,
      ].slice(0, 50),
    }));
  },
  clearHistory: () => set({ history: [] }),
}));
