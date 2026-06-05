/**
 * Compile-time type-tests for the IPC contract. This file is type-checked
 * but never executed; tsc shouts if the inferences slip. (No test runner
 * needed at M1.)
 */

import type {
  AudioModelDef,
  AudioRequest,
  GalleryItem,
  ImageRequest,
  Job,
  JobsQuery,
  VoiceInfo,
} from "@imagent/core";
import type { Input, Output } from "./contract.js";

// image.generate accepts ImageRequest, returns GalleryItem.
const _imageInput: Input<"image.generate"> = null as unknown as ImageRequest;
const _imageOutput: Output<"image.generate"> = null as unknown as GalleryItem;
const _imageSubmitInput: Input<"image.submit"> = null as unknown as ImageRequest;
const _imageSubmitOutput: Output<"image.submit"> = { jobId: "job-1" };
const _audioSubmitInput: Input<"audio.submit"> = null as unknown as AudioRequest;
const _audioSubmitOutput: Output<"audio.submit"> = { jobId: "audio-job-1" };
const _audioModelsInput: Input<"audio.models"> = { providerId: "elevenlabs" };
const _audioModelsOutput: Output<"audio.models"> = {
  providerId: "elevenlabs",
  defaultModel: null,
  models: null as unknown as AudioModelDef[],
};
const _audioVoicesInput: Input<"audio.voices"> = { providerId: "elevenlabs", modelId: "m1" };
const _audioVoicesOutput: Output<"audio.voices"> = {
  voices: null as unknown as VoiceInfo[],
};
const _modelsListOutput: Output<"models.list"> = {
  image: [],
  video: [],
  audio: [],
};

// jobs.list accepts JobsQuery, returns Job[].
const _jobsInput: Input<"jobs.list"> = null as unknown as JobsQuery;
const _jobsOutput: Output<"jobs.list"> = null as unknown as Job[];

// providers.list takes void, returns an array.
const _providersInput: Input<"providers.list"> = undefined;
const _providersOutput: Output<"providers.list"> = [];

// Suppress unused-binding warnings without leaking values.
export type _ContractTypeProbe = [
  typeof _imageInput,
  typeof _imageOutput,
  typeof _imageSubmitInput,
  typeof _imageSubmitOutput,
  typeof _audioSubmitInput,
  typeof _audioSubmitOutput,
  typeof _audioModelsInput,
  typeof _audioModelsOutput,
  typeof _audioVoicesInput,
  typeof _audioVoicesOutput,
  typeof _modelsListOutput,
  typeof _jobsInput,
  typeof _jobsOutput,
  typeof _providersInput,
  typeof _providersOutput,
];
