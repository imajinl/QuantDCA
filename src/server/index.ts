import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { createApiHandler } from "./api";
import { loadServerEnv, parsePositiveIntegerEnv, parseServerPortEnv } from "./env";
import { contentTypeFor, resolveStaticCandidate, shouldServeSpaFallback } from "./static";

loadServerEnv();

const port = parseServerPortEnv();
const host = process.env.HOST ?? "127.0.0.1";
const distPath = resolve(process.cwd(), "dist");
const handleApiRequest = createApiHandler();
const maxRequestBytes = parsePositiveIntegerEnv(process.env.QDCA_MAX_REQUEST_BYTES, 2_000_000, "QDCA_MAX_REQUEST_BYTES");

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
    if (error instanceof HttpResponseError) {
      outgoing.writeHead(error.status, { "Content-Type": "application/json" });
      outgoing.end(JSON.stringify({ error: { code: error.code, message: error.message } }));
      return;
    }

    outgoing.writeHead(500, { "Content-Type": "application/json" });
    outgoing.end(JSON.stringify({ error: { code: "server_error", message: "Unexpected server error." } }));
  }
});

server.listen(port, host, () => {
  console.log(`QuantDCA listening on http://${host}:${port}`);
});

async function toWebRequest(incoming: IncomingMessage, url: URL): Promise<Request> {
  const chunks: Buffer[] = [];
  const contentLength = Number(incoming.headers["content-length"] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxRequestBytes) {
    throw new HttpResponseError("payload_too_large", requestLimitMessage(), 413);
  }

  let totalBytes = 0;
  for await (const chunk of incoming as AsyncIterable<Buffer>) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > maxRequestBytes) {
      throw new HttpResponseError("payload_too_large", requestLimitMessage(), 413);
    }
    chunks.push(buffer);
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

function requestLimitMessage(): string {
  return `Request body exceeds the configured ${maxRequestBytes} byte limit.`;
}

class HttpResponseError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "HttpResponseError";
  }
}

async function serveStatic(pathname: string, outgoing: ServerResponse): Promise<void> {
  if (!existsSync(distPath)) {
    outgoing.writeHead(404, { "Content-Type": "text/plain" });
    outgoing.end("Build the web app with npm run build before using the production server.");
    return;
  }

  const candidatePath = resolveStaticCandidate(distPath, pathname);
  if (!candidatePath) {
    outgoing.writeHead(404, { "Content-Type": "text/plain" });
    outgoing.end("Not found.");
    return;
  }

  const hasStaticFile = existsSync(candidatePath) && statSync(candidatePath).isFile();
  if (!hasStaticFile && !shouldServeSpaFallback(pathname)) {
    outgoing.writeHead(404, { "Content-Type": "text/plain" });
    outgoing.end("Not found.");
    return;
  }

  const filePath = hasStaticFile ? candidatePath : join(distPath, "index.html");
  const contentType = contentTypeFor(filePath);
  outgoing.writeHead(200, { "Content-Type": contentType });

  if (filePath.endsWith("index.html")) {
    outgoing.end(await readFile(filePath));
    return;
  }

  createReadStream(filePath).pipe(outgoing);
}
