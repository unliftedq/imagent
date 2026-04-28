import { contract, type ContractMethod, type Input, type Output } from "./contract.js";
import type { EventName, EventPayload } from "./events.js";

/**
 * Per-method handler signature. The main process registers one handler per
 * route; the dispatcher (M4) parses input via the contract's input schema,
 * calls the handler, and parses the output before returning over IPC.
 */
export type ContractHandler<M extends ContractMethod> = (input: Input<M>) => Promise<Output<M>>;

/** Map of route → handler. M4 builds this in `apps/desktop/src/main/ipc-handlers.ts`. */
export type ContractHandlers = {
  [M in ContractMethod]: ContractHandler<M>;
};

/**
 * Server-side dispatcher type. M4 wires this up against `ipcMain.handle`.
 * Exporting the type keeps M1 type-only while the renderer/preload arrive.
 */
export interface IpcServer {
  /** Register all handlers in one shot at boot. */
  register(handlers: ContractHandlers): void;
  /** Push an event to all renderers. */
  emit<E extends EventName>(event: E, payload: EventPayload<E>): void;
  /** Tear down — used by tests. */
  close(): void;
}

export function createIpcServer(_transport: {
  handle: (channel: string, fn: (...args: unknown[]) => Promise<unknown>) => void;
  emit: (channel: string, payload: unknown) => void;
}): IpcServer {
  void contract;
  throw new Error("not implemented (M4)");
}
