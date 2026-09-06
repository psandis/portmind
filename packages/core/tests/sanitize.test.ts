import { describe, expect, it } from "vitest";
import { sanitizeCmdline } from "../src/ai/sanitize.js";

describe("sanitizeCmdline", () => {
  it("redacts --password=X style flags", () => {
    expect(sanitizeCmdline("mysqld --password=hunter2")).toBe("mysqld --password=[REDACTED]");
  });

  it("redacts --token flags with a space separator", () => {
    expect(sanitizeCmdline("mycli --token abc123xyz")).toBe("mycli --token [REDACTED]");
  });

  it("redacts Bearer tokens", () => {
    expect(sanitizeCmdline("curl -H Authorization:Bearer sk-abc123")).toContain("Bearer [REDACTED]");
  });

  it("redacts SECRET/TOKEN/KEY environment-style assignments", () => {
    expect(sanitizeCmdline("node server.js API_KEY=sk-live-abc123")).toBe("node server.js API_KEY=[REDACTED]");
  });

  it("leaves ordinary command lines untouched", () => {
    const cmd = "node server.js --port 3000 --host 0.0.0.0";
    expect(sanitizeCmdline(cmd)).toBe(cmd);
  });
});
