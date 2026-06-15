import { spawn } from "node:child_process";
import { createServer } from "node:net";

const mockData = process.argv.includes("--mock-data");
const explicitApiPort = process.env.QDCA_API_PORT !== undefined;
const requestedApiPort = parsePort(process.env.QDCA_API_PORT ?? "8787", "QDCA_API_PORT");
const apiPort = explicitApiPort ? requestedApiPort : await findOpenPort(requestedApiPort);
const webPort = process.env.QDCA_WEB_PORT ?? "5173";

if (!explicitApiPort && apiPort !== requestedApiPort) {
  process.stdout.write(`[api] Port ${requestedApiPort} is busy; using ${apiPort} instead.\n`);
}

const apiEnv = cleanEnv({
  ...process.env,
  QDCA_API_PORT: String(apiPort),
  QDCA_USE_MOCK_DATA: mockData ? "true" : process.env.QDCA_USE_MOCK_DATA ?? "false"
});
const webEnv = cleanEnv({
  ...process.env,
  QDCA_API_PORT: String(apiPort)
});
delete webEnv.EODHD_API_KEY;
delete webEnv.QDCA_USE_MOCK_DATA;

const commands = [
  ["api", "npx", ["tsx", "watch", "src/server/index.ts"], apiEnv],
  ["web", "npx", ["vite", "--host", "127.0.0.1", "--port", webPort], webEnv]
];

const children = commands.map(([name, command, args, env]) => {
  const child = spawn(command, args, {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      process.stderr.write(`[${name}] exited with code ${code}\n`);
      shutdown();
    }
  });

  return child;
});

function shutdown() {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function cleanEnv(env) {
  delete env.FORCE_COLOR;
  delete env.NO_COLOR;
  return env;
}

function parsePort(value, label) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    process.stderr.write(`${label} must be an integer port between 1 and 65535.\n`);
    process.exit(1);
  }
  return port;
}

async function findOpenPort(startPort) {
  for (let port = startPort; port <= Math.min(startPort + 20, 65_535); port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(`No open API port found from ${startPort} through ${Math.min(startPort + 20, 65_535)}.`);
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => {
      probe.close(() => resolve(true));
    });
    probe.listen(port, "127.0.0.1");
  });
}
