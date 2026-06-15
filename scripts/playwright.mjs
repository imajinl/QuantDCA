import { spawn } from "node:child_process";
import { join } from "node:path";

const env = { ...process.env };
delete env.EODHD_API_KEY;
delete env.COINAPI_API_KEY;
delete env.QDCA_RUN_LIVE_TESTS;
delete env.FORCE_COLOR;
delete env.NO_COLOR;

const playwrightCommand = join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "playwright.cmd" : "playwright"
);
const child = spawn(playwrightCommand, ["test", ...process.argv.slice(2)], {
  env,
  shell: false,
  stdio: "inherit"
});

child.on("error", (error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
