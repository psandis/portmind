import { describe, expect, it } from "vitest";
import type { PortEntry } from "@portmind/core";
import { renderTable } from "../src/renderTable.js";

function makeEntry(overrides: Partial<PortEntry> = {}): PortEntry {
  return {
    host: "localhost",
    port: 3000,
    protocol: "tcp",
    bindAddress: "127.0.0.1",
    pid: 41822,
    processName: "node",
    cmdline: "node server.js",
    cwd: "~/Projects/react-dashboard",
    startedAt: null,
    docker: null,
    knownService: null,
    history: { usual: true, observationCount: 5, firstSeen: null, usualOccupant: null },
    riskFlags: [],
    aiExplanation: null,
    ...overrides,
  };
}

describe("renderTable", () => {
  it("reports no listening ports when the list is empty", () => {
    expect(renderTable([])).toBe("No listening ports found.");
  });

  it("includes the header and each port's core fields", () => {
    const output = renderTable([makeEntry()]);
    expect(output).toContain("PORT");
    expect(output).toContain("3000");
    expect(output).toContain("node");
    expect(output).toContain("41822");
  });

  it("flags unusual entries as NO instead of yes", () => {
    const output = renderTable([makeEntry({ history: { usual: false, observationCount: 1, firstSeen: null, usualOccupant: "node" } })]);
    expect(output).toContain("NO");
  });

  it("shows the docker container name when present", () => {
    const output = renderTable([
      makeEntry({ docker: { containerId: "abc123", containerName: "pg-container", image: "postgres:16" } }),
    ]);
    expect(output).toContain("pg-container");
  });
});
