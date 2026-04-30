import { describe, expect, it } from "vitest";
import { ProviderRequestError } from "../domain/errors.js";
import type { ImageModelDef, VideoModelDef } from "../domain/model.js";
import type { ImageRequest, VideoRequest } from "../domain/request.js";
import {
  applyImageDefaults,
  applyVideoDefaults,
  validateImageRequestAgainstModel,
  validateVideoRequestAgainstModel,
} from "./validate.js";

const imageModel: ImageModelDef = {
  id: "gpt-image-1",
  capabilities: {
    sizes: ["1024x1024", "1024x1536"],
    qualities: ["low", "medium", "high", "auto"],
    maxReferences: 4,
    maxOutputs: 4,
    supportsNegativePrompt: false,
    supportsSeed: false,
    supportsStyleRef: true,
  },
  defaults: { size: "1024x1024", count: 1 },
};

const imageModelNoQuality: ImageModelDef = {
  id: "no-quality-model",
  capabilities: {
    sizes: ["1024x1024"],
    maxReferences: 0,
    maxOutputs: 1,
    supportsNegativePrompt: false,
    supportsSeed: false,
    supportsStyleRef: false,
  },
};

function imageRequest(over: Partial<ImageRequest> = {}): ImageRequest {
  return {
    prompt: "x",
    providerId: "openai",
    model: "gpt-image-1",
    count: 1,
    references: [],
    assetIds: [],
    ...over,
  };
}

const videoModel: VideoModelDef = {
  id: "seedance-1.0-pro",
  capabilities: {
    durationsSec: [5, 10],
    maxDurationSec: 10,
    fpsOptions: [24],
    resolutions: ["720p", "1080p"],
    supportsFirstFrame: true,
    supportsLastFrame: false,
    supportsRefImages: true,
  },
};

function videoRequest(over: Partial<VideoRequest> = {}): VideoRequest {
  return {
    prompt: "x",
    providerId: "seedance",
    model: "seedance-1.0-pro",
    references: [],
    assetIds: [],
    ...over,
  };
}

describe("validateImageRequestAgainstModel", () => {
  it("accepts a request within caps", () => {
    expect(() =>
      validateImageRequestAgainstModel("openai", imageRequest({ size: "1024x1024", count: 4 }), imageModel),
    ).not.toThrow();
  });

  it("rejects count over maxOutputs", () => {
    expect(() =>
      validateImageRequestAgainstModel("openai", imageRequest({ count: 99 }), imageModel),
    ).toThrow(ProviderRequestError);
  });

  it("rejects unknown size", () => {
    expect(() =>
      validateImageRequestAgainstModel("openai", imageRequest({ size: "9999x9999" }), imageModel),
    ).toThrow(ProviderRequestError);
  });

  it("rejects too many references", () => {
    expect(() =>
      validateImageRequestAgainstModel(
        "openai",
        imageRequest({ references: Array(5).fill({ path: "x", role: "freeform" }) }),
        imageModel,
      ),
    ).toThrow(ProviderRequestError);
  });

  it("rejects negativePrompt when not supported", () => {
    expect(() =>
      validateImageRequestAgainstModel(
        "openai",
        imageRequest({ negativePrompt: "ugly" }),
        imageModel,
      ),
    ).toThrow(ProviderRequestError);
  });

  it("accepts a quality value present in the supported list", () => {
    expect(() =>
      validateImageRequestAgainstModel(
        "openai",
        imageRequest({ quality: "high" }),
        imageModel,
      ),
    ).not.toThrow();
  });

  it("rejects a quality value not in the supported list", () => {
    expect(() =>
      validateImageRequestAgainstModel(
        "openai",
        imageRequest({ quality: "ultra" }),
        imageModel,
      ),
    ).toThrow(/quality 'ultra'/);
  });

  it("rejects quality when the model declares no qualities", () => {
    expect(() =>
      validateImageRequestAgainstModel(
        "openai",
        imageRequest({ quality: "high", model: "no-quality-model" }),
        imageModelNoQuality,
      ),
    ).toThrow(/does not support a quality parameter/);
  });
});

describe("validateVideoRequestAgainstModel", () => {
  it("accepts a request within caps", () => {
    expect(() =>
      validateVideoRequestAgainstModel(
        "seedance",
        videoRequest({ durationSec: 5, fps: 24, resolution: "720p" }),
        videoModel,
      ),
    ).not.toThrow();
  });

  it("rejects duration not in supported list", () => {
    expect(() =>
      validateVideoRequestAgainstModel("seedance", videoRequest({ durationSec: 7 }), videoModel),
    ).toThrow(ProviderRequestError);
  });

  it("rejects unsupported resolution", () => {
    expect(() =>
      validateVideoRequestAgainstModel(
        "seedance",
        videoRequest({ resolution: "4k" }),
        videoModel,
      ),
    ).toThrow(ProviderRequestError);
  });
});

describe("apply defaults", () => {
  it("fills missing image fields from model.defaults", () => {
    const out = applyImageDefaults(imageRequest({}), imageModel);
    expect(out.size).toBe("1024x1024");
    expect(out.count).toBe(1);
  });

  it("preserves user-provided fields", () => {
    const out = applyImageDefaults(imageRequest({ size: "1024x1536", count: 2 }), imageModel);
    expect(out.size).toBe("1024x1536");
    expect(out.count).toBe(2);
  });

  it("fills missing video fields from model.defaults", () => {
    const m: VideoModelDef = {
      ...videoModel,
      defaults: { durationSec: 10, fps: 24, resolution: "1080p" },
    };
    const out = applyVideoDefaults(videoRequest({}), m);
    expect(out.durationSec).toBe(10);
    expect(out.fps).toBe(24);
    expect(out.resolution).toBe("1080p");
  });
});
