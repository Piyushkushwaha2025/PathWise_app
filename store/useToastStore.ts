import { create } from 'zustand';

interface ToastItem {
  id: string;
  title: string;
  message: string;
  type: 'present' | 'absent' | 'info';
}

interface ToastState {
  queue: ToastItem[];
  showToast: (item: Omit<ToastItem, 'id'>) => void;
  dismissToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  queue: [],
  showToast: (item) => {
    const id = `toast_${Date.now()}_${Math.random()}`;
    set((s) => ({ queue: [...s.queue, { ...item, id }] }));
    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      get().dismissToast(id);
    }, 4000);
  },
  dismissToast: (id) => {
    set((s) => ({ queue: s.queue.filter((t) => t.id !== id) }));
  },
}));
