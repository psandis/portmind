import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createWebServer } from "../src/server.js";

const PORT = 45781;
const BASE_URL = `http://127.0.0.1:${PORT}`;

let server: Server;

beforeAll(() => {
  server = createWebServer({ port: PORT });
});

afterAll(() => {
  server.close();
});

describe("web server", () => {
  it("serves the dashboard page at /", async () => {
    const res = await fetch(BASE_URL);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("<title>portmind</title>");
  });

  it("serves PortEntry[] JSON at /api/ports", async () => {
    const res = await fetch(`${BASE_URL}/api/ports`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("returns 404 for unknown routes", async () => {
    const res = await fetch(`${BASE_URL}/nope`);
    expect(res.status).toBe(404);
  });

  it("POST /api/explain returns 400 when AI is disabled (the default)", async () => {
    const res = await fetch(`${BASE_URL}/api/explain`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ port: 3000, processName: "node", protocol: "tcp" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/AI is disabled/);
  });
});
