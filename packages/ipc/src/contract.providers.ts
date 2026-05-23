import { z } from "zod";

import { IpcImageProviderModelSchema, IpcVideoProviderModelSchema } from "./contract.catalog.js";

export const ProviderIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

/**
 * Which generation kinds a provider participates in. BytePlus and 火山引擎
 * (Volcengine) each span both `image` and `video` because Seedream +
 * Seedance share Ark credentials under one provider id (architecture.md §4
 * vendor=provider).
 */
export const ProviderKindSchema = z.enum(["image", "video"]);
export type ProviderKind = z.infer<typeof ProviderKindSchema>;

export const ProviderSummarySchema = z.object({
  id: ProviderIdSchema,
  displayName: z.string(),
  configured: z.boolean(),
  /** Generation kinds this provider supports. */
  kinds: z.array(ProviderKindSchema),
  /** When `configured`, the resolved default model for this provider. */
  defaultModel: z.string().nullable(),
  modelIds: z.array(z.string()),
});
export type ProviderSummary = z.infer<typeof ProviderSummarySchema>;

export const ProviderTestResultSchema = z.union([
  z.object({
    ok: z.literal(true),
    latencyMs: z.number().int().nonnegative(),
    sampleModelId: z.string().optional(),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.string(),
    status: z.number().int().optional(),
  }),
]);
export type ProviderTestResult = z.infer<typeof ProviderTestResultSchema>;

/**
 * Provider preferences block — non-secret per-provider config. The catalog
 * holds canonical (bundled) provider offerings; this payload carries the
 * per-user overlay merged on top at runtime: Azure / BytePlus / 火山引擎
 * endpoint URLs, custom OpenAI-compatible base URLs, deployment / model id
 * mappings, and optional displayName overrides. Schema mirrors
 * `config.providers` in shape.
 */
export const IpcProviderRoutingSchema = z.object({
  displayName: z.string().optional(),
  endpoint: z.string().optional(),
  baseUrl: z.string().optional(),
  image: z.array(IpcImageProviderModelSchema).optional(),
  video: z.array(IpcVideoProviderModelSchema).optional(),
});
export type ProviderRoutingPayload = z.infer<typeof IpcProviderRoutingSchema>;

export const ProviderPreferencesPayloadSchema = z.object({
  openai: IpcProviderRoutingSchema,
  azure: IpcProviderRoutingSchema,
  google: IpcProviderRoutingSchema,
  "flux-bfl": IpcProviderRoutingSchema,
  byteplus: IpcProviderRoutingSchema,
  volcengine: IpcProviderRoutingSchema,
  xai: IpcProviderRoutingSchema,
  customOpenAI: z.record(ProviderIdSchema, IpcProviderRoutingSchema),
});
export type ProviderPreferencesPayload = z.infer<typeof ProviderPreferencesPayloadSchema>;

/**
 * Secrets payload returned to the renderer is **always masked** (first 4 +
 * last 4 chars only). Only carries `apiKey` fields — non-sensitive routing
 * (endpoint, baseUrl, custom OpenAI base URLs) lives in
 * {@link ProviderPreferencesPayloadSchema}.
 */
const MaskedKey = z.object({ apiKey: z.string().nullable() });
export const MaskedSecretsSchema = z.object({
  openai: MaskedKey.optional(),
  azure: MaskedKey.optional(),
  google: MaskedKey.optional(),
  "flux-bfl": MaskedKey.optional(),
  byteplus: MaskedKey.optional(),
  volcengine: MaskedKey.optional(),
  xai: MaskedKey.optional(),
  customOpenAI: z.record(ProviderIdSchema, MaskedKey).optional(),
});
export type MaskedSecrets = z.infer<typeof MaskedSecretsSchema>;

/**
 * Plaintext secrets the renderer is allowed to write. Same shape as
 * {@link MaskedSecretsSchema} but with non-empty strings — apiKey only.
 */
const WriteKey = z.object({ apiKey: z.string().min(1) }).partial();
export const SecretsWriteSchema = z.object({
  openai: WriteKey.optional(),
  azure: WriteKey.optional(),
  google: WriteKey.optional(),
  "flux-bfl": WriteKey.optional(),
  byteplus: WriteKey.optional(),
  volcengine: WriteKey.optional(),
  xai: WriteKey.optional(),
  customOpenAI: z.record(ProviderIdSchema, z.object({ apiKey: z.string().min(1) })).optional(),
});
export type SecretsWrite = z.infer<typeof SecretsWriteSchema>;
