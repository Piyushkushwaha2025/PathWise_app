import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Roadmap {
  id: string;
  subjectName: string;
  requirements: string[];
  generatedContent: string;
  createdAt: string;
}

interface CulkoProfile {
  name: string;
  uid: string;
  course: string;
  cgpa: string;
  semester?: string;
}

interface CulkoSubject {
  code: string;
  name: string;
  credits: string;
  totalClasses: number;
  attendedClasses: number;
  attendancePercentage: number;
  viewActionTarget?: string;
}

interface CulkoClassSlot {
  subjectName: string;
  teacher: string;
  time: string;
  room: string;
  group: string;
}

interface CulkoMarks {
  subjectName: string;
  practicalMarks: string;
  mstMarks: string;
}

interface StudyOSState {
  streak: number;
  xp: number;
  lastActivityDate: string | null;
  roadmaps: Roadmap[];
  
  // Culko Scraped Data
  profile: CulkoProfile | null;
  subjects: CulkoSubject[];
  timetable: Record<string, CulkoClassSlot[]>;
  marks: CulkoMarks[];
  isScrapedDataLoaded: boolean;
  
  // Results Cache
  semesterOptionsCache: { text: string, value: string }[];
  resultCache: Record<string, { sgpa: string, subjects: any[] }>;
  
  // Detailed Attendance Cache
  detailedAttendanceCache: Record<string, any[]>;
  
  addXP: (amount: number) => void;
  recordActivity: () => Promise<void>;
  loadGamification: () => Promise<void>;
  addRoadmap: (roadmap: Omit<Roadmap, 'id' | 'createdAt'>) => Promise<void>;
  setScrapedData: (data: Partial<StudyOSState>) => Promise<void>;
}

export const useStudyOSStore = create<StudyOSState>((set, get) => ({
  streak: 0,
  xp: 0,
  lastActivityDate: null,
  roadmaps: [],
  profile: null,
  subjects: [],
  timetable: {},
  marks: [],
  isScrapedDataLoaded: false,
  semesterOptionsCache: [],
  resultCache: {},
  detailedAttendanceCache: {},

  loadGamification: async () => {
    try {
      const storedStreak = await AsyncStorage.getItem('studyos_streak');
      const storedXP = await AsyncStorage.getItem('studyos_xp');
      const storedLastDate = await AsyncStorage.getItem('studyos_last_activity');
      const storedRoadmaps = await AsyncStorage.getItem('studyos_roadmaps');
      const storedScraped = await AsyncStorage.getItem('studyos_scraped_data');

      set({
        streak: storedStreak ? parseInt(storedStreak, 10) : 0,
        xp: storedXP ? parseInt(storedXP, 10) : 0,
        lastActivityDate: storedLastDate,
        roadmaps: storedRoadmaps ? JSON.parse(storedRoadmaps) : [],
        ...(storedScraped ? JSON.parse(storedScraped) : {})
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
  },

  addRoadmap: async (newRoadmapData) => {
    const newRoadmap: Roadmap = {
      ...newRoadmapData,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
    };
    
    const updatedRoadmaps = [newRoadmap, ...get().roadmaps];
    set({ roadmaps: updatedRoadmaps });
    await AsyncStorage.setItem('studyos_roadmaps', JSON.stringify(updatedRoadmaps));
  },

  setScrapedData: async (data) => {
    set((state) => ({ ...state, ...data, isScrapedDataLoaded: true }));
    
    // Save to persistence
    const stateToSave = {
      profile: data.profile || get().profile,
      subjects: data.subjects || get().subjects,
      timetable: data.timetable || get().timetable,
      marks: data.marks || get().marks,
      semesterOptionsCache: data.semesterOptionsCache || get().semesterOptionsCache,
      resultCache: data.resultCache || get().resultCache,
      isScrapedDataLoaded: true
    };
    await AsyncStorage.setItem('studyos_scraped_data', JSON.stringify(stateToSave));
  }
}));
