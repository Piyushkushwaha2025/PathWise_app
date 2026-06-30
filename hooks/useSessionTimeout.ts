// @ts-nocheck
import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";

const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const CHECK_INTERVAL = 60 * 1000; // Check every minute

/**
 * Hook to monitor session activity and force logout on timeout
 */
export function useSessionTimeout() {
  const { signOut, isSignedIn } = useAuth();
  const router = useRouter();
  const lastActivityRef = useRef<number>(Date.now());
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isSignedIn) return;

    // Update last activity on any interaction
    const updateActivity = () => {
      lastActivityRef.current = Date.now();
    };

    // Check session timeout
    const checkTimeout = () => {
      const now = Date.now();
      const timeSinceActivity = now - lastActivityRef.current;

      if (timeSinceActivity > SESSION_TIMEOUT) {
        signOut();
        router.replace("/(auth)/sign-in");
      }
    };

    // Set up activity listeners
    const activityEvents = ['touchstart', 'touchmove', 'scroll'];
    activityEvents.forEach(event => {
      document?.addEventListener?.(event, updateActivity);
    });

    // Set up timeout checker
    checkIntervalRef.current = setInterval(checkTimeout, CHECK_INTERVAL);

    return () => {
      activityEvents.forEach(event => {
        document?.removeEventListener?.(event, updateActivity);
      });
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [isSignedIn, signOut, router]);
}
