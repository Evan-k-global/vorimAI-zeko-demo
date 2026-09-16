import { createServer, type IncomingMessage, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { runCustomerPoc, type CustomerPocDefinition } from "./customer-poc.js";
import { isMockVorimScenario } from "./mock-vorim.js";

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function startCustomerPocServer(
  definition: CustomerPocDefinition,
  options: { host?: string; port?: number } = {}
): Server {
  const host = options.host ?? process.env.DEMO_HOST ?? "127.0.0.1";
  const port = options.port ?? Number(process.env.DEMO_PORT ?? 4174);
  const publicDir = path.join(process.cwd(), "pocs", definition.id, "public");

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      if (request.method === "POST" && url.pathname === "/api/run") {
        const body = await readRequestBody(request);
        const parsed = body ? JSON.parse(body) as { scenario?: string } : {};
        const scenario = parsed.scenario ?? "allow";
        if (!isMockVorimScenario(scenario)) {
          response.writeHead(400, { "content-type": contentTypes[".json"] });
          response.end(JSON.stringify({ error: `Unknown scenario: ${scenario}` }));
          return;
        }
        try {
          const result = await runCustomerPoc(definition, { scenario });
          response.writeHead(200, { "content-type": contentTypes[".json"] });
          response.end(JSON.stringify(result));
        } catch (error) {
          response.writeHead(409, { "content-type": contentTypes[".json"] });
          response.end(JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            scenario
          }));
        }
        return;
      }

      const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
      const safePath = path.normalize(pathname).replace(/^([.][.][/\\])+/, "");
      const filePath = path.join(publicDir, safePath);
      if (!filePath.startsWith(publicDir)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }
      const body = await readFile(filePath);
      response.writeHead(200, {
        "content-type": contentTypes[path.extname(filePath)] ?? "application/octet-stream"
      });
      response.end(body);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error && error.code === "ENOENT"
        ? 404
        : 500;
      response.writeHead(code, { "content-type": "text/plain; charset=utf-8" });
      response.end(code === 404 ? "Not found" : error instanceof Error ? error.message : String(error));
    }
  });

  server.listen(port, host, () => {
    console.log(`${definition.title} POC: http://${host}:${port}`);
  });
  return server;
}
