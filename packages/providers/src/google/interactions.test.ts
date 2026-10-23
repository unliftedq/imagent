import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Interactions } from "@google/genai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getBundledCatalog } from "../catalog/loader.js";
import {
  resolveImageProviderModels,
  resolveSpeechProviderModels,
  resolveVideoProviderModels,
} from "../catalog/resolve.js";
import { GoogleImageProvider } from "./image.js";
import type { GoogleInteractionsClientLike } from "./interactions.js";
import { GoogleSpeechProvider, pcmToWav } from "./speech.js";
import { GoogleVideoProvider } from "./video.js";

const catalog = getBundledCatalog();
const PNG_B64 = "iVBORw0KGgo=";

afterEach(() => vi.restoreAllMocks());

function fetchRequest(call: Parameters<typeof globalThis.fetch> | undefined): Request {
  if (!call) throw new Error("Interactions SDK did not send a request");
  const [input, init] = call;
  return input instanceof Request ? input.clone() : new Request(input, init);
}

function interaction(content: Interactions.Content[]): Interactions.Interaction {
  return {
    id: "test-interaction",
    status: "completed",
    steps: [{ type: "model_output", content }],
  };
}

function imageProvider(create: GoogleInteractionsClientLike["create"]) {
  return new GoogleImageProvider({
    apiKey: "test",
    models: new Map(
      resolveImageProviderModels(catalog, "google").map((model) => [model.id, model]),
    ),
    client: { models: {}, interactions: { create } },
  });
}

describe("Google image Interactions", () => {
  it.each([
    "gemini-nano-banana-2.1",
    "gemini-3-pro-image",
    "gemini-3.1-flash-lite-image",
  ])("%s sends current image formatting and decodes model_output steps", async (model) => {
    const create = vi
      .fn()
      .mockResolvedValue(interaction([{ type: "image", data: PNG_B64, mime_type: "image/png" }]));
    const controller = new AbortController();
    const result = await imageProvider(create).generate(
      {
        model,
        providerId: "google",
        prompt: "cat",
        count: 1,
        references: [],
        assetIds: [],
      },
      controller.signal,
    );
    expect(result.outputs[0]?.bytes).toEqual(new Uint8Array(Buffer.from(PNG_B64, "base64")));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model,
        store: false,
        response_format: {
          type: "image",
          delivery: "inline",
          aspect_ratio: "1:1",
          image_size: "1K",
        },
      }),
      { signal: controller.signal },
    );
  });

  it("keeps reference order, MIME types and prompt roles", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "imagent-interactions-"));
    try {
      const file = path.join(dir, "ref.png");
      await writeFile(file, Buffer.from(PNG_B64, "base64"));
      const create = vi
        .fn()
        .mockResolvedValue(interaction([{ type: "image", data: PNG_B64, mime_type: "image/png" }]));
      await imageProvider(create).generate({
        model: "gemini-nano-banana-2.1",
        providerId: "google",
        prompt: "cat",
        count: 1,
        references: [{ path: file, role: "character" }],
        assetIds: [],
      });
      expect(create.mock.calls[0]?.[0].input).toEqual([
        { type: "text", text: expect.stringContaining("role: character") },
        { type: "image", data: PNG_B64, mime_type: "image/png" },
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it.each([
    { id: "i", status: "failed", errors: [{ message: "blocked" }] },
    { id: "i", status: "completed", steps: [] },
  ])("rejects unsuccessful or empty responses", async (response) => {
    await expect(
      imageProvider(vi.fn().mockResolvedValue(response)).generate({
        model: "gemini-nano-banana-2.1",
        providerId: "google",
        prompt: "cat",
        count: 1,
        references: [],
        assetIds: [],
      }),
    ).rejects.toThrow(/blocked|no image/);
  });

  it("uses the real SDK Interactions transport rather than generateContent", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify(interaction([{ type: "image", data: PNG_B64, mime_type: "image/png" }])),
          { headers: { "content-type": "application/json" } },
        ),
      );
    const provider = new GoogleImageProvider({
      apiKey: "test",
      models: new Map(
        resolveImageProviderModels(catalog, "google").map((model) => [model.id, model]),
      ),
    });
    await provider.generate({
      model: "gemini-nano-banana-2.1",
      providerId: "google",
      prompt: "cat",
      count: 1,
      references: [],
      assetIds: [],
    });
    const sent = fetchRequest(fetch.mock.calls[0]);
    expect(sent.url).toContain("/interactions");
    expect(await sent.json()).toMatchObject({
      model: "gemini-nano-banana-2.1",
      response_format: { type: "image", image_size: "1K" },
    });
  });
});

