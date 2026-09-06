import { describe, expect, it } from "vitest";
import { parseIanaCsv } from "../src/knownPorts/parseIana.js";

describe("parseIanaCsv", () => {
  it("parses real-shaped IANA rows", () => {
    const csv = [
      "Service Name,Port Number,Transport Protocol,Description,Assignee",
      "postgresql,5432,tcp,PostgreSQL Database,[Tom_Lane]",
      "postgresql,5432,udp,PostgreSQL Database,[Tom_Lane]",
    ].join("\n");
    const result = parseIanaCsv(csv);
    expect(result).toEqual([
      { port: 5432, protocol: "tcp", name: "postgresql", description: "PostgreSQL Database" },
      { port: 5432, protocol: "udp", name: "postgresql", description: "PostgreSQL Database" },
    ]);
  });

  it("skips Reserved and Unassigned rows", () => {
    const csv = [
      "Service Name,Port Number,Transport Protocol,Description",
      ",0,tcp,Reserved",
      ",1234,tcp,Unassigned",
    ].join("\n");
    expect(parseIanaCsv(csv)).toEqual([]);
  });

  it("skips rows with no service name", () => {
    const csv = ["Service Name,Port Number,Transport Protocol,Description", ",9999,tcp,Some description"].join(
      "\n",
    );
    expect(parseIanaCsv(csv)).toEqual([]);
  });

  it("skips sctp and other non-tcp/udp transports", () => {
    const csv = ["Service Name,Port Number,Transport Protocol,Description", "http,80,sctp,HTTP"].join("\n");
    expect(parseIanaCsv(csv)).toEqual([]);
  });

  it("handles quoted fields containing commas", () => {
    const csv = [
      "Service Name,Port Number,Transport Protocol,Description",
      'myservice,1234,tcp,"Handles, commas, correctly"',
    ].join("\n");
    const result = parseIanaCsv(csv);
    expect(result[0]?.description).toBe("Handles, commas, correctly");
  });
});
