import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, resolve } from "node:path";
import { createApiHandler } from "./api";
import { loadServerEnv } from "./env";

loadServerEnv();

const port = Number(process.env.PORT ?? process.env.QDCA_API_PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";
const distPath = resolve(process.cwd(), "dist");
const handleApiRequest = createApiHandler();

const server = createServer(async (incoming, outgoing) => {
  try {
    const host = incoming.headers.host ?? `127.0.0.1:${port}`;
    const url = new URL(incoming.url ?? "/", `http://${host}`);

    if (url.pathname.startsWith("/api")) {
      const request = await toWebRequest(incoming, url);
      const response = await handleApiRequest(request);
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      outgoing.writeHead(response.status, responseHeaders);
      outgoing.end(Buffer.from(await response.arrayBuffer()));
      return;
    }

    await serveStatic(url.pathname, outgoing);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    outgoing.writeHead(500, { "Content-Type": "application/json" });
    outgoing.end(JSON.stringify({ error: { code: "server_error", message } }));
  }
});

server.listen(port, host, () => {
  console.log(`QuantDCA listening on http://${host}:${port}`);
});

async function toWebRequest(incoming: IncomingMessage, url: URL): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of incoming as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const method = incoming.method ?? "GET";
  const headers = new Headers();
  for (const [key, value] of Object.entries(incoming.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }

  return new Request(url, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : Buffer.concat(chunks)
  });
}

async function serveStatic(pathname: string, outgoing: ServerResponse): Promise<void> {
  if (!existsSync(distPath)) {
    outgoing.writeHead(404, { "Content-Type": "text/plain" });
    outgoing.end("Build the web app with npm run build before using the production server.");
    return;
  }

  const candidatePath = join(distPath, pathname === "/" ? "index.html" : pathname);
  const filePath = existsSync(candidatePath) && statSync(candidatePath).isFile() ? candidatePath : join(distPath, "index.html");
  const contentType = contentTypeFor(filePath);
  outgoing.writeHead(200, { "Content-Type": contentType });

  if (filePath.endsWith("index.html")) {
    outgoing.end(await readFile(filePath));
    return;
  }

  createReadStream(filePath).pipe(outgoing);
}

function contentTypeFor(filePath: string): string {
  const extension = extname(filePath);
  if (extension === ".js") return "text/javascript";
  if (extension === ".css") return "text/css";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".json") return "application/json";
  return "text/html";
}
