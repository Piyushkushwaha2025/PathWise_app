import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

interface StudySessionState {
  isConnected: boolean;
  isStudyOSMode: boolean;
  universityId: string | null;
  lmsSesskey: string | null;
  lmsUserId: number | null;
  
  checkConnection: () => Promise<void>;
  clearSession: () => Promise<void>;
  setSession: (universityId: string, sesskey: string, userId: number) => Promise<void>;
  setStudyOSMode: (mode: boolean) => void;
}

export const useStudySessionStore = create<StudySessionState>((set) => ({
  isConnected: false,
  isStudyOSMode: false,
  universityId: null,
  lmsSesskey: null,
  lmsUserId: null,

  checkConnection: async () => {
    try {
      const uniId = await SecureStore.getItemAsync('study_university_id');
      const sesskey = await SecureStore.getItemAsync('lms_sesskey');
      const userIdStr = await SecureStore.getItemAsync('lms_userid');
      
      if (uniId && sesskey && userIdStr) {
        set({ 
          isConnected: true,
          isStudyOSMode: true, // Default to true on boot if connected
          universityId: uniId,
          lmsSesskey: sesskey, 
          lmsUserId: parseInt(userIdStr, 10) 
        });
      } else {
        set({ isConnected: false, isStudyOSMode: false, universityId: null, lmsSesskey: null, lmsUserId: null });
      }
    } catch (error) {
      console.error('Error checking connection:', error);
      set({ isConnected: false, isStudyOSMode: false, universityId: null, lmsSesskey: null, lmsUserId: null });
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
      set({ isConnected: false, isStudyOSMode: false, universityId: null, lmsSesskey: null, lmsUserId: null });
    } catch (error) {
      console.error('Error clearing session:', error);
    }
  },
  
  setStudyOSMode: (mode: boolean) => set({ isStudyOSMode: mode })
}));
