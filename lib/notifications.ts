import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Configure and register all required Android Notification Channels.
 * Must be called early on app launch and inside headless background tasks.
 * Uses AndroidImportance.MAX so alerts and banners appear even when app is killed or device is locked.
 */
export async function setupAndroidChannels() {
  if (Platform.OS !== 'android') return;

  try {
    // 1. General Default Channel (fallback for FCM / Expo push notifications)
    await Notifications.setNotificationChannelAsync('default', {
      name: 'General Notifications',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3b82f6',
      showBadge: true,
      enableLights: true,
      enableVibrate: true,
    });

    // 2. Main App Channel (Assignments, Announcements, Portal updates)
    await Notifications.setNotificationChannelAsync('pathwise-default-v2', {
      name: 'PathWise Notifications',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'ting.mp3',
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3b82f6',
      showBadge: true,
      enableLights: true,
      enableVibrate: true,
    });

    // 3. Achievements, Coins & Marks Channel
    await Notifications.setNotificationChannelAsync('pathwise-coin-v2', {
      name: 'PathWise — Achievements & Marks',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'mario_coin.mp3',
      vibrationPattern: [0, 100, 100, 100],
      lightColor: '#f59e0b',
      showBadge: true,
      enableLights: true,
      enableVibrate: true,
    });

    // 4. Critical Attendance & Streak Alerts Channel
    await Notifications.setNotificationChannelAsync('pathwise-streak-v2', {
      name: 'PathWise — Attendance & Streak Alerts',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'mario_death.mp3',
      vibrationPattern: [0, 500, 200, 500],
      lightColor: '#ef4444',
      showBadge: true,
      enableLights: true,
      enableVibrate: true,
    });

    // 5. Backward compatibility for legacy channel IDs
    await Notifications.setNotificationChannelAsync('pathwise-default', {
      name: 'PathWise Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      showBadge: true,
    });
  } catch (e) {
    console.warn('[Notifications] setupAndroidChannels error:', e);
  }
}
