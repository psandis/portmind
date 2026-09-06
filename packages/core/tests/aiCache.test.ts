import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { AiExplanationCache } from "../src/ai/cache.js";

let tmpDir: string | null = null;
afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = null;
});

describe("AiExplanationCache", () => {
  it("returns null for a key that was never set", () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "portmind-ai-cache-"));
    const cache = new AiExplanationCache(path.join(tmpDir, "test.db"));
    expect(cache.get("node", 3000)).toBeNull();
    cache.close();
  });

  it("stores and retrieves an explanation keyed by (process_name, port)", () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "portmind-ai-cache-"));
    const cache = new AiExplanationCache(path.join(tmpDir, "test.db"));
    cache.set("postgres", 5432, "This is a PostgreSQL database.");
    expect(cache.get("postgres", 5432)).toBe("This is a PostgreSQL database.");
    expect(cache.get("postgres", 9999)).toBeNull();
    cache.close();
  });

  it("overwrites an existing entry for the same key", () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "portmind-ai-cache-"));
    const cache = new AiExplanationCache(path.join(tmpDir, "test.db"));
    cache.set("node", 3000, "First explanation.");
    cache.set("node", 3000, "Updated explanation.");
    expect(cache.get("node", 3000)).toBe("Updated explanation.");
    cache.close();
  });
});
