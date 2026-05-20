import { z } from "zod";

import {
  AppPreferencesPayloadSchema,
  AppVersionInfoSchema,
  ProviderConfigSchema,
  type AppPreferencesPayload,
  type AppVersionInfo,
  type ProviderConfig,
  type StoragePaths,
  StoragePathsSchema,
} from "./contract.app.js";
import { IpcModelCatalogSchema, type ModelCatalogPayload } from "./contract.catalog.js";
import {
  IpcErrorCodeSchema,
  IpcErrorSchema,
  IpcResponseSchema,
  type IpcError,
  type IpcErrorCode,
} from "./contract.errors.js";
import {
  MaskedSecretsSchema,
  ProviderIdSchema,
  ProviderKindSchema,
  ProviderPreferencesPayloadSchema,
  ProviderSummarySchema,
  ProviderTestResultSchema,
  SecretsWriteSchema,
  type MaskedSecrets,
  type ProviderId,
  type ProviderKind,
  type ProviderPreferencesPayload,
  type ProviderRoutingPayload,
  type ProviderSummary,
  type ProviderTestResult,
  type SecretsWrite,
} from "./contract.providers.js";
import {
  appContract,
  assetsContract,
  boardsContract,
  catalogContract,
  galleryContract,
  generationContract,
  jobsContract,
  KvKeySchema,
  KvValueSchema,
  modelsContract,
  providerContract,
  systemContract,
  updaterContract,
  workspaceContract,
} from "./contract.sections.js";
import {
  type UpdateAsset,
  UpdateAssetSchema,
  type UpdateCheckResult,
  UpdateCheckResultSchema,
  type UpdateProgressState,
  UpdateProgressStateSchema,
  type UpdateStatusPayload,
  UpdateStatusPayloadSchema,
} from "./contract.updater.js";

export {
  AppPreferencesPayloadSchema,
  AppVersionInfoSchema,
  IpcErrorCodeSchema,
  IpcErrorSchema,
  IpcModelCatalogSchema,
  IpcResponseSchema,
  KvKeySchema,
  KvValueSchema,
  MaskedSecretsSchema,
  ProviderConfigSchema,
  ProviderIdSchema,
  ProviderKindSchema,
  ProviderPreferencesPayloadSchema,
  ProviderSummarySchema,
  ProviderTestResultSchema,
  SecretsWriteSchema,
  StoragePathsSchema,
  UpdateAssetSchema,
  UpdateCheckResultSchema,
  UpdateProgressStateSchema,
  UpdateStatusPayloadSchema,
};
export type {
  AppPreferencesPayload,
  AppVersionInfo,
  IpcError,
  IpcErrorCode,
  MaskedSecrets,
  ModelCatalogPayload,
  ProviderConfig,
  ProviderId,
  ProviderKind,
  ProviderPreferencesPayload,
  ProviderRoutingPayload,
  ProviderSummary,
  ProviderTestResult,
  SecretsWrite,
  StoragePaths,
  UpdateAsset,
  UpdateCheckResult,
  UpdateProgressState,
  UpdateStatusPayload,
};

/**
 * Hand-rolled IPC contract — one zod object per method, no tRPC. The renderer
 * `client.ts` is a Proxy that calls `output.parse()` on every reply, which
 * gives us runtime guarantees with no decorators or codegen.
 *
 * Tags reference architecture.md §8 and the milestone where each route lands.
 */
export const contract = {
  ...providerContract,
  ...appContract,
  ...updaterContract,
  ...catalogContract,
  ...systemContract,
  ...generationContract,
  ...modelsContract,
  ...jobsContract,
  ...assetsContract,
  ...boardsContract,
  ...galleryContract,
  ...workspaceContract,
} as const;

export type Contract = typeof contract;
export type ContractMethod = keyof Contract;
export type Input<M extends ContractMethod> = z.infer<Contract[M]["input"]>;
export type Output<M extends ContractMethod> = z.infer<Contract[M]["output"]>;
