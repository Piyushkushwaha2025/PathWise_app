import { create } from 'zustand';

interface UserState {
  // Local XP delta (earned in this session, before re-fetch)
  sessionXp: number;
  // Enrolled roadmap IDs cached locally
  enrolledRoadmapIds: string[];

  addSessionXp: (amount: number) => void;
  resetSessionXp: () => void;
  setEnrolledRoadmapIds: (ids: string[]) => void;
}

export const useUserStore = create<UserState>((set) => ({
  sessionXp: 0,
  enrolledRoadmapIds: [],

  addSessionXp: (amount) =>
    set((state) => ({ sessionXp: state.sessionXp + amount })),

  resetSessionXp: () => set({ sessionXp: 0 }),

  setEnrolledRoadmapIds: (ids) => set({ enrolledRoadmapIds: ids }),
}));
