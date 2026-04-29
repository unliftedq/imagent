import { describe, expect, it } from "vitest";
import { createIpcClient, type IpcTransport } from "./client.js";
import { contract } from "./contract.js";
import { events } from "./events.js";
import {
  IpcHandlerError,
  notImplemented,
  registerIpcHandlers,
  type ContractHandlers,
  type IpcMainLike,
  type WebContentsLike,
} from "./server.js";

/** Tiny IpcMain fake — wires `handle()` calls into a Map keyed by channel. */
function makeFakeIpc(): {
  ipcMain: IpcMainLike;
  invoke: (channel: string, input: unknown) => Promise<unknown>;
  channels: Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown> | unknown>;
} {
  const channels = new Map<
    string,
    (event: unknown, ...args: unknown[]) => Promise<unknown> | unknown
  >();
  const ipcMain: IpcMainLike = {
    handle: (channel, listener) => {
      channels.set(channel, listener);
    },
    removeHandler: (channel) => {
      channels.delete(channel);
    },
  };
  return {
    ipcMain,
    channels,
    invoke: async (channel, input) => {
      const fn = channels.get(channel);
      if (!fn) throw new Error(`channel ${channel} not registered`);
      return fn({}, input);
    },
  };
}

function makeTransport(invoke: (channel: string, input: unknown) => Promise<unknown>): IpcTransport {
  return {
    invoke: (method, input) => invoke(method, input),
    subscribe: () => () => {},
  };
}

describe("registerIpcHandlers", () => {
  it("registers every contract route and validates input", async () => {
    const { ipcMain, channels, invoke } = makeFakeIpc();
    const handlers: Partial<ContractHandlers> = {
      "providers.list": async () => [
        {
          id: "openai",
          displayName: "OpenAI",
          configured: true,
          defaultModel: "gpt-image-1",
          modelIds: ["gpt-image-1"],
        },
      ],
    };
    registerIpcHandlers(ipcMain, handlers);

    // Every method on the contract should be wired.
    for (const m of Object.keys(contract)) {
      expect(channels.has(m)).toBe(true);
    }

    const reply = (await invoke("providers.list", undefined)) as { ok: true; value: unknown[] };
    expect(reply.ok).toBe(true);
    expect(reply.value).toHaveLength(1);
  });

  it("reports validation_failed when input shape is wrong", async () => {
    const { ipcMain, invoke } = makeFakeIpc();
    registerIpcHandlers(ipcMain, {
      "providers.test": async () => ({ ok: true as const, latencyMs: 5 }),
    });
    const reply = (await invoke("providers.test", { id: "not-a-provider" })) as {
      ok: false;
      error: { code: string };
    };
    expect(reply.ok).toBe(false);
    expect(reply.error.code).toBe("validation_failed");
  });

  it("returns not_implemented when no handler is registered", async () => {
    const { ipcMain, invoke } = makeFakeIpc();
    registerIpcHandlers(ipcMain, {});
    const reply = (await invoke("providers.list", undefined)) as {
      ok: false;
      error: { code: string };
    };
    expect(reply.ok).toBe(false);
    expect(reply.error.code).toBe("not_implemented");
  });

  it("notImplemented() handler surfaces a typed error envelope", async () => {
    const { ipcMain, invoke } = makeFakeIpc();
    registerIpcHandlers(ipcMain, {
      "image.generate": notImplemented("M5", "image.generate"),
    });
    const reply = (await invoke("image.generate", {
      prompt: "x",
      providerId: "openai",
      model: "gpt-image-1",
      count: 1,
      references: [],
      assetIds: [],
    })) as { ok: false; error: { code: string; message: string } };
    expect(reply.ok).toBe(false);
    expect(reply.error.code).toBe("not_implemented");
    expect(reply.error.message).toMatch(/M5/);
  });

  it("forwards events to all targets after schema-validating", () => {
    const { ipcMain } = makeFakeIpc();
    const server = registerIpcHandlers(ipcMain, {});
    const sent: Array<[string, unknown]> = [];
    const target: WebContentsLike = {
      send: (channel, payload) => {
        sent.push([channel, payload]);
      },
    };
    server.addEventTarget(target);
    server.emit("config.changed", { configJson: "{}" });
    expect(sent).toEqual([["config.changed", { configJson: "{}" }]]);
    // Schema rejection should throw at the emitter (caller's bug, not a
    // wire-format issue).
    expect(() =>
      server.emit("job.progress", {
        id: "x",
        progress: 2, // out of range
        state: "running",
      }),
    ).toThrow();
  });

  it("client → server happy path: providers.test ok=true round-trip", async () => {
    const { ipcMain, invoke } = makeFakeIpc();
    registerIpcHandlers(ipcMain, {
      "providers.test": async ({ id }) => {
        expect(id).toBe("openai");
        return { ok: true as const, latencyMs: 42, sampleModelId: "gpt-image-1" };
      },
    });
    const client = createIpcClient(makeTransport(invoke));
    const out = await client["providers.test"]({ id: "openai" });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.latencyMs).toBe(42);
  });

  it("client → server error path: throws IpcClientError with structured code", async () => {
    const { ipcMain, invoke } = makeFakeIpc();
    registerIpcHandlers(ipcMain, {
      "app.preferences.set": async () => {
        throw new IpcHandlerError("internal", "disk full");
      },
    });
    const client = createIpcClient(makeTransport(invoke));
    await expect(
      client["app.preferences.set"]({ theme: "dark" }),
    ).rejects.toMatchObject({ name: "IpcClientError", code: "internal", message: "disk full" });
  });

  it("app.preferences.set round-trips a partial input", async () => {
    const { ipcMain, invoke } = makeFakeIpc();
    let saved: unknown;
    registerIpcHandlers(ipcMain, {
      "app.preferences.set": async (input) => {
        saved = input;
        return {
          theme: "dark",
          defaultProvider: "openai",
          defaultOutputDir: null,
          generationConcurrency: 2,
          keepPromptHistory: true,
          openAfterGenerate: false,
        };
      },
    });
    const client = createIpcClient(makeTransport(invoke));
    const result = await client["app.preferences.set"]({ theme: "dark" });
    expect(result.theme).toBe("dark");
    expect(saved).toEqual({ theme: "dark" });
  });

  it("subscribes to events through the client", async () => {
    const { ipcMain } = makeFakeIpc();
    const subscribers = new Map<string, Array<(p: unknown) => void>>();
    const transport: IpcTransport = {
      invoke: async () => ({ ok: true, value: undefined }),
      subscribe(channel, handler) {
        const list = subscribers.get(channel) ?? [];
        list.push(handler);
        subscribers.set(channel, list);
        return () => {};
      },
    };
    registerIpcHandlers(ipcMain, {});
    const client = createIpcClient(transport);
    const seen: unknown[] = [];
    client.on("config.changed", (p) => seen.push(p));
    // Drive a message through the fake subscription.
    const fns = subscribers.get("config.changed") ?? [];
    fns[0]?.(events["config.changed"].parse({ configJson: "{}" }));
    expect(seen).toEqual([{ configJson: "{}" }]);
  });
});
