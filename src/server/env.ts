import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadServerEnv(path = resolve(process.cwd(), ".env")): void {
  if (!existsSync(path)) {
    return;
  }

  const contents = readFileSync(path, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = stripOptionalQuotes(value);
    }
  }
}

export function parsePositiveIntegerEnv(value: string | undefined, fallback: number, label: string): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return parsed;
}

export function parseServerPortEnv(env: NodeJS.ProcessEnv = process.env): number {
  if (env.PORT !== undefined && env.PORT.trim() !== "") {
    return parsePortEnv(env.PORT, 8787, "PORT");
  }

  return parsePortEnv(env.QDCA_API_PORT, 8787, "QDCA_API_PORT");
}

function parsePortEnv(value: string | undefined, fallback: number, label: string): number {
  const parsed = parsePositiveIntegerEnv(value, fallback, label);
  if (parsed > 65_535) {
    throw new Error(`${label} must be an integer port between 1 and 65535.`);
  }
  return parsed;
}

function stripOptionalQuotes(value: string): string {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
