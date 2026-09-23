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
  section?: string;
  photoUrl?: string;
}

export interface CulkoSubject {
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

export interface CulkoMarksExam {
  name: string;
  max: string;
  obtained: string;
}

export interface CulkoMarks {
  subjectName: string;
  code?: string;
  fullName?: string;
  practicalMarks: string;
  mstMarks: string;
  exams?: CulkoMarksExam[];
  totalObtained?: number;
  totalMax?: number;
}

interface LmsCourse {
  fullname: string;
  shortname: string;
  id?: string;
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
  datesheet: any[];
  isScrapedDataLoaded: boolean;
  isHydrated: boolean;
  
  // LMS Courses (shared between Subjects tab and Grade Center)
  lmsCourses: LmsCourse[];
  setLmsCourses: (courses: LmsCourse[]) => void;

  // Results Cache
  semesterOptionsCache: { text: string, value: string }[];
  resultCache: Record<string, { sgpa: string, subjects: any[] }>;
  
  // Detailed Attendance Cache
  detailedAttendanceCache: Record<string, any[]>;
  
  // Settings
  showHistoryDates: boolean;
  setShowHistoryDates: (show: boolean) => Promise<void>;
  roundAttendancePercentage: boolean;
  setRoundAttendancePercentage: (round: boolean) => Promise<void>;
  
  addXP: (amount: number) => Promise<void>;
  recordActivity: () => Promise<void>;
  loadGamification: () => Promise<void>;
  saveGamification: () => Promise<void>;
  addRoadmap: (roadmap: Omit<Roadmap, 'id' | 'createdAt'>) => Promise<void>;
  removeRoadmap: (id: string) => Promise<void>;
  setScrapedData: (data: Partial<StudyOSState>) => Promise<void>;
  resetScrapedData: () => Promise<void>;
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
  datesheet: [],
  isScrapedDataLoaded: false,
  isHydrated: false,
  lmsCourses: [],
  
  semesterOptionsCache: [],
  resultCache: {},
  detailedAttendanceCache: {},
  showHistoryDates: false,
  roundAttendancePercentage: true, // Default to true (whole numbers)

  setLmsCourses: (courses) => set({ lmsCourses: courses }),

  setShowHistoryDates: async (show) => {
    set({ showHistoryDates: show });
    await AsyncStorage.setItem('studyos_settings_history_dates', JSON.stringify(show));
  },

  setRoundAttendancePercentage: async (round) => {
    set({ roundAttendancePercentage: round });
    await AsyncStorage.setItem('studyos_settings_round_percentage', JSON.stringify(round));
  },

  loadGamification: async () => {
    try {
      const pairs = await AsyncStorage.multiGet([
        'studyos_streak',
        'studyos_xp',
        'studyos_last_activity',
        'studyos_roadmaps',
        'studyos_scraped_data',
        'studyos_settings_history_dates',
        'studyos_settings_round_percentage'
      ]);

      const map: Record<string, string | null> = {};
      for (const [key, val] of pairs) {
        map[key] = val;
      }

      const storedStreak = map['studyos_streak'];
      const storedXP = map['studyos_xp'];
      const storedLastDate = map['studyos_last_activity'];
      const storedRoadmaps = map['studyos_roadmaps'];
      const storedScraped = map['studyos_scraped_data'];
      const storedShowDates = map['studyos_settings_history_dates'];
      const storedRoundPercentage = map['studyos_settings_round_percentage'];

      set({
        streak: storedStreak ? parseInt(storedStreak, 10) : 0,
        xp: storedXP ? parseInt(storedXP, 10) : 0,
        lastActivityDate: storedLastDate,
        roadmaps: storedRoadmaps ? JSON.parse(storedRoadmaps) : [],
        showHistoryDates: storedShowDates === 'true',
        roundAttendancePercentage: storedRoundPercentage !== 'false', // default true if null
        ...(storedScraped ? JSON.parse(storedScraped) : {}),
        isHydrated: true
      });
    } catch (e) {
      console.error('Failed to load gamification data', e);
      set({ isHydrated: true });
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
        newStreak = 1;
      }
    } else {
      newStreak = 1;
    }

    set({ streak: newStreak, lastActivityDate: today });
    await AsyncStorage.setItem('studyos_streak', newStreak.toString());
    await AsyncStorage.setItem('studyos_last_activity', today);
  },

  saveGamification: async () => {
    const state = get();
    await AsyncStorage.setItem('studyos_gamification', JSON.stringify({ streak: state.streak, xp: state.xp }));
  },

  addRoadmap: async (newRoadmapData) => {
    const newRoadmap: Roadmap = {
      ...newRoadmapData,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
    };
    set((state) => ({ roadmaps: [...state.roadmaps, newRoadmap] }));
    const updatedRoadmaps = get().roadmaps;
    await AsyncStorage.setItem('studyos_roadmaps', JSON.stringify(updatedRoadmaps));
  },

  removeRoadmap: async (id: string) => {
    set((state) => ({ roadmaps: state.roadmaps.filter(r => r.id !== id) }));
    await AsyncStorage.setItem('studyos_roadmaps', JSON.stringify(get().roadmaps));
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
      detailedAttendanceCache: data.detailedAttendanceCache || get().detailedAttendanceCache,
      isScrapedDataLoaded: true
    };
    await AsyncStorage.setItem('studyos_scraped_data', JSON.stringify(stateToSave));
  },

  resetScrapedData: async () => {
    set({
      profile: null,
      subjects: [],
      timetable: {},
      marks: [],
      semesterOptionsCache: [],
      resultCache: {},
      detailedAttendanceCache: {},
      isScrapedDataLoaded: false,
    });
    await AsyncStorage.removeItem('studyos_scraped_data');
  }
}));
