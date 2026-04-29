import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createElectronSecretsStore,
  type SafeStorageLike,
} from "./secrets.js";

/**
 * Trivial XOR-based "safeStorage" stand-in. Real Electron uses OS keyring;
 * the unit tests just need a round-trip that distinguishes ciphertext from
 * plaintext.
 */
function makeFakeSafeStorage(opts: { available?: boolean } = {}): SafeStorageLike {
  const KEY = 0x5a;
  return {
    isEncryptionAvailable: () => opts.available ?? true,
    encryptString: (plain: string) => {
      const buf = Buffer.from(plain, "utf8");
      const out = Buffer.alloc(buf.length);
      for (let i = 0; i < buf.length; i += 1) out[i] = (buf[i] ?? 0) ^ KEY;
      return out;
    },
    decryptString: (enc: Buffer) => {
      const out = Buffer.alloc(enc.length);
      for (let i = 0; i < enc.length; i += 1) out[i] = (enc[i] ?? 0) ^ KEY;
      return out.toString("utf8");
    },
  };
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "imagine-secrets-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("createElectronSecretsStore", () => {
  it("happy path: save then load round-trips through the encrypted bin", async () => {
    const binPath = path.join(tmpDir, "secrets.bin");
    const store = createElectronSecretsStore({
      safeStorage: makeFakeSafeStorage(),
      binPath,
      platform: "win32",
    });

    await store.saveSecrets({ openai: { apiKey: "sk-real-key" } });

    // bin file exists and is NOT plaintext JSON.
    const raw = await fs.readFile(binPath);
    expect(raw.toString("utf8")).not.toContain("sk-real-key");

    const loaded = await store.loadSecrets();
    expect(loaded.openai?.apiKey).toBe("sk-real-key");
  });

  it("first-run migration: encrypts secrets.json into secrets.bin and unlinks the plaintext", async () => {
    const binPath = path.join(tmpDir, "secrets.bin");
    const jsonPath = path.join(tmpDir, "secrets.json");
    await fs.writeFile(
      jsonPath,
      JSON.stringify({ openai: { apiKey: "sk-from-json" } }),
      "utf8",
    );

    const messages: string[] = [];
    const store = createElectronSecretsStore({
      safeStorage: makeFakeSafeStorage(),
      binPath,
      jsonPath,
      logger: { info: (m) => messages.push(m), warn: () => {} },
      platform: "win32",
    });

    const loaded = await store.loadSecrets();
    expect(loaded.openai?.apiKey).toBe("sk-from-json");

    // Plaintext should be deleted.
    await expect(fs.access(jsonPath)).rejects.toThrow();
    // Bin should exist.
    await expect(fs.access(binPath)).resolves.toBeUndefined();
    expect(messages.some((m) => m.includes("migrated"))).toBe(true);

    // A second loadSecrets call should not re-log.
    messages.length = 0;
    const second = await store.loadSecrets();
    expect(second.openai?.apiKey).toBe("sk-from-json");
    expect(messages).toEqual([]);
  });

  it("falls back to plaintext file store on Linux when safeStorage is unavailable", async () => {
    const binPath = path.join(tmpDir, "secrets.bin");
    const jsonPath = path.join(tmpDir, "secrets.json");

    const store = createElectronSecretsStore({
      safeStorage: makeFakeSafeStorage({ available: false }),
      binPath,
      jsonPath,
      logger: { info: () => {}, warn: () => {} },
      platform: "linux",
    });

    await store.saveSecrets({ openai: { apiKey: "sk-plain" } });
    // The fallback uses the json path, so the plain file should be written.
    const raw = await fs.readFile(jsonPath, "utf8");
    expect(raw).toContain("sk-plain");
  });

  it("throws on Windows when safeStorage is unavailable (refuses plaintext)", () => {
    expect(() =>
      createElectronSecretsStore({
        safeStorage: makeFakeSafeStorage({ available: false }),
        binPath: path.join(tmpDir, "secrets.bin"),
        platform: "win32",
      }),
    ).toThrow(/safeStorage encryption is unavailable/);
  });

  it("returns empty when no bin and no json exist", async () => {
    const binPath = path.join(tmpDir, "secrets.bin");
    const store = createElectronSecretsStore({
      safeStorage: makeFakeSafeStorage(),
      binPath,
      platform: "win32",
    });
    const loaded = await store.loadSecrets();
    expect(loaded).toEqual({});
  });
});
