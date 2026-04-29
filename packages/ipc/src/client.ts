import { contract, IpcErrorSchema, type ContractMethod, type Input, type IpcError, type Output } from "./contract.js";
import { events, type EventName, type EventPayload } from "./events.js";

/**
 * Renderer-side typed client. The Proxy wraps `ipcRenderer.invoke(method, input)`,
 * and `output.parse()` validates every reply. Errors from the server come back
 * as `{ ok: false, error }` envelopes; the client unwraps and throws an
 * `IpcClientError` with the original code and message.
 */
export interface IpcTransport {
  invoke(method: string, input: unknown): Promise<unknown>;
  /** Wire one event subscription. Returns an unsubscribe handle. */
  subscribe(event: string, handler: (payload: unknown) => void): () => void;
}

export class IpcClientError extends Error {
  readonly code: IpcError["code"];
  readonly details?: Record<string, unknown>;
  constructor(error: IpcError) {
    super(error.message);
    this.name = "IpcClientError";
    this.code = error.code;
    if (error.details) this.details = error.details;
  }
}

/** Strongly-typed renderer client. */
export type IpcClient = {
  [M in ContractMethod]: (input: Input<M>) => Promise<Output<M>>;
} & {
  on<E extends EventName>(event: E, handler: (payload: EventPayload<E>) => void): () => void;
};

/**
 * Build a typed client around an `IpcTransport` (either the preload bridge
 * or a test fake). Method calls map to `transport.invoke(channel, input)`,
 * outputs validate via the contract zod schemas, and `on(event, cb)` parses
 * push-event payloads on the way in.
 */
export function createIpcClient(transport: IpcTransport): IpcClient {
  const cache: Record<string, unknown> = {};
  const proxy = new Proxy(cache, {
    get(_target, prop: string) {
      if (prop === "on") {
        return function on<E extends EventName>(
          event: E,
          handler: (payload: EventPayload<E>) => void,
        ): () => void {
          const schema = events[event];
          return transport.subscribe(event, (payload) => {
            const parsed = schema.parse(payload) as EventPayload<E>;
            handler(parsed);
          });
        };
      }
      // Lazily build (and cache) the per-method invoker.
      if (!(prop in cache)) {
        cache[prop] = makeInvoker(prop as ContractMethod, transport);
      }
      return cache[prop];
    },
  }) as unknown as IpcClient;
  return proxy;
}

function makeInvoker<M extends ContractMethod>(method: M, transport: IpcTransport) {
  const route = contract[method] as { input: { parse: (v: unknown) => Input<M> }; output: { parse: (v: unknown) => Output<M> } } | undefined;
  return async (input: Input<M>): Promise<Output<M>> => {
    if (!route) {
      throw new IpcClientError({
        code: "not_implemented",
        message: `Unknown IPC method: ${String(method)}`,
      });
    }
    const reply = await transport.invoke(method, input);
    if (!reply || typeof reply !== "object" || !("ok" in reply)) {
      throw new IpcClientError({
        code: "internal",
        message: `Malformed IPC reply from '${String(method)}'`,
      });
    }
    const envelope = reply as { ok: boolean; value?: unknown; error?: unknown };
    if (envelope.ok === false) {
      const err = IpcErrorSchema.parse(envelope.error);
      throw new IpcClientError(err);
    }
    return route.output.parse(envelope.value);
  };
}

/**
 * Helper for the preload bridge: builds the small {invoke, subscribe} shape
 * the client expects from Electron's ipcRenderer + window-side event channels.
 *
 * Used as `contextBridge.exposeInMainWorld('api', createPreloadBridge(ipcRenderer))`.
 */
export function createPreloadBridge(ipcRenderer: {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
}): IpcTransport {
  return {
    invoke: (method, input) => ipcRenderer.invoke(method, input),
    subscribe(event, handler) {
      const listener = (_e: unknown, payload: unknown) => handler(payload);
      ipcRenderer.on(event, listener);
      return () => {
        ipcRenderer.removeListener(event, listener);
      };
    },
  };
}
