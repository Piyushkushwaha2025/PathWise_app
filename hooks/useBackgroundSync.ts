import { useEffect } from 'react';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { useStudySessionStore } from '../store/studySessionStore';
import { AppState } from 'react-native';

const BACKGROUND_SYNC_TASK = 'STUDYOS_BACKGROUND_SYNC';

// 1. Define the task in the global scope (must be outside of any component/hook)
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    const isConnected = useStudySessionStore.getState().isConnected;
    if (!isConnected) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // In a real implementation, you would:
    // 1. Fetch latest marks/attendance using SecureStore credentials
    // 2. Compare with locally cached AsyncStorage data
    // 3. If there are changes, trigger a local notification.
    
    // For now, we simulate detecting a change (this would normally be conditional)
    // await Notifications.scheduleNotificationAsync({
    //   content: {
    //     title: "StudyOS Update",
    //     body: "Check your College Portal, new marks or attendance may have been uploaded!",
    //   },
    //   trigger: null, // Send immediately
    // });

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error("Background sync failed:", error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// 2. Register the task
async function registerBackgroundSync() {
  try {
    await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: 15 * 60, // 15 minutes
      stopOnTerminate: false, // android only,
      startOnBoot: true, // android only
    });
  } catch (err) {
    console.log("Task Register failed:", err);
  }
}

export function useBackgroundSync() {
  const { isConnected } = useStudySessionStore();

  useEffect(() => {
    if (isConnected) {
      registerBackgroundSync();
    } else {
      BackgroundFetch.unregisterTaskAsync(BACKGROUND_SYNC_TASK).catch(() => {});
    }
  }, [isConnected]);

  // Foreground Polling Mechanism
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    if (isConnected) {
      // Poll every 15 minutes while app is open
      interval = setInterval(() => {
        if (AppState.currentState === 'active') {
          console.log("[Foreground] Checking for LMS updates...");
          // Here we would silently fetch data and trigger a UI popup or silent update if data changed.
        }
      }, 15 * 60 * 1000); // 15 minutes
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isConnected]);
}
