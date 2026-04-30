import { ProviderRequestError } from "../domain/errors.js";
import type { ImageModelDef, VideoModelDef } from "../domain/model.js";
import type { ImageRequest, VideoRequest } from "../domain/request.js";

/**
 * Validate an image request against a resolved model's capability surface.
 *
 * Throws `ProviderRequestError` (4xx-equivalent) on the first violation —
 * callers should validate BEFORE making the network call so the user sees a
 * precise message instead of a vendor's generic 400.
 *
 * Defaults injection: missing fields are filled from `model.defaults` upstream
 * (in the provider). This helper only checks the merged request.
 */
export function validateImageRequestAgainstModel(
  vendorId: string,
  req: ImageRequest,
  model: ImageModelDef,
): void {
  const caps = model.capabilities;
  if (!caps) return; // unknown caps = strict mode trusts the user

  if (caps.maxOutputs && req.count > caps.maxOutputs) {
    throw new ProviderRequestError(
      `model ${model.id} supports at most ${caps.maxOutputs} outputs (got ${req.count})`,
      { vendorId },
    );
  }

  if (req.size && caps.sizes && caps.sizes.length > 0 && !caps.sizes.includes(req.size)) {
    throw new ProviderRequestError(
      `model ${model.id} does not support size '${req.size}'. Supported: ${caps.sizes.join(", ")}`,
      { vendorId },
    );
  }

  if (
    req.aspectRatio &&
    caps.aspectRatios &&
    caps.aspectRatios.length > 0 &&
    !caps.aspectRatios.includes(req.aspectRatio)
  ) {
    throw new ProviderRequestError(
      `model ${model.id} does not support aspectRatio '${req.aspectRatio}'. ` +
        `Supported: ${caps.aspectRatios.join(", ")}`,
      { vendorId },
    );
  }

  if (caps.maxReferences !== undefined && req.references.length > caps.maxReferences) {
    throw new ProviderRequestError(
      `model ${model.id} accepts at most ${caps.maxReferences} reference images ` +
        `(got ${req.references.length})`,
      { vendorId },
    );
  }

  if (req.negativePrompt && caps.supportsNegativePrompt === false) {
    throw new ProviderRequestError(
      `model ${model.id} does not support negativePrompt`,
      { vendorId },
    );
  }

  if (req.seed !== undefined && caps.supportsSeed === false) {
    throw new ProviderRequestError(`model ${model.id} does not support seed`, { vendorId });
  }

  if (req.quality !== undefined) {
    if (!caps.qualities || caps.qualities.length === 0) {
      throw new ProviderRequestError(
        `model ${model.id} does not support a quality parameter`,
        { vendorId },
      );
    }
    if (!caps.qualities.includes(req.quality)) {
      throw new ProviderRequestError(
        `model ${model.id} does not support quality '${req.quality}'. ` +
          `Supported: ${caps.qualities.join(", ")}`,
        { vendorId },
      );
    }
  }

  if (req.outputFormat !== undefined) {
    if (!caps.outputFormats || caps.outputFormats.length === 0) {
      throw new ProviderRequestError(
        `model ${model.id} does not support an outputFormat parameter`,
        { vendorId },
      );
    }
    if (!caps.outputFormats.includes(req.outputFormat)) {
      throw new ProviderRequestError(
        `model ${model.id} does not support outputFormat '${req.outputFormat}'. ` +
          `Supported: ${caps.outputFormats.join(", ")}`,
        { vendorId },
      );
    }
  }
}

export function validateVideoRequestAgainstModel(
  vendorId: string,
  req: VideoRequest,
  model: VideoModelDef,
): void {
  const caps = model.capabilities;
  if (!caps) return;

  if (req.durationSec !== undefined) {
    if (caps.durationsSec && caps.durationsSec.length > 0 && !caps.durationsSec.includes(req.durationSec)) {
      throw new ProviderRequestError(
        `model ${model.id} only supports durations ${caps.durationsSec.join(",")}s (got ${req.durationSec}s)`,
        { vendorId },
      );
    }
    if (caps.maxDurationSec && req.durationSec > caps.maxDurationSec) {
      throw new ProviderRequestError(
        `model ${model.id} caps duration at ${caps.maxDurationSec}s (got ${req.durationSec}s)`,
        { vendorId },
      );
    }
  }

  if (
    req.fps !== undefined &&
    caps.fpsOptions &&
    caps.fpsOptions.length > 0 &&
    !caps.fpsOptions.includes(req.fps)
  ) {
    throw new ProviderRequestError(
      `model ${model.id} only supports fps ${caps.fpsOptions.join(",")} (got ${req.fps})`,
      { vendorId },
    );
  }

  if (
    req.resolution &&
    caps.resolutions &&
    caps.resolutions.length > 0 &&
    !caps.resolutions.includes(req.resolution)
  ) {
    throw new ProviderRequestError(
      `model ${model.id} does not support resolution '${req.resolution}'. ` +
        `Supported: ${caps.resolutions.join(", ")}`,
      { vendorId },
    );
  }

  if (req.firstFrame && caps.supportsFirstFrame === false) {
    throw new ProviderRequestError(`model ${model.id} does not support firstFrame`, { vendorId });
  }
  if (req.lastFrame && caps.supportsLastFrame === false) {
    throw new ProviderRequestError(`model ${model.id} does not support lastFrame`, { vendorId });
  }
  if (req.references.length > 0 && caps.supportsRefImages === false) {
    throw new ProviderRequestError(`model ${model.id} does not support reference images`, {
      vendorId,
    });
  }
}

/**
 * Apply the model's `defaults` to fields the user left blank. Returns a new
 * object — never mutates the input.
 */
export function applyImageDefaults(req: ImageRequest, model: ImageModelDef): ImageRequest {
  const d = (model.defaults ?? {}) as {
    size?: string;
    aspectRatio?: string;
    quality?: string;
    outputFormat?: string;
    count?: number;
  };
  return {
    ...req,
    size: req.size ?? d.size,
    aspectRatio: req.aspectRatio ?? d.aspectRatio,
    quality: req.quality ?? d.quality,
    outputFormat: req.outputFormat ?? d.outputFormat,
    count: req.count || d.count || 1,
  };
}

export function applyVideoDefaults(req: VideoRequest, model: VideoModelDef): VideoRequest {
  const d = (model.defaults ?? {}) as {
    durationSec?: number;
    fps?: number;
    resolution?: string;
    aspectRatio?: string;
  };
  return {
    ...req,
    durationSec: req.durationSec ?? d.durationSec,
    fps: req.fps ?? d.fps,
    resolution: req.resolution ?? d.resolution,
    aspectRatio: req.aspectRatio ?? d.aspectRatio,
  };
}
