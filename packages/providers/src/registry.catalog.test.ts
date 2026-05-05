import type { ProviderPreferences, ProviderSecrets } from "@imagent/config";
import { describe, expect, it } from "vitest";
import { ModelCatalogSchema } from "./catalog/schema.js";
import { buildTestCatalog } from "./catalog/test-fixtures.js";
import { createImageRegistry, createVideoRegistry } from "./registry.js";

function emptyPrefs(): ProviderPreferences {
  return {
    openai: {},
    "azure-openai": {},
    google: {},
    "flux-bfl": {},
    bytedance: {},
    xai: {},
  };
}

describe("createImageRegistry (catalog-driven)", () => {
  it("populates each configured provider from catalog provider offerings", () => {
    const secrets: ProviderSecrets = {
      openai: { apiKey: "sk" },
      google: { apiKey: "g" },
      "flux-bfl": { apiKey: "f" },
      bytedance: {
        apiKey: "v",
        endpoint: "https://ark.cn-beijing.volces.com/api/v3",
      },
      xai: { apiKey: "x" },
    };
    const catalog = buildTestCatalog();
    const reg = createImageRegistry(secrets, emptyPrefs(), catalog);

    expect([...reg.keys()].sort()).toEqual(
      ["bytedance", "flux-bfl", "google", "openai", "xai"].sort(),
    );

    // OpenAI provider sees both fixture models.
    const openai = reg.get("openai")!;
    expect([...openai.models.keys()].sort()).toEqual(
      catalog.providers.openai!.image!.map((m) => m.id).sort(),
    );

    // ByteDance provider sees Seedream entries (image side only).
    const bd = reg.get("bytedance")!;
    expect([...bd.models.keys()]).toContain("doubao-seedream-3-0-t2i-250415");
  });

  it("Azure: deployment names resolve against canonical model capabilities", () => {
    const secrets: ProviderSecrets = {
      "azure-openai": {
        endpoint: "https://r.openai.azure.com",
        apiKey: "k",
      },
    };
    const catalog = buildTestCatalog();
    const reg = createImageRegistry(secrets, emptyPrefs(), catalog);

    const azure = reg.get("azure-openai")!;
    expect([...azure.models.keys()]).toEqual(["azure-prod-gpt-image-2"]);
    const deployment = azure.models.get("azure-prod-gpt-image-2")!;
    expect(deployment.baseModelId).toBe("gpt-image-2");
    expect(deployment.capabilities?.maxOutputs).toBe(
      catalog.models.image["gpt-image-2"]!.capabilities?.maxOutputs,
    );
  });

  it("provider image offerings can override capabilities and defaults", () => {
    const secrets: ProviderSecrets = {
      "azure-openai": {
        endpoint: "https://r.openai.azure.com",
        apiKey: "k",
      },
    };
    const catalog = buildTestCatalog();
    catalog.providers["azure-openai"]!.image = [
      {
        id: "azure-low-output",
        modelId: "gpt-image-2",
        capabilities: { maxOutputs: 1 },
        defaults: { quality: "low" },
      },
    ];
    const parsed = ModelCatalogSchema.parse(catalog);
    const reg = createImageRegistry(secrets, emptyPrefs(), parsed);

    const model = reg.get("azure-openai")!.models.get("azure-low-output")!;
    expect(model.capabilities?.maxOutputs).toBe(1);
    expect(model.capabilities?.supportsStyleRef).toBe(true);
    expect(model.defaults?.quality).toBe("low");
    expect(model.defaults?.size).toBe("1024x1024");
  });

  it("ignores secrets that are absent (no provider entry created)", () => {
    const secrets: ProviderSecrets = { openai: { apiKey: "sk" } };
    const reg = createImageRegistry(secrets, emptyPrefs(), buildTestCatalog());
    expect([...reg.keys()]).toEqual(["openai"]);
  });

  it("registers OpenAI-compatible custom providers from secrets and catalog mappings", () => {
    const catalog = buildTestCatalog();
    catalog.providers["custom-openai"] = {
      displayName: "Custom OpenAI",
      image: [{ id: "custom-gpt-image", modelId: "gpt-image-2" }],
    };
    const parsed = ModelCatalogSchema.parse(catalog);
    const secrets: ProviderSecrets = {
      customOpenAI: {
        "custom-openai": { baseUrl: "https://example.test/v1" },
      },
    };

    const reg = createImageRegistry(secrets, emptyPrefs(), parsed);
    const provider = reg.get("custom-openai");

    expect(provider).toBeDefined();
    if (!provider) throw new Error("custom-openai provider was not registered");
    expect(provider.id).toBe("custom-openai");
    expect(provider.displayName).toBe("Custom OpenAI");
    expect([...provider.models.keys()]).toEqual(["custom-gpt-image"]);
    expect(provider.models.get("custom-gpt-image")?.baseModelId).toBe("gpt-image-2");
  });

  it("empty provider offerings → provider has zero models but is still registered", () => {
    const catalog = buildTestCatalog();
    catalog.providers.openai!.image = [];
    const secrets: ProviderSecrets = { openai: { apiKey: "sk" } };
    const reg = createImageRegistry(secrets, emptyPrefs(), catalog);
    expect(reg.get("openai")!.models.size).toBe(0);
  });
});

