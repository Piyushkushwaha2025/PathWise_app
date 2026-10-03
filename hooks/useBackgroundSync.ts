import { useEffect, useRef } from 'react';
import { useStudySessionStore } from '../store/studySessionStore';
import { AppState, AppStateStatus } from 'react-native';
import { registerBackgroundSync, unregisterBackgroundSync, runBackgroundSyncCheck } from '../tasks/backgroundSync';

export function useBackgroundSync() {
  const isConnected = useStudySessionStore((s) => s.isConnected);
  const isSyncingRef = useRef(false);

  const triggerSync = async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    try {
      await runBackgroundSyncCheck();
    } catch (e) {
      console.warn('[ForegroundSync] Sync error:', e);
    } finally {
      isSyncingRef.current = false;
    }
  };

  useEffect(() => {
    if (isConnected) {
      registerBackgroundSync();
      // Run immediate check when connected or app initializes
      triggerSync();
    } else {
      unregisterBackgroundSync();
    }
  }, [isConnected]);

  // Foreground Polling & AppState Listener
  useEffect(() => {
    if (!isConnected) return;

    // 1. Check whenever the app returns to foreground
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        console.log('[ForegroundSync] App became active, checking for updates...');
        triggerSync();
      }
    });

    // 2. Poll periodically while app is open (every 3 minutes)
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') {
        console.log('[ForegroundSync] Periodic foreground check...');
        triggerSync();
      }
    }, 3 * 60 * 1000); // 3 minutes

    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [isConnected]);
}
