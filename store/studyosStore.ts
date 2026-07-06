import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface StudyOSState {
  streak: number;
  xp: number;
  lastActivityDate: string | null;
  
  addXP: (amount: number) => void;
  recordActivity: () => Promise<void>;
  loadGamification: () => Promise<void>;
}

export const useStudyOSStore = create<StudyOSState>((set, get) => ({
  streak: 0,
  xp: 0,
  lastActivityDate: null,

  loadGamification: async () => {
    try {
      const storedStreak = await AsyncStorage.getItem('studyos_streak');
      const storedXP = await AsyncStorage.getItem('studyos_xp');
      const storedLastDate = await AsyncStorage.getItem('studyos_last_activity');

      set({
        streak: storedStreak ? parseInt(storedStreak, 10) : 0,
        xp: storedXP ? parseInt(storedXP, 10) : 0,
        lastActivityDate: storedLastDate,
      });
    } catch (e) {
      console.error('Failed to load gamification data', e);
    }
  },

  addXP: async (amount: number) => {
    const newXP = get().xp + amount;
    set({ xp: newXP });
    await AsyncStorage.setItem('studyos_xp', newXP.toString());
  },

  recordActivity: async () => {
    const today = new Date().toISOString().split('T')[0];
    const { lastActivityDate, streak } = get();

    if (lastActivityDate === today) {
      // Already recorded today
      return;
    }

    let newStreak = streak;
    
    if (lastActivityDate) {
      const lastDate = new Date(lastActivityDate);
      const currentDate = new Date(today);
      const diffTime = Math.abs(currentDate.getTime() - lastDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
      
      if (diffDays === 1) {
        newStreak += 1;
      } else {
        newStreak = 1; // reset streak if they missed a day
      }
    } else {
      newStreak = 1;
    }

    set({ streak: newStreak, lastActivityDate: today });
    
    // Save to persistence
    await AsyncStorage.setItem('studyos_streak', newStreak.toString());
    await AsyncStorage.setItem('studyos_last_activity', today);
  }
}));
