import { execFileSync } from "node:child_process";
import { mkdir, lstat, readlink, rm, symlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

const force = process.argv.includes("--force");
const repoRoot = git(["rev-parse", "--show-toplevel"]);
const configuredHooksPath = gitOptional(["config", "--local", "--get", "core.hooksPath"]);

if (configuredHooksPath === ".githooks") {
  git(["config", "--local", "--unset", "core.hooksPath"]);
  process.stdout.write("Cleared legacy core.hooksPath=.githooks config.\n");
}

const hooksPathFromGit = git(["rev-parse", "--git-path", "hooks"]);
const hooksDir = isAbsolute(hooksPathFromGit) ? hooksPathFromGit : resolve(repoRoot, hooksPathFromGit);
const checkedInHook = join(repoRoot, "scripts", "git-hooks", "pre-push");
const activeHook = join(hooksDir, "pre-push");

await mkdir(hooksDir, { recursive: true });
await installSymlink();

process.stdout.write(`Installed pre-push hook:\n  ${activeHook}\n-> ${checkedInHook}\n`);

function git(args) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function gitOptional(args) {
  try {
    return git(args);
  } catch {
    return "";
  }
}

async function installSymlink() {
  const current = await existingHook();

  if (current) {
    if (current.type === "symlink" && resolve(dirname(activeHook), current.target) === checkedInHook) {
      return;
    }

    if (!force) {
      throw new Error(
        `Refusing to replace existing pre-push hook at ${activeHook}.\n` +
          "Re-run with `npm run hooks:install -- --force` if you want to replace it."
      );
    }

    await rm(activeHook, { force: true, recursive: true });
  }

  await symlink(relative(dirname(activeHook), checkedInHook), activeHook);
}

async function existingHook() {
  try {
    const stats = await lstat(activeHook);
    if (stats.isSymbolicLink()) {
      return { type: "symlink", target: await readlink(activeHook) };
    }
    return { type: "file" };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
