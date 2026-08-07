import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { useStudyOSStore } from './studyosStore';

interface StudySessionState {
  isConnected: boolean;
  isStudyOSMode: boolean;
  isSwitchingMode: boolean;
  universityId: string | null;
  lmsSesskey: string | null;
  lmsUserId: number | null;
  
  checkConnection: () => Promise<void>;
  clearSession: () => Promise<void>;
  setSession: (universityId: string, sesskey: string, userId: number) => Promise<void>;
  setStudyOSMode: (mode: boolean) => void;
  setSwitchingMode: (switching: boolean) => void;
}

export const useStudySessionStore = create<StudySessionState>((set) => ({
  isConnected: false,
  isStudyOSMode: false,
  isSwitchingMode: false,
  universityId: null,
  lmsSesskey: null,
  lmsUserId: null,

  checkConnection: async () => {
    try {
      const uniId = await SecureStore.getItemAsync('study_university_id');
      const sesskey = await SecureStore.getItemAsync('lms_sesskey');
      const userIdStr = await SecureStore.getItemAsync('lms_userid');
      
      if (uniId) {
        set({ 
          isConnected: true,
          isStudyOSMode: true,
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
    set({ isConnected: true, isStudyOSMode: true, universityId, lmsSesskey: sesskey, lmsUserId: userId });
  },

  clearSession: async () => {
    try {
      await SecureStore.deleteItemAsync('study_university_id');
      await SecureStore.deleteItemAsync('portal_session');
      await SecureStore.deleteItemAsync('lms_cookie');
      await SecureStore.deleteItemAsync('lms_sesskey');
      await SecureStore.deleteItemAsync('lms_userid');
      await SecureStore.deleteItemAsync('culko_u');
      await SecureStore.deleteItemAsync('culko_p');
      await SecureStore.deleteItemAsync('culko_cookies');
      await useStudyOSStore.getState().resetScrapedData();
      set({ isConnected: false, isStudyOSMode: false, universityId: null, lmsSesskey: null, lmsUserId: null });
    } catch (error) {
      console.error('Error clearing session:', error);
    }
  },
  
  setStudyOSMode: (mode: boolean) => {
    set({ isSwitchingMode: true });
    // Switch the actual mode immediately
    set({ isStudyOSMode: mode });
    // Turn off the loading screen after a short delay (e.g. 1500ms) to allow chunks to load
    setTimeout(() => {
      set({ isSwitchingMode: false });
    }, 1500);
  },
  
  setSwitchingMode: (switching: boolean) => set({ isSwitchingMode: switching })
}));
