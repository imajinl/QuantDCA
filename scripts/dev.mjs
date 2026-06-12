import { spawn } from "node:child_process";

const mockData = process.argv.includes("--mock-data");
const apiPort = process.env.QDCA_API_PORT ?? "8787";
const webPort = process.env.QDCA_WEB_PORT ?? "5173";

const env = {
  ...process.env,
  QDCA_API_PORT: apiPort,
  VITE_QDCA_API_PORT: apiPort,
  QDCA_USE_MOCK_DATA: mockData ? "true" : process.env.QDCA_USE_MOCK_DATA ?? "false"
};

const commands = [
  ["api", "npx", ["tsx", "watch", "src/server/index.ts"]],
  ["web", "npx", ["vite", "--host", "127.0.0.1", "--port", webPort]]
];

const children = commands.map(([name, command, args]) => {
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
