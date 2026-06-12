import { spawn } from "node:child_process";

const quickMode = process.argv.includes("--quick");
const includeAudit = process.argv.includes("--audit") || process.env.PRE_PUSH_AUDIT === "1";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const checks = quickMode
  ? [
      ["Typecheck", ["run", "typecheck"]],
      ["Lint", ["run", "lint"]],
      ["Unit Tests", ["run", "test"]]
    ]
  : [
      ["Typecheck", ["run", "typecheck"]],
      ["Lint", ["run", "lint"]],
      ["Unit Tests", ["run", "test"]],
      ["Build", ["run", "build"]],
      ["E2E Tests", ["run", "test:e2e"]]
    ];

if (includeAudit) {
  checks.push(["Production Audit", ["run", "audit:prod"]]);
}

for (const [label, args] of checks) {
  await runCheck(label, args);
}

process.stdout.write(`\nPre-push checks passed: ${checks.map(([label]) => label).join(", ")}\n`);

function runCheck(label, args) {
  process.stdout.write(`\n==> ${label}\n`);

  return new Promise((resolve, reject) => {
    const child = spawn(npmCommand, args, {
      env: process.env,
      shell: false,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${label} failed with exit code ${code ?? "unknown"}. Push aborted.`));
    });
  });
}
