import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { Themes, ThemeColors } from "../constants/theme";

export type ThemeType = "black" | "white" | "cream";

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
    const pColor = get().primaryColor;
    const newColors = { ...Themes[theme], ...(pColor ? { primary: pColor } : {}) };
    SecureStore.setItemAsync("app_theme", theme).catch(() => {});
    set({ theme, colors: newColors });
  },
  setPrimaryColor: (color) => {
    const t = get().theme;
    const newColors = { ...Themes[t], primary: color };
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
    const savedTheme = await SecureStore.getItemAsync("app_theme");
    const savedColor = await SecureStore.getItemAsync("app_primary_color");
    
    let t: ThemeType = "black";
    if (savedTheme && (savedTheme === "black" || savedTheme === "white" || savedTheme === "cream")) {
      t = savedTheme as ThemeType;
    }
    
    useThemeStore.getState().initTheme(t, savedColor || undefined);
  } catch (e) {
    // Ignore error
  }
};
