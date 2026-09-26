import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Themes, ThemeColors } from "../constants/theme";

export type ThemeType = "black" | "white" | "cream" | "emerald";

interface ThemeState {
  theme: ThemeType;
  primaryColor?: string;
  colors: ThemeColors;
  setTheme: (theme: ThemeType) => void;
  setPrimaryColor: (color: string) => void;
  initTheme: (theme: ThemeType, primaryColor?: string) => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: "black",
  primaryColor: undefined,
  colors: Themes.black,
  setTheme: (theme) => {
    // Dual storage for 100% persistence reliability on all devices
    AsyncStorage.setItem("app_theme", theme).catch(() => {});
    AsyncStorage.removeItem("app_primary_color").catch(() => {});
    SecureStore.setItemAsync("app_theme", theme).catch(() => {});
    SecureStore.deleteItemAsync("app_primary_color").catch(() => {});
    set({ theme, primaryColor: undefined, colors: Themes[theme] });
  },
  setPrimaryColor: (color) => {
    const t = get().theme;
    const newColors = { ...Themes[t], primary: color };
    AsyncStorage.setItem("app_primary_color", color).catch(() => {});
    SecureStore.setItemAsync("app_primary_color", color).catch(() => {});
    set({ primaryColor: color, colors: newColors });
  },
  initTheme: (theme, primaryColor) => {
    const newColors = { ...Themes[theme], ...(primaryColor ? { primary: primaryColor } : {}) };
    set({ theme, primaryColor, colors: newColors });
  },
}));

export const loadTheme = async () => {
  try {
    // Check AsyncStorage first (fast, synchronous in memory), fallback to SecureStore
    let savedTheme = await AsyncStorage.getItem("app_theme");
    let savedColor = await AsyncStorage.getItem("app_primary_color");

    if (!savedTheme) {
      savedTheme = await SecureStore.getItemAsync("app_theme");
    }
    if (!savedColor) {
      savedColor = await SecureStore.getItemAsync("app_primary_color");
    }
    
    let t: ThemeType = "black";
    if (savedTheme && (savedTheme === "black" || savedTheme === "white" || savedTheme === "cream" || savedTheme === "emerald")) {
      t = savedTheme as ThemeType;
    }
    
    useThemeStore.getState().initTheme(t, savedColor || undefined);
  } catch (e) {
    // Ignore error
  }
};
