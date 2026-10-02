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
  overallAttendance?: number;
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
  loadGamification: (force?: boolean) => Promise<void>;
  saveGamification: () => Promise<void>;
  addRoadmap: (roadmap: Omit<Roadmap, 'id' | 'createdAt'>) => Promise<void>;
  removeRoadmap: (id: string) => Promise<void>;
  setScrapedData: (data: Partial<StudyOSState>) => Promise<void>;
  resetScrapedData: () => Promise<void>;
}

let isLoadingGamification = false;

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

  loadGamification: async (force = false) => {
    if (get().isHydrated && !force) return;
    if (isLoadingGamification && !force) return;
    isLoadingGamification = true;
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

      let parsedScraped: any = storedScraped ? JSON.parse(storedScraped) : {};

      // Auto-heal corrupted credits caused by previous serial-number row index scraper bug
      if (parsedScraped.subjects && Array.isArray(parsedScraped.subjects)) {
        const verifiedCreditsMap: Record<string, string> = {};
        if (parsedScraped.resultCache) {
          for (const semObj of Object.values(parsedScraped.resultCache) as any[]) {
            if (semObj?.subjects && Array.isArray(semObj.subjects)) {
              for (const rSub of semObj.subjects) {
                if (rSub?.code && rSub?.credit && parseFloat(rSub.credit) > 0) {
                  verifiedCreditsMap[rSub.code.trim().toUpperCase()] = String(parseFloat(rSub.credit));
                }
              }
            }
          }
        }

        const isSequentialIndexBug = parsedScraped.subjects.length >= 3 &&
          parsedScraped.subjects.slice(0, 3).every((s: any, idx: number) => s.credits === String(idx + 1));

        parsedScraped.subjects = parsedScraped.subjects.map((sub: any, idx: number) => {
          const normCode = (sub.code || '').trim().toUpperCase();
          if (verifiedCreditsMap[normCode]) {
            return { ...sub, credits: verifiedCreditsMap[normCode] };
          }
          if (isSequentialIndexBug || sub.credits === String(idx + 1)) {
            const lowName = (sub.name || '').toLowerCase();
            const upCode = (sub.code || '').toUpperCase();
            if (lowName.includes('lab') || lowName.includes('practical') || upCode.includes('CSP') || upCode.includes('LAP')) {
              return { ...sub, credits: '1.0' };
            }
            return { ...sub, credits: '' };
          }
          return sub;
        });

        // Auto-heal missing or corrupted subject names (e.g. "1", blank, or equal to code)
        const titleHealingMap: Record<string, string> = {};
        if (parsedScraped.marks && Array.isArray(parsedScraped.marks)) {
          for (const m of parsedScraped.marks) {
            const mCode = (m.code || (m.fullName ? m.fullName.match(/\(([0-9A-Z]{2,8}[-_]?[0-9]{3})\)/i)?.[1] : '') || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
            const mName = (m.subjectName || m.fullName || '').trim();
            if (mCode && mName && !/^\d+$/.test(mName) && mName.length > 2) {
              titleHealingMap[mCode] = mName;
            }
          }
        }
        if (parsedScraped.resultCache) {
          for (const semObj of Object.values(parsedScraped.resultCache) as any[]) {
            if (semObj?.subjects && Array.isArray(semObj.subjects)) {
              for (const rSub of semObj.subjects) {
                const rCode = (rSub.code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                const rName = (rSub.name || rSub.title || '').trim();
                if (rCode && rName && !/^\d+$/.test(rName) && rName.length > 2) {
                  titleHealingMap[rCode] = rName;
                }
              }
            }
          }
        }
        if (parsedScraped.timetable) {
          for (const daySlots of Object.values(parsedScraped.timetable) as any[]) {
            if (Array.isArray(daySlots)) {
              for (const slot of daySlots) {
                if (slot?.subjectName) {
                  const parts = slot.subjectName.split(' ');
                  const possibleCode = (parts[0] || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                  if (/^[0-9A-Z]{2,8}[-_]?[0-9]{3}/i.test(parts[0])) {
                    const restName = parts.slice(1).join(' ').trim();
                    if (restName && !/^\d+$/.test(restName) && restName.length > 2) {
                      titleHealingMap[possibleCode] = restName;
                    }
                  }
                }
              }
            }
          }
        }

        parsedScraped.subjects = parsedScraped.subjects.map((sub: any) => {
          const normCode = (sub.code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
          const curName = (sub.name || '').trim();
          const isBadName = !curName || /^\d+$/.test(curName) || curName === sub.code || curName === '1';
          if (isBadName && titleHealingMap[normCode]) {
            return { ...sub, name: titleHealingMap[normCode] };
          }
          if (isBadName && sub.code) {
            return { ...sub, name: sub.code };
          }
          return sub;
        });
      }

      set({
        streak: storedStreak ? parseInt(storedStreak, 10) : 0,
        xp: storedXP ? parseInt(storedXP, 10) : 0,
        lastActivityDate: storedLastDate,
        roadmaps: storedRoadmaps ? JSON.parse(storedRoadmaps) : [],
        showHistoryDates: storedShowDates === 'true',
        roundAttendancePercentage: storedRoundPercentage !== 'false', // default true if null
        ...parsedScraped,
        isHydrated: true
      });
    } catch (e) {
      console.error('Failed to load gamification data', e);
      set({ isHydrated: true });
    } finally {
      isLoadingGamification = false;
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
    set((state) => {
      const mergedProfile = (data.profile && data.profile.name && data.profile.name !== 'Error' && data.profile.name !== 'Unknown')
        ? { ...(state.profile || {}), ...data.profile }
        : (state.profile || data.profile);

      let mergedSubjects = (data.subjects && Array.isArray(data.subjects) && data.subjects.length > 0)
        ? data.subjects
        : state.subjects;

      if (mergedSubjects && Array.isArray(mergedSubjects)) {
        mergedSubjects = mergedSubjects.map((sub: any) => {
          if (!sub.name || /^\d+$/.test(sub.name) || sub.name === '1') {
            return { ...sub, name: sub.code || 'Subject' };
          }
          return sub;
        });
      }

      const mergedTimetable = (data.timetable && Object.keys(data.timetable).length > 0)
        ? data.timetable
        : state.timetable;

      const mergedMarks = (data.marks && Array.isArray(data.marks) && data.marks.length > 0)
        ? data.marks
        : state.marks;

      return {
        ...state,
        ...data,
        profile: mergedProfile,
        subjects: mergedSubjects,
        timetable: mergedTimetable,
        marks: mergedMarks,
        isScrapedDataLoaded: true
      };
    });
    
    // Save to persistence
    const current = get();
    const stateToSave = {
      profile: current.profile,
      subjects: current.subjects,
      timetable: current.timetable,
      marks: current.marks,
      datesheet: current.datesheet,
      semesterOptionsCache: current.semesterOptionsCache,
      resultCache: current.resultCache,
      detailedAttendanceCache: current.detailedAttendanceCache,
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
