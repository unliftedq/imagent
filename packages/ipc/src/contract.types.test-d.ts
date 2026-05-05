/**
 * Compile-time type-tests for the IPC contract. This file is type-checked
 * but never executed; tsc shouts if the inferences slip. (No test runner
 * needed at M1.)
 */

import type { GalleryItem, ImageRequest, Job, JobsQuery } from "@imagent/core";
import type { Input, Output } from "./contract.js";

// image.generate accepts ImageRequest, returns GalleryItem.
const _imageInput: Input<"image.generate"> = null as unknown as ImageRequest;
const _imageOutput: Output<"image.generate"> = null as unknown as GalleryItem;

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
  typeof _jobsInput,
  typeof _jobsOutput,
  typeof _providersInput,
  typeof _providersOutput,
];
