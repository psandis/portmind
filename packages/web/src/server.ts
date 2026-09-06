import { createServer as createHttpServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { scanPorts, loadConfig, explainPort, ConfigError, type PortEntry } from "portmind-core";

const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexHtmlPath = path.join(packageRoot, "static", "index.html");

export interface WebServerOptions {
  port: number;
  /** Bind host - defaults to 127.0.0.1, never expose externally without an explicit override. */
  host?: string;
}

/**
 * Local-only dashboard server. Binds to 127.0.0.1 by default (per spec:
 * "no external network exposure by default"). Three routes: the static
 * page, a JSON API returning the same PortEntry[] shape as
 * `portmind list --json`, and an AI explain endpoint that only ever fires
 * on an explicit client request (the page's "Explain with AI" button),
 * never automatically.
 */
export function createWebServer(options: WebServerOptions): Server {
  const host = options.host ?? "127.0.0.1";

  return createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

      if (req.method === "GET" && url.pathname === "/api/ports") {
        const config = await loadConfig();
        const entries = await scanPorts({ includeUdp: config.scan.includeUdp }, config.knownPorts);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(entries));
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/explain") {
        const entry = (await readJsonBody(req)) as PortEntry;
        const config = await loadConfig();
        try {
          const explanation = await explainPort(entry, config);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ explanation }));
        } catch (error) {
          const status = error instanceof ConfigError ? 400 : 502;
          res.writeHead(status, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: (error as Error).message }));
        }
        return;
      }

      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        const html = await readFile(indexHtmlPath, "utf-8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: (error as Error).message }));
    }
  }).listen(options.port, host);
}

function readJsonBody(req: import("node:http").IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}
