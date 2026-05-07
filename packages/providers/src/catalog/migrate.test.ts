import { DEFAULT_CONFIG, type ConfigFile } from "@imagent/config";
import { describe, expect, it } from "vitest";
import { migrateLegacySecretsRouting, migrateProviderRouting } from "./migrate.js";
import { buildTestCatalog } from "./test-fixtures.js";

function freshConfig(): ConfigFile {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as ConfigFile;
}

describe("migrateProviderRouting", () => {
  it("moves Azure deployments out of the catalog and into config", () => {
    const catalog = buildTestCatalog();
    expect(catalog.providers["azure-openai"]?.image).toHaveLength(1);

    const result = migrateProviderRouting(catalog, freshConfig());

    expect(result.migrated).toBe(true);
    expect(result.movedByProvider["azure-openai"]).toEqual({ image: 1, video: 0 });
    // Catalog keeps the displayName but loses the offerings.
    expect(result.catalog.providers["azure-openai"]).toEqual({ displayName: "Azure" });
    // Config now owns the deployment routing.
    expect(result.config.providers["azure-openai"]?.image).toEqual([
      { id: "azure-prod-gpt-image-2", modelId: "gpt-image-2" },
    ]);
  });

  it("moves a custom OpenAI-compatible provider's offerings into config.customOpenAI", () => {
    const catalog = buildTestCatalog();
    catalog.providers["custom-openai"] = {
      displayName: "Custom OpenAI",
      image: [{ id: "my-gpt-image", modelId: "gpt-image-2" }],
    };

    const result = migrateProviderRouting(catalog, freshConfig());

    expect(result.migrated).toBe(true);
    expect(result.catalog.providers["custom-openai"]).toBeUndefined();
    expect(result.config.providers.customOpenAI?.["custom-openai"]).toEqual({
      displayName: "Custom OpenAI",
      image: [{ id: "my-gpt-image", modelId: "gpt-image-2" }],
    });
  });

  it("is idempotent — running over a post-split state is a no-op", () => {
    const catalog = buildTestCatalog();
    const first = migrateProviderRouting(catalog, freshConfig());
    expect(first.migrated).toBe(true);

    const second = migrateProviderRouting(first.catalog, first.config);
    expect(second.migrated).toBe(false);
    expect(second.catalog).toEqual(first.catalog);
    expect(second.config).toEqual(first.config);
  });

  it("preserves existing config routing and dedupes incoming entries by id", () => {
    const catalog = buildTestCatalog();
    const config = freshConfig();
    // Pre-existing config entry for the SAME deployment id — must not double up.
    config.providers["azure-openai"] = {
      image: [{ id: "azure-prod-gpt-image-2", modelId: "gpt-image-2" }],
    };

    const result = migrateProviderRouting(catalog, config);

    expect(result.migrated).toBe(true);
    expect(result.config.providers["azure-openai"]?.image).toHaveLength(1);
    expect(result.movedByProvider["azure-openai"]).toEqual({ image: 0, video: 0 });
  });

  it("leaves built-in OpenAI/Google/etc. catalog offerings alone", () => {
    const catalog = buildTestCatalog();
    const before = JSON.parse(JSON.stringify(catalog.providers.openai));

    const result = migrateProviderRouting(catalog, freshConfig());

    expect(result.catalog.providers.openai).toEqual(before);
    expect(result.config.providers.openai).toEqual({});
  });
});

describe("migrateLegacySecretsRouting", () => {
  it("moves Azure endpoint + ByteDance endpoint into config and keeps apiKeys in secrets", () => {
    const raw = {
      "azure-openai": { apiKey: "azure-key", endpoint: "https://r.openai.azure.com" },
      bytedance: { apiKey: "bd-key", endpoint: "https://ark.cn-beijing.volces.com/api/v3" },
      openai: { apiKey: "sk-1" },
    };
    const result = migrateLegacySecretsRouting(raw, freshConfig());

    expect(result.migrated).toBe(true);
    expect(result.secrets).toEqual({
      "azure-openai": { apiKey: "azure-key" },
      bytedance: { apiKey: "bd-key" },
      openai: { apiKey: "sk-1" },
    });
    expect(result.config.providers["azure-openai"]?.endpoint).toBe(
      "https://r.openai.azure.com",
    );
    expect(result.config.providers.bytedance?.endpoint).toBe(
      "https://ark.cn-beijing.volces.com/api/v3",
    );
  });

  it("moves a custom OpenAI provider's baseUrl into config.customOpenAI and keeps the apiKey", () => {
    const raw = {
      customOpenAI: {
        lmstudio: { baseUrl: "http://localhost:1234/v1", apiKey: "lm-key" },
      },
    };
    const result = migrateLegacySecretsRouting(raw, freshConfig());
    expect(result.migrated).toBe(true);
    expect(result.secrets).toEqual({
      customOpenAI: { lmstudio: { apiKey: "lm-key" } },
    });
    expect(result.config.providers.customOpenAI?.lmstudio?.baseUrl).toBe(
      "http://localhost:1234/v1",
    );
  });

  it("is a no-op when secrets only carries apiKeys (post-split shape)", () => {
    const raw = { openai: { apiKey: "sk-1" } };
    const result = migrateLegacySecretsRouting(raw, freshConfig());
    expect(result.migrated).toBe(false);
    expect(result.secrets).toEqual({ openai: { apiKey: "sk-1" } });
    expect(result.config).toEqual(freshConfig());
  });

  it("does not overwrite existing config endpoint when both files carry it", () => {
    const config = freshConfig();
    config.providers["azure-openai"] = { endpoint: "https://config-wins.openai.azure.com" };
    const raw = {
      "azure-openai": { apiKey: "k", endpoint: "https://from-secrets.openai.azure.com" },
    };
    const result = migrateLegacySecretsRouting(raw, config);
    expect(result.migrated).toBe(true);
    expect(result.config.providers["azure-openai"]?.endpoint).toBe(
      "https://config-wins.openai.azure.com",
    );
  });
});
