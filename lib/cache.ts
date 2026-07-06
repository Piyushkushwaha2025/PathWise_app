import AsyncStorage from '@react-native-async-storage/async-storage';

interface CacheWrapper<T> {
  data: T;
  timestamp: number;
}

export async function getCachedData<T>(key: string, expiryHours: number): Promise<T | null> {
  try {
    const rawData = await AsyncStorage.getItem(key);
    if (!rawData) return null;

    const cache: CacheWrapper<T> = JSON.parse(rawData);
    const now = Date.now();
    const expiryMs = expiryHours * 60 * 60 * 1000;

    if (now - cache.timestamp > expiryMs) {
      // Expired
      return null;
    }

    return cache.data;
  } catch (error) {
    console.error(`Error reading cache for ${key}:`, error);
    return null;
  }
}

export async function setCachedData<T>(key: string, data: T): Promise<void> {
  try {
    const cache: CacheWrapper<T> = {
      data,
      timestamp: Date.now(),
    };
    await AsyncStorage.setItem(key, JSON.stringify(cache));
  } catch (error) {
    console.error(`Error setting cache for ${key}:`, error);
  }
}

export async function clearCache(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.error(`Error clearing cache for ${key}:`, error);
  }
}
