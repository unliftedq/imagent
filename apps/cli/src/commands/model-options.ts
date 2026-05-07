import type { ImageModelDef, VideoModelDef } from "@imagent/core";

export interface OptionDescriptor {
  key: string;
  aliases?: string[];
  type: "string" | "number" | "integer";
  values?: Array<string | number>;
  min?: number;
  max?: number;
  default?: unknown;
  description: string;
}

export function supportedImageOptions(model: ImageModelDef): string[] {
  return describeImageOptions(model).map((option) => option.key);
}

export function supportedVideoOptions(model: VideoModelDef): string[] {
  return describeVideoOptions(model).map((option) => option.key);
}

export function describeImageOptions(model: ImageModelDef): OptionDescriptor[] {
  const caps = model.capabilities;
  const defaults = (model.defaults ?? {}) as Record<string, unknown>;
  if (!caps) {
    return [
      option(
        "size",
        "string",
        "Image size, usually WIDTHxHEIGHT or a provider token",
        defaults.size,
        {
          aliases: [],
        },
      ),
      option("aspectRatio", "string", "Image aspect ratio", defaults.aspectRatio, {
        aliases: ["aspect"],
      }),
      option("quality", "string", "Provider quality preset", defaults.quality),
      option("outputFormat", "string", "Output image format", defaults.outputFormat, {
        aliases: ["format"],
      }),
      option("negativePrompt", "string", "Negative prompt text", defaults.negativePrompt, {
        aliases: ["negative"],
      }),
      option("seed", "integer", "Deterministic seed", defaults.seed, { min: 1 }),
      option("count", "integer", "Number of images to generate", defaults.count ?? 1, { min: 1 }),
    ];
  }

  const out: OptionDescriptor[] = [
    option("count", "integer", "Number of images to generate", defaults.count ?? 1, {
      min: 1,
      max: caps.maxOutputs,
    }),
  ];
  if (caps.sizes && caps.sizes.length > 0) {
    out.push(
      option("size", "string", "Image size", defaults.size, {
        values: caps.sizes,
        descriptionSuffix: caps.supportsArbitrarySize
          ? "; arbitrary WIDTHxHEIGHT is also accepted"
          : "",
      }),
    );
  } else if (caps.supportsArbitrarySize) {
    out.push(
      option("size", "string", "Arbitrary image size in WIDTHxHEIGHT format", defaults.size),
    );
  }
  if (caps.aspectRatios && caps.aspectRatios.length > 0) {
    out.push(
      option("aspectRatio", "string", "Image aspect ratio", defaults.aspectRatio, {
        aliases: ["aspect"],
        values: caps.aspectRatios,
      }),
    );
  }
  if (caps.qualities && caps.qualities.length > 0) {
    out.push(
      option("quality", "string", "Provider quality preset", defaults.quality, {
        values: caps.qualities,
      }),
    );
  }
  if (caps.outputFormats && caps.outputFormats.length > 0) {
    out.push(
      option("outputFormat", "string", "Output image format", defaults.outputFormat, {
        aliases: ["format"],
        values: caps.outputFormats,
      }),
    );
  }
  if (caps.supportsNegativePrompt) {
    out.push(
      option("negativePrompt", "string", "Negative prompt text", defaults.negativePrompt, {
        aliases: ["negative"],
      }),
    );
  }
  if (caps.supportsSeed) {
    out.push(option("seed", "integer", "Deterministic seed", defaults.seed, { min: 1 }));
  }
  return out;
}

export function describeVideoOptions(model: VideoModelDef): OptionDescriptor[] {
  const caps = model.capabilities;
  const defaults = (model.defaults ?? {}) as Record<string, unknown>;
  if (!caps) {
    return [
      option("durationSec", "number", "Video duration in seconds", defaults.durationSec, {
        aliases: ["duration"],
        min: 0,
      }),
      option("fps", "number", "Frames per second", defaults.fps, { min: 0 }),
      option("resolution", "string", "Output resolution", defaults.resolution),
      option("aspectRatio", "string", "Video aspect ratio", defaults.aspectRatio, {
        aliases: ["aspect"],
      }),
      option("firstFrame", "string", "Path to first-frame image", defaults.firstFrame),
      option("lastFrame", "string", "Path to last-frame image", defaults.lastFrame),
      option("negativePrompt", "string", "Negative prompt text", defaults.negativePrompt, {
        aliases: ["negative"],
      }),
    ];
  }

  const out: OptionDescriptor[] = [];
  if (caps.durationsSec && caps.durationsSec.length > 0) {
    out.push(
      option("durationSec", "number", "Video duration in seconds", defaults.durationSec, {
        aliases: ["duration"],
        values: caps.durationsSec,
        max: caps.maxDurationSec,
      }),
    );
  } else if (caps.maxDurationSec) {
    out.push(
      option("durationSec", "number", "Video duration in seconds", defaults.durationSec, {
        aliases: ["duration"],
        min: 0,
        max: caps.maxDurationSec,
      }),
    );
  }
  if (caps.fpsOptions && caps.fpsOptions.length > 0) {
    out.push(
      option("fps", "number", "Frames per second", defaults.fps, { values: caps.fpsOptions }),
    );
  }
  if (caps.resolutions && caps.resolutions.length > 0) {
    out.push(
      option("resolution", "string", "Output resolution", defaults.resolution, {
        values: caps.resolutions,
      }),
    );
  }
  if (caps.aspectRatios && caps.aspectRatios.length > 0) {
    out.push(
      option("aspectRatio", "string", "Video aspect ratio", defaults.aspectRatio, {
        aliases: ["aspect"],
        values: caps.aspectRatios,
      }),
    );
  }
  if (caps.supportsFirstFrame) {
    out.push(option("firstFrame", "string", "Path to first-frame image", defaults.firstFrame));
  }
  if (caps.supportsLastFrame) {
    out.push(option("lastFrame", "string", "Path to last-frame image", defaults.lastFrame));
  }
  return out;
}

function option(
  key: string,
  type: OptionDescriptor["type"],
  description: string,
  defaultValue: unknown,
  opts: Partial<Omit<OptionDescriptor, "key" | "type" | "description" | "default">> & {
    descriptionSuffix?: string;
  } = {},
): OptionDescriptor {
  const { descriptionSuffix = "", ...rest } = opts;
  return {
    key,
    type,
    description: `${description}${descriptionSuffix}`,
    ...(defaultValue !== undefined ? { default: defaultValue } : {}),
    ...rest,
  };
}
