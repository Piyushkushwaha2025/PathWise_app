import AsyncStorage from '@react-native-async-storage/async-storage';

export class SessionExpiredError extends Error {
  constructor(message: string = 'Session expired') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

export class NetworkError extends Error {
  constructor(message: string = 'Network error') {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * Cache utility for storing and retrieving API responses.
 */
export const CacheService = {
  async set(key: string, data: any) {
    try {
      await AsyncStorage.setItem(`cache_${key}`, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save to cache', e);
    }
  },

  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await AsyncStorage.getItem(`cache_${key}`);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.warn('Failed to read from cache', e);
      return null;
    }
  },
  
  async clear() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(k => k.startsWith('cache_'));
      await AsyncStorage.multiRemove(cacheKeys);
    } catch (e) {
      console.warn('Failed to clear cache', e);
    }
  }
};
