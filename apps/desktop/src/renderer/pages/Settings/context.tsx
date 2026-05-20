import { createContext, useContext } from "react";

export interface SettingsSubpage {
  title: string;
  onBack: () => void;
}

export interface SettingsSubpageContextValue {
  subpage: SettingsSubpage | null;
  setSubpage: (subpage: SettingsSubpage | null) => void;
}

export const SettingsSubpageContext = createContext<SettingsSubpageContextValue | null>(null);

export function useSettingsSubpage(): SettingsSubpageContextValue {
  const ctx = useContext(SettingsSubpageContext);
  if (!ctx) {
    throw new Error("useSettingsSubpage must be used within SettingsDialog");
  }
  return ctx;
}
