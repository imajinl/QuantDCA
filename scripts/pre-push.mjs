import { spawn } from "node:child_process";

const fullMode = process.argv.includes("--full") || process.env.PRE_PUSH_FULL === "1";
const skipUnitTests = process.argv.includes("--skip-tests") || process.env.PRE_PUSH_SKIP_TESTS === "1";
const includeBuild = fullMode || process.argv.includes("--build") || process.env.PRE_PUSH_BUILD === "1";
const includeE2e = fullMode || process.argv.includes("--e2e") || process.env.PRE_PUSH_E2E === "1";
const includeAudit = process.argv.includes("--audit") || process.env.PRE_PUSH_AUDIT === "1";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

if (process.env.SKIP_PRE_PUSH === "1") {
  process.stdout.write("Skipping pre-push checks because SKIP_PRE_PUSH=1.\n");
  process.exit(0);
}

const checks = [
  ["Typecheck", ["run", "typecheck"]],
  ["Lint", ["run", "lint"]]
];

if (!skipUnitTests) {
  checks.push(["Unit Tests", ["run", "test"]]);
}

if (includeBuild) {
  checks.push(["Build", ["run", "build"]]);
}

if (includeE2e) {
  checks.push(["E2E Tests", ["run", "test:e2e"]]);
}

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
