import { describe, expect, it } from "vitest";
import type { ProviderPreferences, ProviderSecrets } from "@imagine/config";
import { createImageRegistry, createVideoRegistry } from "./registry.js";
import { buildTestCatalog } from "./catalog/test-fixtures.js";

function emptyPrefs(): ProviderPreferences {
  return {
    openai: {},
    "azure-openai": {
      deployments: { image: "my-image-prod", video: null },
      defaultDeployment: "image",
    },
    google: {},
    "flux-bfl": {},
    bytedance: {},
    xai: {},
  };
}

describe("createImageRegistry (catalog-driven)", () => {
  it("populates each configured provider with the slice from catalog.image[providerId]", () => {
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
      catalog.image.openai!.map((m) => m.id).sort(),
    );

    // ByteDance provider sees Seedream entries (image side only).
    const bd = reg.get("bytedance")!;
    expect([...bd.models.keys()]).toContain("doubao-seedream-3-0-t2i-250415");
  });

  it("Azure: deployment name overrides model id but inherits baseline caps", () => {
    const secrets: ProviderSecrets = {
      "azure-openai": {
        endpoint: "https://r.openai.azure.com",
        apiKey: "k",
      },
    };
    const catalog = buildTestCatalog();
    const reg = createImageRegistry(secrets, emptyPrefs(), catalog);

    const azure = reg.get("azure-openai")!;
    expect([...azure.models.keys()]).toEqual(["my-image-prod"]);
    const m = azure.models.get("my-image-prod")!;
    expect(m.capabilities?.sizes).toContain("1024x1024");
  });

  it("ignores secrets that are absent (no provider entry created)", () => {
    const secrets: ProviderSecrets = { openai: { apiKey: "sk" } };
    const reg = createImageRegistry(secrets, emptyPrefs(), buildTestCatalog());
    expect([...reg.keys()]).toEqual(["openai"]);
  });

  it("empty catalog slice → provider has zero models but is still registered", () => {
    const catalog = buildTestCatalog();
    catalog.image.openai = [];
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
    // capabilities aggregate from the catalog slice.
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
});
