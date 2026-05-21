import { z } from "zod";
import { contract, IpcErrorSchema, type ContractMethod, type Input, type IpcError, type Output } from "./contract.js";
import type { EventName, EventPayload } from "./events.js";
import { events } from "./events.js";

/**
 * Per-method handler signature. The main process registers one handler per
 * route; the dispatcher parses input via the contract's input schema, calls
 * the handler, and parses the output before returning over IPC.
 *
 * Handlers may throw — the dispatcher wraps any thrown value into an
 * `IpcError` envelope so renderer-side never sees a thrown Error.
 */
export type ContractHandler<M extends ContractMethod> = (input: Input<M>) => Promise<Output<M>>;

export type ContractHandlers = {
  [M in ContractMethod]: ContractHandler<M>;
};

/**
 * Minimal subset of Electron's `IpcMain` we need. Defining it locally lets
 * unit tests pass a plain object without dragging in `electron`.
 */
export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => Promise<unknown> | unknown,
  ): void;
  removeHandler?(channel: string): void;
}

/** Tiny webContents-like surface for forwarding push events. */
export interface WebContentsLike {
  send(channel: string, payload: unknown): void;
}

export interface IpcServer {
  /** Register a single handler at runtime — useful for incremental wiring. */
  registerOne<M extends ContractMethod>(method: M, handler: ContractHandler<M>): void;
  /** Push an event to all registered targets (typically every renderer). */
  emit<E extends EventName>(event: E, payload: EventPayload<E>): void;
  /** Register a webContents-like target for receiving emitted events. */
  addEventTarget(target: WebContentsLike): () => void;
  /** Tear down — used by tests. */
  close(): void;
}

/**
 * Registers every contract route on `ipcMain` with input/output validation.
 * Unhandled methods (e.g. `image.generate` in M4) should be wired through
 * `notImplemented(...)` so the renderer gets a clear error envelope rather
 * than a hung promise.
 */
export function registerIpcHandlers(
  ipcMain: IpcMainLike,
  handlers: Partial<ContractHandlers>,
): IpcServer {
  const targets = new Set<WebContentsLike>();
  const registered = new Set<ContractMethod>();

  function makeChannelHandler<M extends ContractMethod>(method: M): (event: unknown, ...args: unknown[]) => Promise<unknown> {
    const route = contract[method];
    return async (_event: unknown, ...args: unknown[]) => {
      const rawInput = args[0];
      let parsedInput: Input<M>;
      try {
        parsedInput = route.input.parse(rawInput) as Input<M>;
      } catch (err) {
        return errorEnvelope({
          code: "validation_failed",
          message: zodMessage(err),
          details: zodDetails(err),
        });
      }

      const handler = handlers[method] as ContractHandler<M> | undefined;
      if (!handler) {
        return errorEnvelope({
          code: "not_implemented",
          message: `IPC route '${method}' has no registered handler`,
        });
      }

      let result: Output<M>;
      try {
        result = await handler(parsedInput);
      } catch (err) {
        return errorEnvelope(coerceError(err));
      }

      try {
        const validated = route.output.parse(result);
        return { ok: true, value: validated };
      } catch (err) {
        return errorEnvelope({
          code: "internal",
          message: `output validation failed for '${method}': ${zodMessage(err)}`,
          details: zodDetails(err),
        });
      }
    };
  }

  // Register every channel listed in the contract.
  for (const method of Object.keys(contract) as ContractMethod[]) {
    ipcMain.handle(method, makeChannelHandler(method));
    registered.add(method);
  }

  return {
    registerOne(method, handler) {
      handlers[method] = handler as ContractHandlers[typeof method];
    },
    emit(event, payload) {
      // emit() is fire-and-forget — it must never throw back into the
      // caller. Listener throws on a Node EventEmitter (e.g. our JobRunner
      // forwarding to renderers) would otherwise skip downstream listeners
      // and silently lose job-completion side-effects.
      let parsed: unknown;
      try {
        const schema = events[event];
        parsed = schema.parse(payload);
      } catch (err) {
        // Programmer error: log to console (no logger injected here) but
        // don't crash the emitter. The renderer would never know either way.
        // eslint-disable-next-line no-console
        console.warn(`[ipc] emit(${event}): payload validation failed`, err);
        return;
      }
      // Per-target try/catch so a destroyed `webContents` (window closed or
      // reloaded mid-session) doesn't short-circuit broadcasts to the
      // remaining live renderers. Without this, a single "Object has been
      // destroyed" throw would mean live windows never see the event.
      // Snapshot first so deletions mid-iteration can't trip the Set iterator.
      for (const t of Array.from(targets)) {
        try {
          t.send(event, parsed);
        } catch {
          targets.delete(t);
        }
      }
    },
    addEventTarget(target) {
      targets.add(target);
      return () => targets.delete(target);
    },
    close() {
      if (ipcMain.removeHandler) {
        for (const m of registered) ipcMain.removeHandler(m);
      }
      registered.clear();
      targets.clear();
    },
  };
}

/**
 * Produce a typed handler that always replies with a `not_implemented`
 * envelope. Used to wire the M5/M6/M7 routes from M4 so the contract is
 * complete and renderer-side gets useful errors when called accidentally.
 */
export function notImplemented<M extends ContractMethod>(
  milestone: "M5" | "M6" | "M7",
  method: M,
): ContractHandler<M> {
  return async () => {
    throw new IpcHandlerError("not_implemented", `${method}: not implemented (${milestone})`);
  };
}

/**
 * Throwable form of `IpcError` for handlers that want to surface a structured
 * code + message. Anything else thrown is mapped to `internal`.
 */
export class IpcHandlerError extends Error {
  readonly code: IpcError["code"];
  readonly details?: Record<string, unknown>;
  constructor(code: IpcError["code"], message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "IpcHandlerError";
    this.code = code;
    if (details) this.details = details;
  }
}

function errorEnvelope(error: IpcError): { ok: false; error: IpcError } {
  // Validate so a buggy code path can't smuggle a non-conformant shape over
  // the wire — the renderer relies on the discriminated union.
  return { ok: false, error: IpcErrorSchema.parse(error) };
}

function coerceError(err: unknown): IpcError {
  if (err instanceof IpcHandlerError) {
    const out: IpcError = { code: err.code, message: err.message };
    if (err.details) out.details = err.details;
    return out;
  }
  if (err && typeof err === "object" && "kind" in err && (err as { kind?: unknown }).kind === "ProviderError") {
    const e = err as { message?: string; status?: number; vendorId?: string };
    const details: Record<string, unknown> = {};
    if (e.status !== undefined) details.status = e.status;
    if (e.vendorId !== undefined) details.vendorId = e.vendorId;
    const out: IpcError = {
      code: "provider_error",
      message: e.message ?? "provider error",
    };
    if (Object.keys(details).length > 0) out.details = details;
    return out;
  }
  if (err instanceof Error) {
    return { code: "internal", message: err.message };
  }
  return { code: "internal", message: String(err) };
}

function zodMessage(err: unknown): string {
  if (err instanceof z.ZodError) {
    return err.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`).join("; ");
  }
  return err instanceof Error ? err.message : String(err);
}

function zodDetails(err: unknown): Record<string, unknown> | undefined {
  if (err instanceof z.ZodError) {
    return { issues: err.issues };
  }
  return undefined;
}
