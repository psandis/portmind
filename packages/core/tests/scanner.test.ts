import { describe, expect, it } from "vitest";
import { dedupeSockets } from "../src/scan/scanner.js";

describe("dedupeSockets", () => {
  it("collapses duplicate fds for the same protocol/address/port/pid", () => {
    const sockets = [
      { pid: 1117, processName: "ControlCenter", bindAddress: "0.0.0.0", port: 7000, protocol: "tcp" as const },
      { pid: 1117, processName: "ControlCenter", bindAddress: "0.0.0.0", port: 7000, protocol: "tcp" as const },
    ];
    expect(dedupeSockets(sockets)).toHaveLength(1);
  });

  it("keeps distinct ports for the same pid separate", () => {
    const sockets = [
      { pid: 1117, processName: "ControlCenter", bindAddress: "0.0.0.0", port: 7000, protocol: "tcp" as const },
      { pid: 1117, processName: "ControlCenter", bindAddress: "0.0.0.0", port: 5000, protocol: "tcp" as const },
    ];
    expect(dedupeSockets(sockets)).toHaveLength(2);
  });

  it("keeps tcp and udp on the same port separate", () => {
    const sockets = [
      { pid: 1605, processName: "Spotify", bindAddress: "0.0.0.0", port: 57621, protocol: "tcp" as const },
      { pid: 1605, processName: "Spotify", bindAddress: "0.0.0.0", port: 57621, protocol: "udp" as const },
    ];
    expect(dedupeSockets(sockets)).toHaveLength(2);
  });
});
