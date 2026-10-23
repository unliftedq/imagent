import { describe, expect, it } from "vitest";
import { getBundledCatalog } from "./loader.js";
import {
  resolveImageProviderModels,
  resolveSpeechProviderModels,
  resolveVideoProviderModels,
} from "./resolve.js";

describe("2026-10 bundled catalog", () => {
  const catalog = getBundledCatalog();

  it("resolves every offering against a canonical model without duplicates", () => {
    for (const id of Object.keys(catalog.providers)) {
      for (const resolve of [
        resolveImageProviderModels,
        resolveVideoProviderModels,
        resolveSpeechProviderModels,
      ]) {
        const models = resolve(catalog, id);
        expect(new Set(models.map((model) => model.id)).size).toBe(models.length);
      }
    }
  });

  it("includes GPT Image 2.5 quality and size controls", () => {
    for (const id of ["gpt-image-2.5-sunburst", "gpt-image-2.5-flare"]) {
      const model = resolveImageProviderModels(catalog, "openai").find((model) => model.id === id);
      expect(model?.capabilities?.qualities).toEqual(["low", "medium", "high", "xhigh", "max"]);
      expect(model?.capabilities?.maxReferences).toBe(16);
      expect(model?.capabilities?.maxPixels).toBe(8294400);
      // OpenAI availability does not establish Azure deployment support.
      expect(catalog.providers.azure?.image).toBeUndefined();
    }
  });

  it("exposes current Google image, video and speech models", () => {
    expect(catalog.providers.google?.image?.map((model) => model.id)).toEqual([
      "gemini-nano-banana-2.1",
      "gemini-3-pro-image",
      "gemini-3.1-flash-lite-image",
    ]);
    expect(catalog.models.image["gemini-nano-banana-2.1"]?.capabilities?.maxReferences).toBe(14);
    expect(catalog.models.image["gemini-3.1-flash-lite-image"]?.capabilities?.qualities).toEqual([
      "512",
      "1K",
    ]);
    expect(catalog.models.video["gemini-omni-1.1-flash"]?.capabilities?.durationsSec).toEqual([
      3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(catalog.providers.google?.video?.map((model) => model.id)).toContain(
      "veo-3.1-fast-generate-preview",
    );
    expect(catalog.providers.google?.speech?.map((model) => model.id)).toEqual([
      "gemini-3.8-flash-tts",
      "gemini-3.8-flash-lite-tts",
    ]);
  });

  it("removes legacy canonical models and their regional offerings", () => {
    const retired = [
      "gemini-2.5-flash-image",
      "gemini-3.1-flash-image-preview",
      "gemini-3-pro-image-preview",
      "gemini-3.1-flash-tts-preview",
      "veo-3.0-generate-001",
      "veo-3.0-fast-generate-001",
      "seedream-4-5-251128",
      "seedream-4-0-250828",
      "seedance-1-5-pro-251215",
    ];
    const canonical = {
      ...catalog.models.image,
      ...catalog.models.video,
      ...catalog.models.speech,
    };
    for (const id of retired) {
      expect(canonical[id]).toBeUndefined();
      for (const provider of Object.values(catalog.providers)) {
        for (const offering of [
          ...(provider.image ?? []),
          ...(provider.video ?? []),
          ...(provider.speech ?? []),
        ]) {
          expect(offering.modelId).not.toBe(id);
        }
      }
    }
    expect(catalog.providers.volcengine?.image?.map((model) => model.id)).not.toContain(
      "doubao-seedream-4-5-251128",
    );
    expect(catalog.providers.volcengine?.video?.map((model) => model.id)).not.toContain(
      "doubao-seedance-1-5-pro-251215",
    );
  });

  it("retains older models that official sources still list as active", () => {
    expect(catalog.models.image["gpt-image-1-mini"]).toBeDefined();
    expect(catalog.models.image["grok-imagine-image-quality"]).toBeDefined();
    expect(catalog.models.speech.eleven_multilingual_v2).toBeDefined();
    expect(catalog.models.speech.eleven_v3?.displayName).toBe("ElevenLabs v3");
  });
});
