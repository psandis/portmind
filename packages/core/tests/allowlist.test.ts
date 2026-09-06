import { describe, expect, it } from "vitest";
import { buildExplainPayload } from "../src/ai/allowlist.js";
import type { PortEntry } from "../src/types.js";

function makeEntry(overrides: Partial<PortEntry> = {}): PortEntry {
  return {
    host: "localhost",
    port: 3000,
    protocol: "tcp",
    bindAddress: "127.0.0.1",
    pid: 123,
    processName: "node",
    cmdline: "node server.js --token secret123",
    cwd: "/Users/dev/app",
    startedAt: null,
    docker: { containerId: "abc", containerName: "my-app", image: "node:22" },
    knownService: null,
    history: { usual: true, observationCount: 1, firstSeen: null, usualOccupant: null },
    riskFlags: [],
    aiExplanation: null,
    ...overrides,
  };
}

describe("buildExplainPayload", () => {
  it("only includes fields named in fieldsSent", () => {
    const payload = buildExplainPayload(makeEntry(), ["port", "process_name"]);
    expect(Object.keys(payload).sort()).toEqual(["port", "process_name"]);
  });

  it("never includes cwd, host, pid, or riskFlags even if entry has them", () => {
    const payload = buildExplainPayload(makeEntry(), [
      "process_name",
      "cmdline",
      "port",
      "protocol",
      "docker_image",
    ]);
    expect(payload).not.toHaveProperty("cwd");
    expect(payload).not.toHaveProperty("host");
    expect(payload).not.toHaveProperty("pid");
    expect(payload).not.toHaveProperty("riskFlags");
  });

  it("sanitizes cmdline before including it", () => {
    const payload = buildExplainPayload(makeEntry(), ["cmdline"]);
    expect(payload.cmdline).toBe("node server.js --token [REDACTED]");
  });

  it("extracts docker_image from the docker object, not the whole object", () => {
    const payload = buildExplainPayload(makeEntry(), ["docker_image"]);
    expect(payload.docker_image).toBe("node:22");
  });

  it("returns null for docker_image when not docker-backed", () => {
    const payload = buildExplainPayload(makeEntry({ docker: null }), ["docker_image"]);
    expect(payload.docker_image).toBeNull();
  });

  it("returns an empty object for an empty fieldsSent list", () => {
    expect(buildExplainPayload(makeEntry(), [])).toEqual({});
  });
});
