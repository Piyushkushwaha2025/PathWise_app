import { create } from "zustand";
import Constants from "expo-constants";

interface UpdateState {
  updateAvailable: boolean;
  updateModalVisible: boolean;
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
  releaseNotes: string;
  isChecking: boolean;
  lastChecked: number | null;

  setUpdateModalVisible: (visible: boolean) => void;
  checkForUpdates: (manual?: boolean) => Promise<boolean>;
}

const CURRENT_VERSION = Constants.expoConfig?.version || "1.0.0";

export const useUpdateStore = create<UpdateState>((set) => ({
  updateAvailable: false,
  updateModalVisible: false,
  currentVersion: CURRENT_VERSION,
  latestVersion: CURRENT_VERSION,
  downloadUrl: "",
  releaseNotes: "",
  isChecking: false,
  lastChecked: null,

  setUpdateModalVisible: (visible) => set({ updateModalVisible: visible }),

  // Play Store builds manage updates through Google Play Store directly.
  checkForUpdates: async () => {
    return false;
  },
}));
