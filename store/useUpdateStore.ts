import { create } from "zustand";

const APP_VERSION_URL =
  "https://raw.githubusercontent.com/Piyushkushwaha2025/PathWise_app/main/app-version.json";

interface UpdateState {
  // APK update (GitHub Releases)
  updateAvailable: boolean;
  updateModalVisible: boolean;
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
  releaseNotes: string;
  isChecking: boolean;
  lastChecked: number | null;   // timestamp — prevent duplicate checks

  setUpdateModalVisible: (visible: boolean) => void;
  checkForUpdates: (manual?: boolean) => Promise<boolean>;
}

import Constants from "expo-constants";

const CURRENT_VERSION = Constants.expoConfig?.version || "1.0.0";
// Minimum time between auto-checks (15 minutes) to prevent collision
const AUTO_CHECK_COOLDOWN_MS = 15 * 60 * 1000;

export const useUpdateStore = create<UpdateState>((set, get) => ({
  updateAvailable: false,
  updateModalVisible: false,
  currentVersion: CURRENT_VERSION,
  latestVersion: CURRENT_VERSION,
  downloadUrl: "",
  releaseNotes: "",
  isChecking: false,
  lastChecked: null,

  setUpdateModalVisible: (visible) => set({ updateModalVisible: visible }),

  checkForUpdates: async (manual = false) => {
    const { isChecking, lastChecked } = get();

    // Prevent collision: skip if already running
    if (isChecking) return false;

    // Prevent collision: skip auto-checks if checked recently
    if (!manual && lastChecked) {
      const timeSince = Date.now() - lastChecked;
      if (timeSince < AUTO_CHECK_COOLDOWN_MS) return false;
    }

    set({ isChecking: true });

    try {
      // Fetch latest version info from GitHub
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

      const res = await fetch(`${APP_VERSION_URL}?t=${Date.now()}`, {
        signal: controller.signal,
        headers: { "Cache-Control": "no-cache" },
      });
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const { latestVersion, downloadUrl, releaseNotes = "" } = data;

      set({ latestVersion, downloadUrl, releaseNotes, lastChecked: Date.now() });

      const hasUpdate =
        latestVersion !== CURRENT_VERSION &&
        isNewerVersion(latestVersion, CURRENT_VERSION);

      if (hasUpdate) {
        set({ updateAvailable: true, updateModalVisible: true });
      } else {
        set({ updateAvailable: false });
        // Only hide modal if not manually already open
        if (!manual) set({ updateModalVisible: false });
      }

      return hasUpdate;
    } catch (err) {
      if (__DEV__) console.warn("[UpdateStore] checkForUpdates failed:", err);
      set({ lastChecked: Date.now() }); // still mark as checked to avoid spam
      return false;
    } finally {
      set({ isChecking: false });
    }
  },
}));

/** Returns true if `a` is newer than `b` (semver major.minor.patch) */
function isNewerVersion(a: string, b: string): boolean {
  const parse = (v: string) => v.split(".").map(Number);
  const [aMaj, aMin, aPat] = parse(a);
  const [bMaj, bMin, bPat] = parse(b);
  if (aMaj !== bMaj) return aMaj > bMaj;
  if (aMin !== bMin) return aMin > bMin;
  return aPat > bPat;
}