describe("Google 3.8 speech Interactions", () => {
  function provider(create: GoogleInteractionsClientLike["create"]) {
    return new GoogleSpeechProvider({
      apiKey: "test",
      models: new Map(
        resolveSpeechProviderModels(catalog, "google").map((model) => [model.id, model]),
      ),
      client: { models: {}, interactions: { create } },
    });
  }
  const request = {
    model: "gemini-3.8-flash-tts",
    providerId: "google",
    prompt: "Hello",
    assetIds: [],
  };

  it("synthesizes through the real SDK using the current audio request schema", async () => {
    const wav = pcmToWav(new Uint8Array([0, 1]), 24000);
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify(
            interaction([
              { type: "audio", data: Buffer.from(wav).toString("base64"), mime_type: "audio/wav" },
            ]),
          ),
          { headers: { "content-type": "application/json" } },
        ),
      );
    const instance = new GoogleSpeechProvider({
      apiKey: "test",
      models: new Map(
        resolveSpeechProviderModels(catalog, "google").map((model) => [model.id, model]),
      ),
    });
    expect((await instance.synthesize(request)).output.bytes).toEqual(wav);
    const body = await fetchRequest(fetch.mock.calls[0]).json();
    expect(body).toMatchObject({
      model: request.model,
      input: request.prompt,
      store: false,
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice: "Zephyr" }] },
    });
  });

  it.each([
    "gemini-3.8-flash-tts",
    "gemini-3.8-flash-lite-tts",
  ])("%s preserves native WAV without adding a second header", async (model) => {
    const wav = pcmToWav(new Uint8Array([0, 1, 2, 3]), 24000);
    const create = vi
      .fn()
      .mockResolvedValue(
        interaction([
          { type: "audio", data: Buffer.from(wav).toString("base64"), mime_type: "audio/wav" },
        ]),
      );
    const result = await provider(create).synthesize({ ...request, model });
    expect(result.output.bytes).toEqual(wav);
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      input: "Hello",
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice: "Zephyr" }] },
    });
  });

  it("wraps explicit PCM using returned sample rate", async () => {
    const create = vi.fn().mockResolvedValue(
      interaction([
        {
          type: "audio",
          data: "AAECAw==",
          mime_type: "audio/l16",
          sample_rate: 16000,
          channels: 1,
        },
      ]),
    );
    const result = await provider(create).synthesize(request);
    expect(result.output.bytes.byteLength).toBe(48);
    expect(new DataView(result.output.bytes.buffer).getUint32(24, true)).toBe(16000);
  });

  it.each([0, -1, 1.5])("rejects invalid PCM sample rate %s", async (sampleRate) => {
    const create = vi
      .fn()
      .mockResolvedValue(
        interaction([
          { type: "audio", data: "AAE=", mime_type: "audio/l16", sample_rate: sampleRate },
        ]),
      );
    await expect(provider(create).synthesize(request)).rejects.toThrow(/invalid PCM sample rate/);
  });

  it.each([
    { type: "audio", data: "AAE=", mime_type: "audio/mp3" },
    { type: "audio", data: "AAE=", mime_type: "audio/l16", channels: 2 },
    { type: "audio", mime_type: "audio/wav" },
  ] satisfies Interactions.Content[])("rejects unsupported or empty audio", async (audio) => {
    await expect(
      provider(vi.fn().mockResolvedValue(interaction([audio]))).synthesize(request),
    ).rejects.toThrow(/unsupported|no audio/);
  });
});

