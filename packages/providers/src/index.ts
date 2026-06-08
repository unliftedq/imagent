export * from "./registry.js";
export * from "./http/index.js";

// Shared base classes and helpers — useful for external consumers who want
// to build a custom provider with the same scaffolding (model lookup,
// defaults application, request validation, capability aggregation,
// abort-aware polling). The vendor classes below all extend these.
export * from "./common/index.js";

// Per-vendor provider classes re-exported for direct testing / overrides.
// (Per-vendor catalog files were deleted in Phase 2 — canonical models and
// provider offerings now live in `catalog.default.json` and load via `loadCatalog()`.)
export * from "./openai/image.js";
export * from "./azure/image.js";
export * from "./google/image.js";
export * from "./google/video.js";
export * from "./flux/image.js";
export * from "./bytedance/image.js";
export * from "./bytedance/video.js";
export * from "./xai/image.js";
export * from "./xai/video.js";
export * from "./elevenlabs/speech.js";
export * from "./minimax/speech.js";
export * from "./minimax/image.js";
export * from "./minimax/video.js";

// Catalog primitives re-exported for IPC + bootstrap consumers.
export {
  ModelCatalogSchema,
  type ImageProviderModel,
  type ModelCatalog,
  type ProviderCatalog,
  type VideoProviderModel,
} from "./catalog/schema.js";
export {
  effectiveImageOfferings,
  effectiveProviderDisplayName,
  effectiveVideoOfferings,
  resolveImageProviderModel,
  resolveImageProviderModels,
  resolveVideoProviderModel,
  resolveVideoProviderModels,
} from "./catalog/resolve.js";
export {
  loadCatalog,
  saveCatalog,
  getBundledCatalog,
  type CatalogLoaderOptions,
  type CatalogSaveOptions,
} from "./catalog/loader.js";
