import { useCallback } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

/**
 * Intercepts Android hardware back button presses and screen swipe gestures
 * to navigate to a specific target route instead of letting Expo Router Tab layout
 * fall back to the initial root HOME tab.
 */
export function useHardwareBack(targetRoute: string) {
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        router.push(targetRoute as any);
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [router, targetRoute])
  );
}
