import { describe, expect, it } from "vitest";
import { parseLsofFieldOutput } from "../src/scan/parseLsof.js";

describe("parseLsofFieldOutput", () => {
  it("parses IPv4 wildcard bind addresses", () => {
    const output = "p984\ncrapportd\nf14\nn*:59095\n";
    const result = parseLsofFieldOutput(output);
    expect(result).toEqual([
      { pid: 984, processName: "rapportd", bindAddress: "0.0.0.0", port: 59095 },
    ]);
  });

  it("parses loopback bind addresses", () => {
    const output = "p1758\ncpostgres\nf8\nn127.0.0.1:5432\n";
    const result = parseLsofFieldOutput(output);
    expect(result).toEqual([
      { pid: 1758, processName: "postgres", bindAddress: "127.0.0.1", port: 5432 },
    ]);
  });

  it("parses bracketed IPv6 bind addresses", () => {
    const output = "p1758\ncpostgres\nf7\nn[::1]:5432\n";
    const result = parseLsofFieldOutput(output);
    expect(result).toEqual([{ pid: 1758, processName: "postgres", bindAddress: "::1", port: 5432 }]);
  });

  it("skips unbound sockets with no real port (UDP wildcard)", () => {
    const output = "p996\ncidentityservicesd\nf13\nn*:*\n";
    expect(parseLsofFieldOutput(output)).toEqual([]);
  });

  it("associates multiple sockets with the same process block", () => {
    const output = "p1117\ncControlCenter\nf9\nn*:7000\nf11\nn*:5000\n";
    const result = parseLsofFieldOutput(output);
    expect(result).toHaveLength(2);
    expect(result[0]?.port).toBe(7000);
    expect(result[1]?.port).toBe(5000);
  });

  it("returns an empty array for empty output", () => {
    expect(parseLsofFieldOutput("")).toEqual([]);
  });
});
