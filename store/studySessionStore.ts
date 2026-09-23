import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStudyOSStore } from './studyosStore';

interface StudySessionState {
  isConnected: boolean;
  isStudyOSMode: boolean;
  isSwitchingMode: boolean;
  universityId: string | null;
  lmsSesskey: string | null;
  lmsUserId: number | null;
  
  checkConnection: () => Promise<void>;
  clearSession: (keepCreds?: boolean) => Promise<void>;
  setSession: (universityId: string, sesskey: string, userId: number) => Promise<void>;
  setStudyOSMode: (mode: boolean) => void;
  setSwitchingMode: (switching: boolean) => void;
  isSessionExpired: boolean;
  isSessionDisconnected: boolean;
  customError: string | null;
  setSessionDisconnected: (disconnected: boolean) => void;
  setSessionExpired: (expired: boolean) => void;
  setCustomError: (msg: string | null) => void;
}

export const useStudySessionStore = create<StudySessionState>((set) => ({
  isConnected: false,
  isStudyOSMode: false,
  isSwitchingMode: false,
  isSessionExpired: false,
  isSessionDisconnected: false,
  customError: null,
  universityId: null,
  lmsSesskey: null,
  lmsUserId: null,

  checkConnection: async () => {
    try {
      const uniId = await SecureStore.getItemAsync('study_university_id');
      const sesskey = await SecureStore.getItemAsync('lms_sesskey');
      const userIdStr = await SecureStore.getItemAsync('lms_userid');
      const savedMode = await AsyncStorage.getItem('studyos_active_mode');
      
      if (uniId) {
        set({ 
          isConnected: true,
          isStudyOSMode: savedMode !== null ? savedMode === 'true' : true,
          universityId: uniId,
          lmsSesskey: sesskey, 
          lmsUserId: userIdStr ? parseInt(userIdStr, 10) : null
        });
      }
    } catch (error) {
      console.error('Error reading session:', error);
    }
  },

  setSession: async (universityId: string, sesskey: string, userId: number) => {
    await SecureStore.setItemAsync('study_university_id', universityId);
    await SecureStore.setItemAsync('lms_sesskey', sesskey);
    await SecureStore.setItemAsync('lms_userid', userId.toString());
    await AsyncStorage.setItem('auth_was_signed_in', 'true').catch(() => {});
    await AsyncStorage.setItem('studyos_active_mode', 'true').catch(() => {});
    set({ isConnected: true, isStudyOSMode: true, universityId, lmsSesskey: sesskey, lmsUserId: userId, isSessionDisconnected: false });
  },

  clearSession: async (keepCreds: boolean = false) => {
    try {
      await SecureStore.deleteItemAsync('study_university_id');
      await SecureStore.deleteItemAsync('portal_session');
      await SecureStore.deleteItemAsync('lms_cookie');
      await SecureStore.deleteItemAsync('lms_sesskey');
      await SecureStore.deleteItemAsync('lms_userid');
      await AsyncStorage.removeItem('studyos_active_mode').catch(() => {});
      
      if (!keepCreds) {
        await SecureStore.deleteItemAsync('culko_u');
        await SecureStore.deleteItemAsync('culko_p');
      }
      
      await SecureStore.deleteItemAsync('culko_cookies');
      await useStudyOSStore.getState().resetScrapedData();
      set({ isConnected: false, isStudyOSMode: false, universityId: null, lmsSesskey: null, lmsUserId: null, isSessionDisconnected: false });
    } catch (error) {
      console.error('Error clearing session:', error);
    }
  },
  
  setStudyOSMode: (mode: boolean) => {
    set({ isSwitchingMode: true, isStudyOSMode: mode });
    AsyncStorage.setItem('studyos_active_mode', mode ? 'true' : 'false').catch(() => {});
    // Keep loading screen active long enough for the new dashboard to mount and render cleanly
    setTimeout(() => {
      set({ isSwitchingMode: false });
    }, 900);
  },
  
  setSwitchingMode: (switching: boolean) => set({ isSwitchingMode: switching }),
  setSessionExpired: (expired: boolean) => set({ isSessionExpired: expired, isSessionDisconnected: expired ? true : useStudySessionStore.getState().isSessionDisconnected }),
  setSessionDisconnected: (disconnected: boolean) => set({ isSessionDisconnected: disconnected }),
  setCustomError: (msg: string | null) => set({ customError: msg }),
}));
