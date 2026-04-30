export * from "./registry.js";
export * from "./http/index.js";

// Per-vendor provider classes re-exported for direct testing / overrides.
// (Per-vendor catalog files were deleted in Phase 2 — model lists now live in
// `catalog.default.json` and load via `loadCatalog()`.)
export * from "./openai/image.js";
export * from "./azure/image.js";
export * from "./google/image.js";
export * from "./google/video.js";
export * from "./flux/image.js";
export * from "./bytedance/image.js";
export * from "./bytedance/video.js";
export * from "./xai/image.js";
export * from "./xai/video.js";

// Catalog primitives re-exported for IPC + bootstrap consumers.
export {
  ModelCatalogSchema,
  type ModelCatalog,
} from "./catalog/schema.js";
export {
  loadCatalog,
  saveCatalog,
  getBundledCatalog,
  type CatalogLoaderOptions,
  type CatalogSaveOptions,
} from "./catalog/loader.js";
