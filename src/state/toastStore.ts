import { create } from "zustand";

export interface Toast {
  id: string;
  message: string;
  undo?: () => void;
}

interface ToastState {
  toasts: Toast[];
  show: (message: string, undo?: () => void) => void;
  dismiss: (id: string) => void;
}

const LIFETIME_MS = 8000;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  show: (message, undo) => {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts, { id, message, undo }] }));
    setTimeout(() => get().dismiss(id), LIFETIME_MS);
  },

  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));
