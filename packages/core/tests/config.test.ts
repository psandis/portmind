import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";

describe("DEFAULT_CONFIG", () => {
  it("ships with AI disabled by default", () => {
    expect(DEFAULT_CONFIG.ai.enabled).toBe(false);
  });

  it("only allows the documented AI fields", () => {
    const allowed = ["process_name", "cmdline", "port", "protocol", "docker_image"];
    for (const field of DEFAULT_CONFIG.ai.fieldsSent) {
      expect(allowed).toContain(field);
    }
  });

  it("scans docker and udp by default", () => {
    expect(DEFAULT_CONFIG.scan.docker).toBe(true);
    expect(DEFAULT_CONFIG.scan.includeUdp).toBe(true);
  });
});
