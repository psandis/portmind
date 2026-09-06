import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { explainPort } from "../src/ai/explain.js";
import { AiExplanationCache } from "../src/ai/cache.js";
import { ConfigError } from "../src/configLoader.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import type { PortEntry } from "../src/types.js";

function makeEntry(overrides: Partial<PortEntry> = {}): PortEntry {
  return {
    host: "localhost",
    port: 5432,
    protocol: "tcp",
    bindAddress: "127.0.0.1",
    pid: 1,
    processName: "postgres",
    cmdline: "postgres -D /data",
    cwd: "/data",
    startedAt: null,
    docker: null,
    knownService: null,
    history: { usual: true, observationCount: 1, firstSeen: null, usualOccupant: null },
    riskFlags: [],
    aiExplanation: null,
    ...overrides,
  };
}

let tmpDir: string | null = null;
afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = null;
});

function tmpDbPath(): string {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "portmind-explain-"));
  return path.join(tmpDir, "test.db");
}

describe("explainPort", () => {
  it("throws ConfigError when ai.enabled is false", async () => {
    const config = { ...DEFAULT_CONFIG, ai: { ...DEFAULT_CONFIG.ai, enabled: false } };
    await expect(explainPort(makeEntry(), config)).rejects.toThrow(ConfigError);
  });

  it("throws ConfigError when provider is none", async () => {
    const config = { ...DEFAULT_CONFIG, ai: { ...DEFAULT_CONFIG.ai, enabled: true, provider: "none" as const } };
    await expect(explainPort(makeEntry(), config)).rejects.toThrow(ConfigError);
  });

  it("throws ConfigError when the API key env var is missing", async () => {
    const dbPath = tmpDbPath();
    const config = {
      ...DEFAULT_CONFIG,
      ai: { ...DEFAULT_CONFIG.ai, enabled: true, provider: "anthropic" as const },
      history: { ...DEFAULT_CONFIG.history, dbPath },
    };
    await expect(explainPort(makeEntry(), config, { env: {} })).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  it("returns a cached explanation without calling fetch", async () => {
    const dbPath = tmpDbPath();
    const cache = new AiExplanationCache(dbPath);
    cache.set("postgres", 5432, "Cached explanation.");

    const config = {
      ...DEFAULT_CONFIG,
      ai: { ...DEFAULT_CONFIG.ai, enabled: true, provider: "anthropic" as const },
      history: { ...DEFAULT_CONFIG.history, dbPath },
    };

    let fetchCalled = false;
    const fetchImpl = async () => {
      fetchCalled = true;
      throw new Error("should not be called");
    };

    const result = await explainPort(makeEntry(), config, {
      cache,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: { ANTHROPIC_API_KEY: "test-key" },
    });

    expect(result).toBe("Cached explanation.");
    expect(fetchCalled).toBe(false);
    cache.close();
  });

  it("calls the provider and caches the result on a cache miss", async () => {
    const dbPath = tmpDbPath();
    const cache = new AiExplanationCache(dbPath);

    const config = {
      ...DEFAULT_CONFIG,
      ai: { ...DEFAULT_CONFIG.ai, enabled: true, provider: "anthropic" as const },
      history: { ...DEFAULT_CONFIG.history, dbPath },
    };

    const fetchImpl = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ content: [{ type: "text", text: "It is a database." }] }),
        text: async () => "",
      }) as Response;

    const result = await explainPort(makeEntry(), config, {
      cache,
      fetchImpl,
      env: { ANTHROPIC_API_KEY: "test-key" },
    });

    expect(result).toBe("It is a database.");
    expect(cache.get("postgres", 5432)).toBe("It is a database.");
    cache.close();
  });
});
