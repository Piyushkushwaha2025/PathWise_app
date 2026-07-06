import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

interface CuSessionState {
  isConnected: boolean;
  lmsSesskey: string | null;
  lmsUserId: number | null;
  
  checkConnection: () => Promise<void>;
  clearSession: () => Promise<void>;
  setSession: (sesskey: string, userId: number) => Promise<void>;
}

export const useCuSessionStore = create<CuSessionState>((set) => ({
  isConnected: false,
  lmsSesskey: null,
  lmsUserId: null,

  checkConnection: async () => {
    try {
      const sesskey = await SecureStore.getItemAsync('lms_sesskey');
      const userIdStr = await SecureStore.getItemAsync('lms_userid');
      
      if (sesskey && userIdStr) {
        set({ 
          isConnected: true, 
          lmsSesskey: sesskey, 
          lmsUserId: parseInt(userIdStr, 10) 
        });
      } else {
        set({ isConnected: false, lmsSesskey: null, lmsUserId: null });
      }
    } catch (error) {
      console.error('Error checking CU connection:', error);
      set({ isConnected: false, lmsSesskey: null, lmsUserId: null });
    }
  },

  setSession: async (sesskey: string, userId: number) => {
    set({ isConnected: true, lmsSesskey: sesskey, lmsUserId: userId });
  },

  clearSession: async () => {
    try {
      await SecureStore.deleteItemAsync('portal_session');
      await SecureStore.deleteItemAsync('lms_cookie');
      await SecureStore.deleteItemAsync('lms_sesskey');
      await SecureStore.deleteItemAsync('lms_userid');
      set({ isConnected: false, lmsSesskey: null, lmsUserId: null });
    } catch (error) {
      console.error('Error clearing session:', error);
    }
  }
}));
