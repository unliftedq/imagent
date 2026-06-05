import { describe, expect, it, vi } from "vitest";
import type { GalleryItem } from "../domain/gallery.js";
import type { Job } from "../domain/job.js";
import type { AudioProvider } from "../ports/audio-provider.js";
import { JobRunner } from "./job-runner.js";

function makeDeps(audioProvider: AudioProvider) {
  const created: GalleryItem[] = [];
  const jobs = new Map<string, Job>();
  let seq = 0;
  return {
    created,
    deps: {
      jobs: {
        create: (j: Job) => (jobs.set(j.id, j), j),
        get: (id: string) => jobs.get(id) ?? null,
        updateState: (id: string, patch: Partial<Job>) => {
          const j = { ...(jobs.get(id) as Job), ...patch } as Job;
          jobs.set(id, j);
          return j;
        },
        listByStates: () => [],
      },
      gallery: { create: (i: GalleryItem) => (created.push(i), i) },
      files: {
        dataDir: "/data",
        galleryDir: () => "/data/gallery",
        galleryItemFile: (id: string, ext: string) => `/data/gallery/${id}.${ext}`,
      },
      imageRegistry: new Map(),
      videoRegistry: new Map(),
      audioRegistry: new Map([[audioProvider.id, audioProvider]]),
      writeFile: vi.fn(async () => {}),
      ensureDir: vi.fn(async () => {}),
      idFactory: () => `id-${seq++}`,
      now: () => 1_000,
    },
  };
}

describe("JobRunner audio", () => {
  it("generates audio, writes bytes, creates an audio gallery item", async () => {
    const provider: AudioProvider = {
      id: "elevenlabs",
      displayName: "ElevenLabs",
      capabilities: { outputFormats: ["mp3_44100_128"], supportsVoiceDiscovery: true },
      models: new Map(),
      async generate() {
        return {
          output: { bytes: new Uint8Array([1, 2]), mimeType: "audio/mpeg", durationMs: 900 },
        };
      },
    };
    const { created, deps } = makeDeps(provider);
    const runner = new JobRunner(deps as never);
    const completed = new Promise<Job>((res) => runner.once("job.completed", res));
    await runner.start({
      kind: "audio",
      request: { prompt: "hi", providerId: "elevenlabs", model: "tts", assetIds: [] },
    });
    const job = await completed;
    expect(job.state).toBe("succeeded");
    expect(created).toHaveLength(1);
    expect(created[0]?.kind).toBe("audio");
    expect(created[0]?.durationMs).toBe(900);
    expect(deps.writeFile).toHaveBeenCalledWith("/data/gallery/id-1.mp3", new Uint8Array([1, 2]));
  });

  it("maps audio/wav to .wav", async () => {
    const provider: AudioProvider = {
      id: "elevenlabs",
      displayName: "ElevenLabs",
      capabilities: { outputFormats: ["wav_44100"], supportsVoiceDiscovery: true },
      models: new Map(),
      async generate() {
        return { output: { bytes: new Uint8Array([9]), mimeType: "audio/wav" } };
      },
    };
    const { deps } = makeDeps(provider);
    const runner = new JobRunner(deps as never);
    const done = new Promise((res) => runner.once("job.completed", res));
    await runner.start({
      kind: "audio",
      request: { prompt: "hi", providerId: "elevenlabs", model: "tts", assetIds: [] },
    });
    await done;
    expect(deps.writeFile).toHaveBeenCalledWith("/data/gallery/id-1.wav", new Uint8Array([9]));
  });

  it("maps audio/x-wav to .wav", async () => {
    const provider: AudioProvider = {
      id: "elevenlabs",
      displayName: "ElevenLabs",
      capabilities: { outputFormats: ["wav_44100"], supportsVoiceDiscovery: true },
      models: new Map(),
      async generate() {
        return { output: { bytes: new Uint8Array([9]), mimeType: "audio/x-wav" } };
      },
    };
    const { deps } = makeDeps(provider);
    const runner = new JobRunner(deps as never);
    const done = new Promise((res) => runner.once("job.completed", res));
    await runner.start({
      kind: "audio",
      request: { prompt: "hi", providerId: "elevenlabs", model: "tts", assetIds: [] },
    });
    await done;
    expect(deps.writeFile).toHaveBeenCalledWith("/data/gallery/id-1.wav", new Uint8Array([9]));
  });
});
