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
          kinds: ["image"],
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

  describe("M5 routes — smoke tests for input/output round-trips", () => {
    it("gallery.query: paginates with kind filter", async () => {
      const { ipcMain, invoke } = makeFakeIpc();
      registerIpcHandlers(ipcMain, {
        "gallery.query": async (q) => {
          expect(q.kind).toBe("image");
          expect(q.limit).toBe(20);
          return { items: [], total: 0 };
        },
      });
      const reply = (await invoke("gallery.query", {
        kind: "image",
        limit: 20,
        offset: 0,
      })) as { ok: true; value: { items: unknown[]; total: number } };
      expect(reply.ok).toBe(true);
      expect(reply.value.total).toBe(0);
    });

    it("gallery.toggleFavorite: omits `favorited` and toggles", async () => {
      const { ipcMain, invoke } = makeFakeIpc();
      let seen: { id: string; favorited?: boolean } | null = null;
      registerIpcHandlers(ipcMain, {
        "gallery.toggleFavorite": async (input) => {
          seen = input;
        },
      });
      const reply = (await invoke("gallery.toggleFavorite", { id: "g1" })) as {
        ok: true;
      };
      expect(reply.ok).toBe(true);
      expect(seen).toEqual({ id: "g1" });
    });

    it("gallery.show: returns parent + children + siblings", async () => {
      const { ipcMain, invoke } = makeFakeIpc();
      const stubItem = (id: string) => ({
        id,
        kind: "image" as const,
        prompt: "p",
        providerId: "openai",
        model: "x",
        paramsJson: "{}",
        relPath: "x.png",
        bytes: 1,
        favorited: false,
        createdAt: 0,
      });
      registerIpcHandlers(ipcMain, {
        "gallery.show": async ({ id }) => ({
          item: stubItem(id),
          parent: stubItem("p1"),
          children: [stubItem("c1"), stubItem("c2")],
          siblings: [stubItem("s1")],
        }),
      });
      const reply = (await invoke("gallery.show", { id: "g1" })) as {
        ok: true;
        value: {
          item: { id: string };
          children: unknown[];
          siblings: unknown[];
        };
      };
      expect(reply.ok).toBe(true);
      expect(reply.value.item.id).toBe("g1");
      expect(reply.value.children).toHaveLength(2);
      expect(reply.value.siblings).toHaveLength(1);
    });

    it("gallery.remix: returns an ImageRequest with parentId", async () => {
      const { ipcMain, invoke } = makeFakeIpc();
      registerIpcHandlers(ipcMain, {
        "gallery.remix": async ({ itemId }) => ({
          prompt: "remixed",
          providerId: "openai",
          model: "gpt-image-1",
          count: 1,
          references: [],
          assetIds: [],
          parentId: itemId,
        }),
      });
      const reply = (await invoke("gallery.remix", { itemId: "g1" })) as {
        ok: true;
        value: { parentId?: string };
      };
      expect(reply.ok).toBe(true);
      expect(reply.value.parentId).toBe("g1");
    });

    it("boards.list: returns ordered boards", async () => {
      const { ipcMain, invoke } = makeFakeIpc();
      registerIpcHandlers(ipcMain, {
        "boards.list": async () => [
          {
            id: "b1",
            name: "First",
            description: null,
            coverItemId: null,
            position: 0,
            createdAt: 0,
            updatedAt: 0,
          },
        ],
      });
      const reply = (await invoke("boards.list", undefined)) as {
        ok: true;
        value: Array<{ id: string }>;
      };
      expect(reply.ok).toBe(true);
      expect(reply.value).toHaveLength(1);
    });

    it("boards.addItem: position is optional", async () => {
      const { ipcMain, invoke } = makeFakeIpc();
      let seen: { boardId: string; itemId: string; position?: number } | null = null;
      registerIpcHandlers(ipcMain, {
        "boards.addItem": async (input) => {
          seen = input;
        },
      });
      const reply = (await invoke("boards.addItem", {
        boardId: "b1",
        itemId: "g1",
      })) as { ok: true };
      expect(reply.ok).toBe(true);
      expect(seen).toEqual({ boardId: "b1", itemId: "g1" });
    });

    it("boards.create: round-trip", async () => {
      const { ipcMain, invoke } = makeFakeIpc();
      registerIpcHandlers(ipcMain, {
        "boards.create": async (input) => ({
          id: "b-new",
          name: input.name,
          description: input.description ?? null,
          coverItemId: null,
          position: 0,
          createdAt: 0,
          updatedAt: 0,
        }),
      });
      const reply = (await invoke("boards.create", {
        id: "ignored",
        name: "Inspirations",
        description: "saved looks",
        coverItemId: null,
        position: 0,
        createdAt: 0,
        updatedAt: 0,
      })) as { ok: true; value: { id: string; name: string } };
      expect(reply.ok).toBe(true);
      expect(reply.value.id).toBe("b-new");
      expect(reply.value.name).toBe("Inspirations");
    });

    it("jobs.list: round-trips JobsQuery", async () => {
      const { ipcMain, invoke } = makeFakeIpc();
      registerIpcHandlers(ipcMain, {
        "jobs.list": async (q) => {
          expect(q.kind).toBe("image");
          return [];
        },
      });
      const reply = (await invoke("jobs.list", {
        kind: "image",
        limit: 50,
        offset: 0,
      })) as { ok: true; value: unknown[] };
      expect(reply.ok).toBe(true);
    });

    it("jobs.cancel: round-trips id", async () => {
      const { ipcMain, invoke } = makeFakeIpc();
      let seen: string | null = null;
      registerIpcHandlers(ipcMain, {
        "jobs.cancel": async ({ id }) => {
          seen = id;
        },
      });
      const reply = (await invoke("jobs.cancel", { id: "j1" })) as { ok: true };
      expect(reply.ok).toBe(true);
      expect(seen).toBe("j1");
    });
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
