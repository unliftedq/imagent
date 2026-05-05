import { create } from "zustand";
import { api } from "../lib/api.js";
import type {
  AppPreferencesPayload,
  MaskedSecrets,
  ProviderId,
  ProviderPreferencesPayload,
  ProviderSummary,
  ProviderTestResult,
  SecretsWrite,
} from "@imagent/ipc";

export interface TestRun {
  ts: number;
  result: ProviderTestResult;
}

interface ConfigState {
  loading: boolean;
  appPrefs: AppPreferencesPayload | null;
  providerPrefs: ProviderPreferencesPayload | null;
  secrets: MaskedSecrets;
  summaries: ProviderSummary[];
  /** Last test result keyed by provider id. */
  testResults: Record<string, TestRun>;
  /** Provider ids currently mid-test. */
  testing: Record<string, boolean>;
  refresh: () => Promise<void>;
  saveAppPrefs: (patch: Partial<AppPreferencesPayload>) => Promise<void>;
  saveProviderPrefs: (next: ProviderPreferencesPayload) => Promise<void>;
  saveSecrets: (patch: SecretsWrite) => Promise<void>;
  testProvider: (id: ProviderId) => Promise<void>;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  loading: false,
  appPrefs: null,
  providerPrefs: null,
  secrets: {},
  summaries: [],
  testResults: {},
  testing: {},

  refresh: async () => {
    set({ loading: true });
    try {
      const [appPrefs, providerPrefs, secrets, summaries] = await Promise.all([
        api["app.preferences.get"](),
        api["providers.config.get"](),
        api["providers.secrets.get"](),
        api["providers.list"](),
      ]);
      set({ appPrefs, providerPrefs, secrets, summaries });
    } finally {
      set({ loading: false });
    }
  },

  saveAppPrefs: async (patch) => {
    const next = await api["app.preferences.set"](patch);
    set({ appPrefs: next });
  },

  saveProviderPrefs: async (next) => {
    const saved = await api["providers.config.set"](next);
    const summaries = await api["providers.list"]();
    set({ providerPrefs: saved, summaries });
  },

  saveSecrets: async (patch) => {
    const masked = await api["providers.secrets.set"](patch);
    const summaries = await api["providers.list"]();
    // Stale test results — invalidate them on key change.
    set({ secrets: masked, summaries, testResults: {} });
    void get; // eslint shut up
  },

  testProvider: async (id) => {
    set((s) => ({ testing: { ...s.testing, [id]: true } }));
    try {
      const result = await api["providers.test"]({ id });
      set((s) => ({
        testResults: { ...s.testResults, [id]: { ts: Date.now(), result } },
      }));
    } catch (err) {
      set((s) => ({
        testResults: {
          ...s.testResults,
          [id]: {
            ts: Date.now(),
            result: { ok: false, reason: (err as Error)?.message ?? String(err) },
          },
        },
      }));
    } finally {
      set((s) => {
        const next = { ...s.testing };
        delete next[id];
        return { testing: next };
      });
    }
  },
}));
