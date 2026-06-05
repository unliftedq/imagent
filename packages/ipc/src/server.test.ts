import { describe, expect, it, vi } from "vitest";
import { createIpcClient, type IpcTransport } from "./client.js";
import { contract } from "./contract.js";
import { events } from "./events.js";
import {
  type ContractHandlers,
  IpcHandlerError,
  type IpcMainLike,
  notImplemented,
  registerIpcHandlers,
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

function makeTransport(
  invoke: (channel: string, input: unknown) => Promise<unknown>,
): IpcTransport {
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
    const reply = (await invoke("providers.test", { id: "Not A Provider" })) as {
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
    // Schema rejection is fire-and-forget — emit() must not throw back into
    // the caller (otherwise a buggy payload would tear down job-runner
    // listeners on the same EventEmitter). The bad payload is dropped and
    // logged via console.warn; downstream targets are not touched.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() =>
        server.emit("job.progress", {
          id: "x",
          progress: 2, // out of range
          state: "running",
        }),
      ).not.toThrow();
      expect(sent).toHaveLength(1); // no extra send for the rejected payload
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("drops destroyed targets without aborting the broadcast", () => {
    const { ipcMain } = makeFakeIpc();
    const server = registerIpcHandlers(ipcMain, {});
    const live: Array<[string, unknown]> = [];
    const dead: WebContentsLike = {
      send: () => {
        throw new Error("Object has been destroyed");
      },
    };
    const liveTarget: WebContentsLike = {
      send: (channel, payload) => {
        live.push([channel, payload]);
      },
    };
    // Order matters — the dead target is registered first so the live one
    // sits *after* it in the iteration. Without the per-target try/catch
    // the throw would abort the loop and `liveTarget` would never see the
    // event (this is the bug behind the "gallery.changed (video) emit
    // failed" reports — destroyed renderers were swallowing the broadcast).
    server.addEventTarget(dead);
    server.addEventTarget(liveTarget);
    server.emit("config.changed", { configJson: "{}" });
    expect(live).toEqual([["config.changed", { configJson: "{}" }]]);
    // A second emit should not re-attempt the destroyed target.
    server.emit("config.changed", { configJson: '{"x":1}' });
    expect(live).toHaveLength(2);
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
    await expect(client["app.preferences.set"]({ theme: "dark" })).rejects.toMatchObject({
      name: "IpcClientError",
      code: "internal",
      message: "disk full",
    });
  });

  it("app.preferences.set round-trips a partial input", async () => {
    const { ipcMain, invoke } = makeFakeIpc();
    let saved: unknown;
    registerIpcHandlers(ipcMain, {
      "app.preferences.set": async (input) => {
        saved = input;
        return {
          theme: "dark",
          locale: "system",
          defaultImageModel: { providerId: "openai", modelId: "gpt-image-1" },
          defaultVideoModel: null,
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
          assets: [],
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

    it("gallery.remix: returns an ImageRequest envelope with parentId", async () => {
      const { ipcMain, invoke } = makeFakeIpc();
      registerIpcHandlers(ipcMain, {
        "gallery.remix": async ({ itemId }) => ({
          kind: "image" as const,
          request: {
            prompt: "remixed",
            providerId: "openai",
            model: "gpt-image-1",
            count: 1,
            references: [],
            assetIds: [],
            parentId: itemId,
          },
        }),
      });
      const reply = (await invoke("gallery.remix", { itemId: "g1" })) as {
        ok: true;
        value: { kind: string; request: { parentId?: string } };
      };
      expect(reply.ok).toBe(true);
      expect(reply.value.kind).toBe("image");
      expect(reply.value.request.parentId).toBe("g1");
    });

    it("gallery.remix: video parent returns a VideoRequest envelope", async () => {
      const { ipcMain, invoke } = makeFakeIpc();
      registerIpcHandlers(ipcMain, {
        "gallery.remix": async () => ({
          kind: "video" as const,
          request: {
            prompt: "rotating crystal",
            providerId: "byteplus",
            model: "seedance-1.0-pro",
            durationSec: 5,
            fps: 24,
            resolution: "720p",
            references: [],
            assetIds: [],
          },
        }),
      });
      const reply = (await invoke("gallery.remix", { itemId: "v1" })) as {
        ok: true;
        value: { kind: string; request: { durationSec?: number } };
      };
      expect(reply.ok).toBe(true);
      expect(reply.value.kind).toBe("video");
      expect(reply.value.request.durationSec).toBe(5);
    });

    it("video.submit: returns { jobId } and accepts assetSlots + parentId", async () => {
      const { ipcMain, invoke } = makeFakeIpc();
      const captured: Array<Record<string, unknown>> = [];
      registerIpcHandlers(ipcMain, {
        "video.submit": async (req) => {
          captured.push(req as Record<string, unknown>);
          return { jobId: "vid-job-1" };
        },
      });
      const reply = (await invoke("video.submit", {
        prompt: "rotating crystal",
        providerId: "byteplus",
        model: "seedance-1.0-pro",
        durationSec: 5,
        references: [],
        assetIds: [],
        assetSlots: { style: ["s1"] },
        parentId: "parent-vid",
      })) as { ok: true; value: { jobId: string } };
      expect(reply.ok).toBe(true);
      expect(reply.value.jobId).toBe("vid-job-1");
      const seen = captured[0]!;
      expect(seen.assetSlots).toEqual({ style: ["s1"] });
      expect(seen.parentId).toBe("parent-vid");
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

  describe("M6 routes — Assets", () => {
    const stubAsset = (id: string, kind: "character" | "style") => ({
      id,
      kind,
      name: `Asset ${id}`,
      description: null,
      promptSnippet: kind === "style" ? "moody" : null,
      files: [],
      createdAt: 0,
      updatedAt: 0,
      archivedAt: null,
    });

    it("assets.list: returns paginated items + total", async () => {
      const { ipcMain, invoke } = makeFakeIpc();
      registerIpcHandlers(ipcMain, {
        "assets.list": async (q) => {
          expect(q?.kind).toBe("character");
          return {
            items: [stubAsset("a1", "character"), stubAsset("a2", "character")],
            total: 2,
          };
        },
      });
      const reply = (await invoke("assets.list", { kind: "character" })) as {
        ok: true;
        value: { items: unknown[]; total: number };
      };
      expect(reply.ok).toBe(true);
      expect(reply.value.total).toBe(2);
      expect(reply.value.items).toHaveLength(2);
    });

    it("assets.show: returns a single asset", async () => {
      const { ipcMain, invoke } = makeFakeIpc();
      registerIpcHandlers(ipcMain, {
        "assets.show": async ({ id }) => stubAsset(id, "character"),
      });
      const reply = (await invoke("assets.show", { id: "a1" })) as {
        ok: true;
        value: { id: string };
      };
      expect(reply.ok).toBe(true);
      expect(reply.value.id).toBe("a1");
    });

    it("assets.create: round-trips a single upload", async () => {
      const { ipcMain, invoke } = makeFakeIpc();
      let seen: { kind?: string; uploads?: number } = {};
      registerIpcHandlers(ipcMain, {
        "assets.create": async (input) => {
          seen = { kind: input.kind, uploads: input.fileUploads.length };
          return stubAsset("new", "character");
        },
      });
      const reply = (await invoke("assets.create", {
        kind: "character",
        name: "Alice",
        fileUploads: [
          {
            bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
            originalName: "alice.png",
            mimeType: "image/png",
          },
        ],
      })) as { ok: true; value: { id: string } };
      expect(reply.ok).toBe(true);
      expect(reply.value.id).toBe("new");
      expect(seen.kind).toBe("character");
      expect(seen.uploads).toBe(1);
    });

    it("assets.update: round-trips a name patch", async () => {
      const { ipcMain, invoke } = makeFakeIpc();
      let seenPatch: { name?: string } = {};
      registerIpcHandlers(ipcMain, {
        "assets.update": async ({ id, patch }) => {
          seenPatch = patch;
          return { ...stubAsset(id, "character"), name: patch.name ?? "" };
        },
      });
      const reply = (await invoke("assets.update", {
        id: "a1",
        patch: { name: "Alice II" },
      })) as { ok: true; value: { name: string } };
      expect(reply.ok).toBe(true);
      expect(reply.value.name).toBe("Alice II");
      expect(seenPatch.name).toBe("Alice II");
    });

    it("assets.delete: round-trips id", async () => {
      const { ipcMain, invoke } = makeFakeIpc();
      let seen: string | null = null;
      registerIpcHandlers(ipcMain, {
        "assets.delete": async ({ id }) => {
          seen = id;
        },
      });
      const reply = (await invoke("assets.delete", { id: "a1" })) as { ok: true };
      expect(reply.ok).toBe(true);
      expect(seen).toBe("a1");
    });

    it("assets.archive: round-trips id (M8)", async () => {
      const { ipcMain, invoke } = makeFakeIpc();
      let seen: string | null = null;
      registerIpcHandlers(ipcMain, {
        "assets.archive": async ({ id }) => {
          seen = id;
        },
      });
      const reply = (await invoke("assets.archive", { id: "a1" })) as {
        ok: true;
      };
      expect(reply.ok).toBe(true);
      expect(seen).toBe("a1");
    });

    it("assets.restore: round-trips id (M8)", async () => {
      const { ipcMain, invoke } = makeFakeIpc();
      let seen: string | null = null;
      registerIpcHandlers(ipcMain, {
        "assets.restore": async ({ id }) => {
          seen = id;
        },
      });
      const reply = (await invoke("assets.restore", { id: "a1" })) as {
        ok: true;
      };
      expect(reply.ok).toBe(true);
      expect(seen).toBe("a1");
    });

    it("assets.list: archivedOnly returns archived items (M8)", async () => {
      const { ipcMain, invoke } = makeFakeIpc();
      let seenArchivedOnly: boolean | undefined;
      registerIpcHandlers(ipcMain, {
        "assets.list": async (q) => {
          seenArchivedOnly = q?.archivedOnly;
          return {
            items: [
              {
                ...stubAsset("trashed", "character"),
                archivedAt: 1_700_000_000_000,
              },
            ],
            total: 1,
          };
        },
      });
      const reply = (await invoke("assets.list", { archivedOnly: true })) as {
        ok: true;
        value: { items: Array<{ id: string }>; total: number };
      };
      expect(reply.ok).toBe(true);
      expect(seenArchivedOnly).toBe(true);
      expect(reply.value.total).toBe(1);
      expect(reply.value.items[0]?.id).toBe("trashed");
    });

    it("image.generate: accepts optional assetSlots", async () => {
      const { ipcMain, invoke } = makeFakeIpc();
      let seenSlots: unknown = null;
      registerIpcHandlers(ipcMain, {
        "image.generate": async (req) => {
          seenSlots = (req as { assetSlots?: unknown }).assetSlots;
          return {
            id: "g1",
            kind: "image",
            prompt: req.prompt,
            providerId: req.providerId,
            model: req.model,
            paramsJson: "{}",
            relPath: "x.png",
            bytes: 1,
            favorited: false,
            createdAt: 0,
          };
        },
      });
      const reply = (await invoke("image.generate", {
        prompt: "x",
        providerId: "openai",
        model: "gpt-image-1",
        count: 1,
        references: [],
        assetIds: [],
        assetSlots: { character: ["a1"], style: ["s1"] },
      })) as { ok: true };
      expect(reply.ok).toBe(true);
      expect(seenSlots).toEqual({ character: ["a1"], style: ["s1"] });
    });

    it("image.submit: returns { jobId } and accepts optional assetSlots", async () => {
      const { ipcMain, invoke } = makeFakeIpc();
      let seenSlots: unknown = null;
      registerIpcHandlers(ipcMain, {
        "image.submit": async (req) => {
          seenSlots = (req as { assetSlots?: unknown }).assetSlots;
          return { jobId: "job-1" };
        },
      });
      const reply = (await invoke("image.submit", {
        prompt: "x",
        providerId: "openai",
        model: "gpt-image-1",
        count: 1,
        references: [],
        assetIds: [],
        assetSlots: { character: ["a1"], style: ["s1"] },
      })) as { ok: true; value: { jobId: string } };
      expect(reply.ok).toBe(true);
      expect(reply.value.jobId).toBe("job-1");
      expect(seenSlots).toEqual({ character: ["a1"], style: ["s1"] });
    });
  });

  describe("Phase 8 routes — Audio", () => {
    it("audio.submit: returns { jobId } and accepts parentId", async () => {
      const { ipcMain, invoke } = makeFakeIpc();
      let seenParentId: string | undefined;
      registerIpcHandlers(ipcMain, {
        "audio.submit": async (req) => {
          seenParentId = req.parentId;
          return { jobId: "audio-job-1" };
        },
      });
      const reply = (await invoke("audio.submit", {
        prompt: "Narrate this",
        providerId: "elevenlabs",
        model: "eleven_multilingual_v2",
        voice: "voice-1",
        speed: 1,
        parentId: "parent-audio",
      })) as { ok: true; value: { jobId: string } };
      expect(reply.ok).toBe(true);
      expect(reply.value.jobId).toBe("audio-job-1");
      expect(seenParentId).toBe("parent-audio");
    });

    it("audio.models: returns provider defaults and audio model definitions", async () => {
      const { ipcMain, invoke } = makeFakeIpc();
      registerIpcHandlers(ipcMain, {
        "audio.models": async ({ providerId }) => ({
          providerId,
          defaultModel: "eleven_multilingual_v2",
          models: [
            {
              id: "eleven_multilingual_v2",
              displayName: "Eleven Multilingual v2",
              capabilities: {
                supportsVoiceDiscovery: true,
                outputFormats: ["mp3_44100_128"],
              },
            },
          ],
        }),
      });
      const reply = (await invoke("audio.models", { providerId: "elevenlabs" })) as {
        ok: true;
        value: { providerId: string; defaultModel: string | null; models: Array<{ id: string }> };
      };
      expect(reply.ok).toBe(true);
      expect(reply.value.providerId).toBe("elevenlabs");
      expect(reply.value.defaultModel).toBe("eleven_multilingual_v2");
      expect(reply.value.models[0]?.id).toBe("eleven_multilingual_v2");
    });

    it("audio.voices: returns voice discovery results for a provider and optional model", async () => {
      const { ipcMain, invoke } = makeFakeIpc();
      let seenModelId: string | undefined;
      registerIpcHandlers(ipcMain, {
        "audio.voices": async ({ modelId }) => {
          seenModelId = modelId;
          return {
            voices: [
              {
                id: "voice-1",
                name: "Narrator",
                previewUrl: "https://example.test/voice.mp3",
                labels: { accent: "neutral" },
              },
            ],
          };
        },
      });
      const reply = (await invoke("audio.voices", {
        providerId: "elevenlabs",
        modelId: "eleven_multilingual_v2",
      })) as { ok: true; value: { voices: Array<{ id: string; name: string }> } };
      expect(reply.ok).toBe(true);
      expect(seenModelId).toBe("eleven_multilingual_v2");
      expect(reply.value.voices[0]).toMatchObject({ id: "voice-1", name: "Narrator" });
    });

    it("models.list: preserves audio rows alongside image and video rows", async () => {
      const { ipcMain, invoke } = makeFakeIpc();
      registerIpcHandlers(ipcMain, {
        "models.list": async () => ({
          image: [],
          video: [],
          audio: [
            {
              id: "eleven_multilingual_v2",
              displayName: "Eleven Multilingual v2",
              providers: [
                {
                  providerId: "elevenlabs",
                  modelId: "eleven_multilingual_v2",
                  displayName: "Eleven Multilingual v2",
                  configured: true,
                },
              ],
            },
          ],
        }),
      });
      const reply = (await invoke("models.list", undefined)) as {
        ok: true;
        value: { audio?: Array<{ id: string }> };
      };
      expect(reply.ok).toBe(true);
      expect(reply.value.audio?.[0]?.id).toBe("eleven_multilingual_v2");
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

  describe("Phase 2 catalog routes", () => {
    it("catalog.path: returns the absolute file path", async () => {
      const { ipcMain, invoke } = makeFakeIpc();
      registerIpcHandlers(ipcMain, {
        "catalog.path": async () => ({ path: "/home/u/.imagent/catalog.json" }),
      });
      const reply = (await invoke("catalog.path", undefined)) as {
        ok: true;
        value: { path: string };
      };
      expect(reply.ok).toBe(true);
      expect(reply.value.path).toBe("/home/u/.imagent/catalog.json");
    });

    it("catalog.get: returns the loaded catalog snapshot", async () => {
      const { ipcMain, invoke } = makeFakeIpc();
      registerIpcHandlers(ipcMain, {
        "catalog.get": async () => ({
          version: 2 as const,
          models: {
            image: {
              "gpt-image-2": {
                id: "gpt-image-2",
                displayName: "GPT Image 2",
                capabilities: {
                  sizes: ["1024x1024"],
                  maxOutputs: 10,
                  supportsStyleRef: true,
                },
                defaults: { size: "1024x1024", count: 1 },
              },
            },
            video: {},
            audio: {},
          },
          providers: {
            openai: { image: [{ id: "gpt-image-2", modelId: "gpt-image-2" }] },
          },
        }),
      });
      const reply = (await invoke("catalog.get", undefined)) as {
        ok: true;
        value: { providers: { openai: { image: Array<{ id: string }> } } };
      };
      expect(reply.ok).toBe(true);
      expect(reply.value.providers.openai.image[0]?.id).toBe("gpt-image-2");
    });

    it("catalog.set: round-trips a valid catalog snapshot", async () => {
      const { ipcMain, invoke } = makeFakeIpc();
      const catalog = {
        version: 2 as const,
        models: {
          image: {
            "gpt-image-2": {
              id: "gpt-image-2",
              displayName: "GPT Image 2",
              capabilities: {
                sizes: ["1024x1024"],
                maxOutputs: 10,
                supportsStyleRef: true,
              },
              defaults: { size: "1024x1024", count: 1 },
            },
          },
          video: {},
          audio: {},
        },
        providers: {
          "custom-openai": {
            displayName: "Custom OpenAI",
            image: [{ id: "custom-gpt-image", modelId: "gpt-image-2" }],
          },
        },
      };
      registerIpcHandlers(ipcMain, {
        "catalog.set": async (input) => input,
      });
      const reply = (await invoke("catalog.set", catalog)) as {
        ok: true;
        value: { providers: { "custom-openai": { image: Array<{ id: string }> } } };
      };
      expect(reply.ok).toBe(true);
      expect(reply.value.providers["custom-openai"].image[0]?.id).toBe("custom-gpt-image");
    });
  });
});
