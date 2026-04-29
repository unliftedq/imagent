import { contextBridge, ipcRenderer } from "electron";

/**
 * Preload bridge — exposes a thin `window.api` shape that the renderer
 * passes into `createIpcClient`. We keep this file minimal: no zod, no
 * client construction (those live in the renderer), just the transport.
 */
const api = {
  invoke(channel: string, input: unknown): Promise<unknown> {
    return ipcRenderer.invoke(channel, input);
  },
  on(channel: string, listener: (payload: unknown) => void): () => void {
    const wrapped = (_e: unknown, payload: unknown) => listener(payload);
    ipcRenderer.on(channel, wrapped);
    return () => {
      ipcRenderer.removeListener(channel, wrapped);
    };
  },
} as const;

contextBridge.exposeInMainWorld("api", api);

export type PreloadApi = typeof api;
