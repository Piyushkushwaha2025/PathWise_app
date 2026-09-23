import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TokenCache } from "@clerk/clerk-expo";

/**
 * Clerk token cache using expo-secure-store.
 * This allows Clerk to persist auth tokens across app restarts.
 */
export const tokenCache: TokenCache = {
  async getToken(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async saveToken(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
      await AsyncStorage.setItem("auth_was_signed_in", "true");
    } catch (e) {
      console.warn("Failed to persist auth token:", e);
    }
  },
  async clearToken(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
      await AsyncStorage.setItem("auth_was_signed_in", "false");
    } catch (e) {
      console.warn("Failed to clear auth token:", e);
    }
  },
};

