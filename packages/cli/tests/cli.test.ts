import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const cliEntry = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.js");

describe("portmind list (real scan, end to end)", () => {
  it("exits 0 and prints a table with a PORT header", () => {
    const output = execFileSync("node", [cliEntry, "list"], { encoding: "utf-8" });
    expect(output).toContain("PORT");
  });

  it("--json produces valid JSON matching the PortEntry shape", () => {
    const output = execFileSync("node", [cliEntry, "list", "--json"], { encoding: "utf-8" });
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    if (parsed.length > 0) {
      expect(parsed[0]).toHaveProperty("port");
      expect(parsed[0]).toHaveProperty("protocol");
    }
  });

  it("rejects a malformed --range", () => {
    expect(() => execFileSync("node", [cliEntry, "list", "--range", "bogus"], { stdio: "pipe" })).toThrow();
  });
});