describe("Google Omni video Interactions", () => {
  function provider(interactions: GoogleInteractionsClientLike, fetch?: typeof globalThis.fetch) {
    return new GoogleVideoProvider({
      apiKey: "test",
      models: new Map(
        resolveVideoProviderModels(catalog, "google").map((model) => [model.id, model]),
      ),
      client: { models: {}, operations: { getVideosOperation: vi.fn() }, interactions },
      ...(fetch ? { fetch } : {}),
    });
  }
  const handle = { providerId: "google", providerJobId: "interaction:test-interaction" };

  it("uses real SDK create/get/cancel endpoints for background video jobs", async () => {
    const response = (body: unknown) =>
      new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json" },
      });
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response({ id: "test-interaction", status: "in_progress" }))
      .mockResolvedValueOnce(
        response(interaction([{ type: "video", data: "AQI=", mime_type: "video/mp4" }])),
      )
      .mockResolvedValueOnce(response({ id: "test-interaction", status: "cancelled" }));
    const instance = new GoogleVideoProvider({
      apiKey: "test",
      models: new Map(
        resolveVideoProviderModels(catalog, "google").map((model) => [model.id, model]),
      ),
    });
    expect(
      await instance.submit({
        model: "gemini-omni-1.1-flash",
        providerId: "google",
        prompt: "cat",
        references: [],
        assetIds: [],
      }),
    ).toEqual(handle);
    expect((await instance.fetch(handle)).output.bytes).toEqual(new Uint8Array([1, 2]));
    await instance.cancel(handle);
    expect(await fetchRequest(fetch.mock.calls[0]).json()).toMatchObject({
      background: true,
      store: true,
      response_format: { type: "video", duration: "5s", resolution: "720p" },
    });
    expect(fetchRequest(fetch.mock.calls[1]).url).toContain("/interactions/test-interaction");
    expect(fetchRequest(fetch.mock.calls[2]).url).toContain(
      "/interactions/test-interaction/cancel",
    );
  });

  it("submits, resumes polling, downloads and cancels a persisted interaction", async () => {
    const interactions = {
      create: vi.fn().mockResolvedValue({ id: "test-interaction", status: "in_progress" }),
      get: vi
        .fn()
        .mockResolvedValueOnce({ id: "test-interaction", status: "in_progress" })
        .mockResolvedValueOnce(
          interaction([
            { type: "video", uri: "https://generativelanguage.googleapis.com/v1beta/files/video" },
          ]),
        ),
      cancel: vi.fn().mockResolvedValue({ id: "test-interaction", status: "cancelled" }),
    };
    const fetch = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2]), {
        headers: { "content-type": "video/mp4" },
      }),
    );
    const instance = provider(interactions, fetch);
    expect(
      await instance.submit({
        model: "gemini-omni-1.1-flash",
        providerId: "google",
        prompt: "cat",
        durationSec: 5,
        resolution: "1080p",
        raw: { seed: 42 },
        references: [],
        assetIds: [],
      }),
    ).toEqual(handle);
    expect(interactions.create.mock.calls[0]?.[0]).toMatchObject({
      background: true,
      store: true,
      generation_config: { seed: 42 },
      response_format: { type: "video", delivery: "uri", duration: "5s", resolution: "1080p" },
    });
    expect((await instance.poll(handle)).state).toBe("running");
    // A fresh provider can fetch the same handle, without an in-memory job map.
    expect((await provider(interactions, fetch).fetch(handle)).output.bytes).toEqual(
      new Uint8Array([1, 2]),
    );
    expect(String(fetch.mock.calls[0]?.[0])).toContain("alt=media");
    await instance.cancel(handle);
    expect(interactions.cancel).toHaveBeenCalledWith("test-interaction");
  });

  it("downloads externally hosted video without changing its signature or forwarding API keys", async () => {
    const uri = "https://media.example/video.mp4?signature=opaque";
    const fetch = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2]), {
        headers: { "content-type": "video/mp4" },
      }),
    );
    const instance = provider(
      {
        create: vi.fn(),
        get: vi.fn().mockResolvedValue(interaction([{ type: "video", uri }])),
      },
      fetch,
    );
    await instance.fetch(handle);
    expect(String(fetch.mock.calls[0]?.[0])).toBe(uri);
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).has("x-goog-api-key")).toBe(false);
  });

  it.each([
    "queued",
    "completed",
    "failed",
    "cancelled",
    "incomplete",
    "requires_action",
  ])("maps %s explicitly", async (status) => {
    const instance = provider({
      create: vi.fn(),
      get: vi.fn().mockResolvedValue({ id: "test-interaction", status }),
      cancel: vi.fn(),
    });
    const expected =
      status === "completed"
        ? "succeeded"
        : status === "queued" || status === "cancelled"
          ? status
          : "failed";
    expect((await instance.poll(handle)).state).toBe(expected);
    if (status !== "completed") await expect(instance.fetch(handle)).rejects.toThrow();
  });
});
