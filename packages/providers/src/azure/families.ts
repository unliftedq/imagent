import type { ImageModelDef } from "@imagent/core";

/**
 * Azure Foundry hosts deployments from multiple model families behind one
 * resource — same host (`*.services.ai.azure.com`), different URL prefix:
 *
 *   - `openai-images` — Azure OpenAI image models (gpt-image-2 / 1.5 / mini).
 *     Routed via `/openai/v1/images/{generations,edits}`.
 *   - `mai-images` — Microsoft MAI-Image-2 / MAI-Image-2e. Routed via
 *     `/mai/v1/images/generations` with raw `width`/`height` parameters and
 *     PNG-only output.
 *   - `flux-bfl` — Black Forest Labs FLUX models (FLUX.2 family:
 *     [pro|max|flex|Klein 9B|Klein 4B]). Routed via the BFL
 *     provider-specific API at
 *     `/providers/blackforestlabs/v1/<path>?api-version=preview`. Async
 *     submit + poll, Bearer auth.
 *
 * The discriminator is the **canonical** model id (`baseModelId` if set, else
 * `id`), since deployment names (`model.id`) are user-chosen and arbitrary.
 * The catalog records the canonical id, so this stays stable across users.
 *
 * Adding a new family means: (1) add a case here, (2) add a generator method
 * to `AzureImageProvider`, (3) add canonical model entries to
 * `catalog.default.json`. No registry or config changes required.
 */
export type AzureModelFamily = "openai-images" | "mai-images" | "flux-bfl";

/**
 * Azure Foundry FLUX path / body-model mapping. The canonical model id is the
 * URL path component (matches both BFL direct and Azure Foundry paths); the
 * Azure body wants the BFL "model id" form (e.g. `FLUX.2-pro`) which is
 * different from the path. See:
 *   https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-flux
 */
export const FOUNDRY_FLUX_MODELS: ReadonlyMap<string, { path: string; bodyModel: string }> =
  new Map([
    ["flux-2-pro", { path: "flux-2-pro", bodyModel: "FLUX.2-pro" }],
    ["flux-2-flex", { path: "flux-2-flex", bodyModel: "FLUX.2-flex" }],
  ]);

/**
 * Pick the family for a resolved Azure deployment. Convention-based on the
 * canonical id so users don't have to label deployments — mapping a
 * deployment to canonical model id `MAI-Image-2` or `flux-2-pro` is enough.
 */
export function azureModelFamily(model: ImageModelDef): AzureModelFamily {
  const canonical = model.baseModelId ?? model.id;
  if (/^mai-image/i.test(canonical)) return "mai-images";
  if (FOUNDRY_FLUX_MODELS.has(canonical)) return "flux-bfl";
  return "openai-images";
}