describe("createVideoRegistry (catalog-driven)", () => {
  it("includes ByteDance, Google, and xAI when their secrets are present", () => {
    const secrets: ProviderSecrets = {
      bytedance: {
        apiKey: "v",
        endpoint: "https://ark.cn-beijing.volces.com/api/v3",
      },
      google: { apiKey: "g" },
      xai: { apiKey: "x" },
    };
    const reg = createVideoRegistry(secrets, emptyPrefs(), buildTestCatalog());
    expect([...reg.keys()].sort()).toEqual(["bytedance", "google", "xai"]);
  });

  it("Google / xAI video providers expose real submit/poll/fetch/test methods", () => {
    // Phase 3a wires real raw-HTTP implementations. The registry should hand
    // out provider instances whose methods are not the old "Phase 3" stub
    // throwers — submit/poll/fetch/test all exist as functions, and the
    // capabilities aggregate from resolved catalog offerings.
    const secrets: ProviderSecrets = {
      google: { apiKey: "g" },
      xai: { apiKey: "x" },
    };
    const reg = createVideoRegistry(secrets, emptyPrefs(), buildTestCatalog());

    const google = reg.get("google")!;
    expect(google.id).toBe("google");
    expect(typeof google.submit).toBe("function");
    expect(typeof google.poll).toBe("function");
    expect(typeof google.fetch).toBe("function");
    expect(typeof google.test).toBe("function");
    expect(google.models.size).toBeGreaterThan(0);
    expect(google.capabilities.resolutions.length).toBeGreaterThan(0);

    const xai = reg.get("xai")!;
    expect(xai.id).toBe("xai");
    expect(typeof xai.submit).toBe("function");
    expect(typeof xai.poll).toBe("function");
    expect(typeof xai.fetch).toBe("function");
    expect(typeof xai.test).toBe("function");
    expect(xai.models.size).toBeGreaterThan(0);
  });

  it("provider video offerings can override capabilities and defaults", () => {
    const catalog = buildTestCatalog();
    catalog.providers.google!.video = [
      {
        id: "veo-short-720p",
        modelId: "veo-3.0-generate-001",
        capabilities: { resolutions: ["720p"], supportsLastFrame: false },
        defaults: { durationSec: 4, resolution: "720p" },
      },
    ];
    const parsed = ModelCatalogSchema.parse(catalog);
    const reg = createVideoRegistry({ google: { apiKey: "g" } }, emptyPrefs(), parsed);

    const model = reg.get("google")!.models.get("veo-short-720p")!;
    expect(model.capabilities?.resolutions).toEqual(["720p"]);
    expect(model.capabilities?.supportsFirstFrame).toBe(true);
    expect(model.capabilities?.supportsLastFrame).toBe(false);
    expect(model.defaults?.durationSec).toBe(4);
    expect(model.defaults?.fps).toBe(24);
  });
});
