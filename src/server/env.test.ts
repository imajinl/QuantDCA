import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadServerEnv, parsePositiveIntegerEnv, parseServerPortEnv } from "./env";

describe("loadServerEnv", () => {
  it("loads .env values without overriding existing environment variables", () => {
    const dir = join(tmpdir(), `quantdca-env-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const envPath = join(dir, ".env");
    writeFileSync(envPath, "EODHD_API_KEY=from-file\nCOINAPI_API_KEY=coin-file\nQDCA_EXISTING=from-file\nQUOTED=\"quoted value\"\n");

    process.env.QDCA_EXISTING = "already-set";
    delete process.env.QUOTED;
    const originalApiKey = process.env.EODHD_API_KEY;
    const originalCoinApiKey = process.env.COINAPI_API_KEY;
    delete process.env.EODHD_API_KEY;
    delete process.env.COINAPI_API_KEY;

    try {
      loadServerEnv(envPath);

      expect(process.env.EODHD_API_KEY).toBe("from-file");
      expect(process.env.COINAPI_API_KEY).toBe("coin-file");
      expect(process.env.QDCA_EXISTING).toBe("already-set");
      expect(process.env.QUOTED).toBe("quoted value");
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.EODHD_API_KEY;
      } else {
        process.env.EODHD_API_KEY = originalApiKey;
      }
      if (originalCoinApiKey === undefined) {
        delete process.env.COINAPI_API_KEY;
      } else {
        process.env.COINAPI_API_KEY = originalCoinApiKey;
      }
      delete process.env.QDCA_EXISTING;
      delete process.env.QUOTED;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("parsePositiveIntegerEnv", () => {
  it("parses positive integer environment values and rejects unsafe limits", () => {
    expect(parsePositiveIntegerEnv(undefined, 2_000_000, "QDCA_MAX_REQUEST_BYTES")).toBe(2_000_000);
    expect(parsePositiveIntegerEnv("4096", 2_000_000, "QDCA_MAX_REQUEST_BYTES")).toBe(4096);
    expect(() => parsePositiveIntegerEnv("abc", 2_000_000, "QDCA_MAX_REQUEST_BYTES")).toThrow(
      "QDCA_MAX_REQUEST_BYTES must be a positive integer."
    );
    expect(() => parsePositiveIntegerEnv("-1", 2_000_000, "QDCA_MAX_REQUEST_BYTES")).toThrow(
      "QDCA_MAX_REQUEST_BYTES must be a positive integer."
    );
  });
});

describe("parseServerPortEnv", () => {
  it("prefers platform PORT, falls back to QDCA_API_PORT, and rejects invalid ports", () => {
    expect(parseServerPortEnv({})).toBe(8787);
    expect(parseServerPortEnv({ QDCA_API_PORT: "9090" })).toBe(9090);
    expect(parseServerPortEnv({ PORT: "8080", QDCA_API_PORT: "9090" })).toBe(8080);
    expect(parseServerPortEnv({ PORT: "", QDCA_API_PORT: "9090" })).toBe(9090);
    expect(() => parseServerPortEnv({ PORT: "abc" })).toThrow("PORT must be a positive integer.");
    expect(() => parseServerPortEnv({ QDCA_API_PORT: "0" })).toThrow("QDCA_API_PORT must be a positive integer.");
    expect(() => parseServerPortEnv({ PORT: "70000" })).toThrow("PORT must be an integer port between 1 and 65535.");
  });
});
