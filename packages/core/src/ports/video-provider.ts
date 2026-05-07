import type { VideoModelDef } from "../domain/model.js";
import type { VideoRequest } from "../domain/request.js";
import type {
  VideoGenerationResult,
  VideoJobHandle,
  VideoJobStatus,
} from "../domain/result.js";
import type { ProviderTestResult } from "./image-provider.js";

export interface VideoCapabilities {
  readonly durationsSec: readonly number[];
  readonly maxDurationSec: number;
  readonly fpsOptions: readonly number[];
  readonly resolutions: readonly string[];
  readonly aspectRatios?: readonly string[];
  readonly maxReferences?: number;
  readonly maxReferenceSizeMb?: number;
  readonly supportsFirstFrame: boolean;
  readonly supportsLastFrame: boolean;
  readonly supportsRefImages: boolean;
}

export interface VideoProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: VideoCapabilities;
  readonly models: ReadonlyMap<string, VideoModelDef>;
  submit(req: VideoRequest): Promise<VideoJobHandle>;
  poll(handle: VideoJobHandle): Promise<VideoJobStatus>;
  fetch(handle: VideoJobHandle): Promise<VideoGenerationResult>;
  cancel?(handle: VideoJobHandle): Promise<void>;
  /**
   * Optional minimal authenticated probe. Same contract as ImageProvider.test:
   * never throws, returns `{ ok: false, reason }` on any failure.
   */
  test?(signal?: AbortSignal): Promise<ProviderTestResult>;
}

export type { VideoJobHandle, VideoJobStatus, VideoGenerationResult };
export { VideoJobStateSchema } from "../domain/result.js";
export type { VideoJobState } from "../domain/result.js";
