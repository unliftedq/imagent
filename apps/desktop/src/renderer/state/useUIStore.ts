import { create } from "zustand";
import type { ThemePref } from "@imagine-studio/ui";

export type Route = "providers" | "settings" | "studio" | "gallery" | "assets" | "video";

export interface ToastEntry {
  id: string;
  title: string;
  description?: string;
  variant: "info" | "success" | "warning" | "error";
}

interface UIState {
  route: Route;
  theme: ThemePref;
  toasts: ToastEntry[];
  navigate: (route: Route) => void;
  setTheme: (theme: ThemePref) => void;
  pushToast: (toast: Omit<ToastEntry, "id">) => string;
  dismissToast: (id: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  route: "providers",
  theme: "system",
  toasts: [],
  navigate: (route) => set({ route }),
  setTheme: (theme) => set({ theme }),
  pushToast: (toast) => {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    return id;
  },
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
