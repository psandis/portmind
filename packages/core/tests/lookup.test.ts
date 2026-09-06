import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildKnownPortsIndex, applyKnownPorts } from "../src/knownPorts/lookup.js";
import type { PortEntry } from "../src/types.js";

function makeEntry(overrides: Partial<PortEntry> = {}): PortEntry {
  return {
    host: "localhost",
    port: 5432,
    protocol: "tcp",
    bindAddress: "127.0.0.1",
    pid: 1,
    processName: "postgres",
    cmdline: null,
    cwd: null,
    startedAt: null,
    docker: null,
    knownService: null,
    history: { usual: true, observationCount: 0, firstSeen: null, usualOccupant: null },
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

describe("buildKnownPortsIndex + applyKnownPorts", () => {
  it("finds bundled IANA entries for a real registered port", async () => {
    const index = await buildKnownPortsIndex({ source: "iana", customDbPath: null, refreshDays: 30 });
    const [entry] = applyKnownPorts([makeEntry({ port: 5432, protocol: "tcp" })], index);
    expect(entry?.knownService?.name).toBe("postgresql");
    expect(entry?.knownService?.source).toBe("iana");
  });

  it("leaves knownService null for a port with no match", async () => {
    const index = await buildKnownPortsIndex({ source: "iana", customDbPath: null, refreshDays: 30 });
    const [entry] = applyKnownPorts([makeEntry({ port: 39482, protocol: "tcp" })], index);
    expect(entry?.knownService).toBeNull();
  });

  it("loads a custom db file and marks entries with source: custom", async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "portmind-test-"));
    const customPath = path.join(tmpDir, "custom-ports.json");
    writeFileSync(
      customPath,
      JSON.stringify([{ port: 7000, protocol: "tcp", service_name: "billing", description: "Internal billing service" }]),
    );

    const index = await buildKnownPortsIndex({ source: "custom", customDbPath: customPath, refreshDays: 30 });
    const [entry] = applyKnownPorts([makeEntry({ port: 7000, protocol: "tcp" })], index);
    expect(entry?.knownService).toEqual({
      name: "billing",
      description: "Internal billing service",
      source: "custom",
    });
  });

  it("source: both lets custom entries override IANA for the same port", async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "portmind-test-"));
    const customPath = path.join(tmpDir, "custom-ports.json");
    writeFileSync(
      customPath,
      JSON.stringify([{ port: 5432, protocol: "tcp", service_name: "custom-pg", description: "Overridden" }]),
    );

    const index = await buildKnownPortsIndex({ source: "both", customDbPath: customPath, refreshDays: 30 });
    const [entry] = applyKnownPorts([makeEntry({ port: 5432, protocol: "tcp" })], index);
    expect(entry?.knownService?.source).toBe("custom");
    expect(entry?.knownService?.name).toBe("custom-pg");
  });

  it("does not throw when customDbPath points at a missing file", async () => {
    const index = await buildKnownPortsIndex({
      source: "custom",
      customDbPath: "/nonexistent/path.json",
      refreshDays: 30,
    });
    expect(index.size).toBe(0);
  });
});
