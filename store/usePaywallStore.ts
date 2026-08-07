import { create } from 'zustand';

interface PaywallState {
  isVisible: boolean;
  message?: string;
  showPaywall: (msg?: string) => void;
  hidePaywall: () => void;
}

export const usePaywallStore = create<PaywallState>((set) => ({
  isVisible: false,
  message: undefined,
  showPaywall: (msg) => set({ isVisible: true, message: msg }),
  hidePaywall: () => set({ isVisible: false, message: undefined }),
}));
