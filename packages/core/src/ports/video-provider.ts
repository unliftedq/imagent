import type { VideoModelDef } from "../domain/model.js";
import type { VideoRequest } from "../domain/request.js";
import type {
  VideoGenerationResult,
  VideoJobHandle,
  VideoJobStatus,
} from "../domain/result.js";

export interface VideoCapabilities {
  readonly durationsSec: readonly number[];
  readonly maxDurationSec: number;
  readonly fpsOptions: readonly number[];
  readonly resolutions: readonly string[];
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
}

export type { VideoJobHandle, VideoJobStatus, VideoGenerationResult };
export { VideoJobStateSchema } from "../domain/result.js";
export type { VideoJobState } from "../domain/result.js";
