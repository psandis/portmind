import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig, resolveConfigPaths, projectConfigPath } from "../src/configLoader.js";
import { DEFAULT_CONFIG } from "../src/config.js";

let tmpDir: string | null = null;
afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = null;
});

describe("loadConfig", () => {
  it("returns defaults untouched when no config file exists", async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "portmind-test-"));
    const config = await loadConfig(tmpDir);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("applies a project .portmind.yaml override on top of defaults", async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "portmind-test-"));
    writeFileSync(
      projectConfigPath(tmpDir),
      ["scan:", "  interval_seconds: 15", "known_ports:", "  source: custom"].join("\n"),
    );

    const config = await loadConfig(tmpDir);
    expect(config.scan.intervalSeconds).toBe(15);
    expect(config.knownPorts.source).toBe("custom");
    // Untouched keys still fall back to defaults.
    expect(config.scan.includeUdp).toBe(DEFAULT_CONFIG.scan.includeUdp);
    expect(config.ai.enabled).toBe(DEFAULT_CONFIG.ai.enabled);
  });

  it("throws ConfigError for malformed YAML rather than silently ignoring it", async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "portmind-test-"));
    writeFileSync(projectConfigPath(tmpDir), "scan:\n  - this is not valid: [for a map");

    await expect(loadConfig(tmpDir)).rejects.toThrow();
  });
});

describe("resolveConfigPaths", () => {
  it("reports whether the project config file exists", async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "portmind-test-"));
    const before = await resolveConfigPaths(tmpDir);
    expect(before.projectExists).toBe(false);

    writeFileSync(projectConfigPath(tmpDir), "scan:\n  interval_seconds: 10\n");
    const after = await resolveConfigPaths(tmpDir);
    expect(after.projectExists).toBe(true);
  });
});
