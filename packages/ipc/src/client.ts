import { contract, type ContractMethod, type Input, type Output } from "./contract.js";
import type { EventName, EventPayload } from "./events.js";

/**
 * Renderer-side typed client. The runtime implementation lands in M4 — the
 * Proxy will wrap `window.api.invoke(method, input)` and `output.parse()`
 * each reply. For now we expose the typed shape so renderer code can be
 * written against `IpcClient` without an electron dep.
 */
export interface IpcClient {
  invoke<M extends ContractMethod>(method: M, input: Input<M>): Promise<Output<M>>;
  on<E extends EventName>(event: E, handler: (payload: EventPayload<E>) => void): () => void;
}

/**
 * Build a real client around an `invoke` function (e.g. `ipcRenderer.invoke`).
 * M4 swaps this from a stub to the actual Proxy with input/output validation.
 */
export function createIpcClient(_transport: {
  invoke: (method: string, input: unknown) => Promise<unknown>;
  subscribe: (event: string, handler: (payload: unknown) => void) => () => void;
}): IpcClient {
  // Reference `contract` so the import is preserved — the real client uses it
  // for runtime parse() in M4.
  void contract;
  throw new Error("not implemented (M4)");
}
