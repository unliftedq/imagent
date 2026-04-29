import { createIpcClient, type IpcClient, type IpcTransport } from "@imagine-studio/ipc";

declare global {
  interface Window {
    api?: {
      invoke(channel: string, input: unknown): Promise<unknown>;
      on(channel: string, listener: (payload: unknown) => void): () => void;
    };
  }
}

function getTransport(): IpcTransport {
  if (typeof window !== "undefined" && window.api) {
    const a = window.api;
    return {
      invoke: (m, input) => a.invoke(m, input),
      subscribe: (event, handler) => a.on(event, handler),
    };
  }
  // Fallback used during the Vite dev server's first paint — shouldn't be
  // hit in normal Electron runs but keeps SSR-style HMR less noisy.
  return {
    invoke: () =>
      Promise.reject(new Error("IPC transport unavailable: window.api missing")),
    subscribe: () => () => {},
  };
}

export const api: IpcClient = createIpcClient(getTransport());
