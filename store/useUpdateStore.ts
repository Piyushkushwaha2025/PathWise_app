import { create } from "zustand";

interface UpdateState {
  updateAvailable: boolean;
  updateModalVisible: boolean;
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
  setUpdateModalVisible: (visible: boolean) => void;
  checkForUpdates: (manual?: boolean) => Promise<boolean>;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  updateAvailable: false,
  updateModalVisible: false,
  currentVersion: "1.0.0",
  latestVersion: "1.0.0",
  downloadUrl: "https://pathwise-ai.com/downloads/pathwise-latest.apk",
  
  setUpdateModalVisible: (visible) => set({ updateModalVisible: visible }),
  
  checkForUpdates: async (manual = false) => {
    // Mocking a network request to check for latest version
    return new Promise((resolve) => {
      setTimeout(() => {
        const { currentVersion, latestVersion } = get();
        if (currentVersion !== latestVersion) {
          set({ updateAvailable: true, updateModalVisible: true });
          resolve(true);
        } else {
          set({ updateAvailable: false, updateModalVisible: false });
          resolve(false);
        }
      }, 1000);
    });
  },
}));
