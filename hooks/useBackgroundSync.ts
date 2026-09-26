import { useEffect } from 'react';
import { useStudySessionStore } from '../store/studySessionStore';
import { AppState } from 'react-native';
import { registerBackgroundSync, unregisterBackgroundSync } from '../tasks/backgroundSync';

export function useBackgroundSync() {
  const isConnected = useStudySessionStore((s) => s.isConnected);

  useEffect(() => {
    if (isConnected) {
      registerBackgroundSync();
    } else {
      unregisterBackgroundSync();
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
