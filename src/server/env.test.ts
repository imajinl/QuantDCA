import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadServerEnv } from "./env";

describe("loadServerEnv", () => {
  it("loads .env values without overriding existing environment variables", () => {
    const dir = join(tmpdir(), `quantdca-env-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const envPath = join(dir, ".env");
    writeFileSync(envPath, "EODHD_API_KEY=from-file\nQDCA_EXISTING=from-file\nQUOTED=\"quoted value\"\n");

    process.env.QDCA_EXISTING = "already-set";
    delete process.env.QUOTED;
    const originalApiKey = process.env.EODHD_API_KEY;
    delete process.env.EODHD_API_KEY;

    loadServerEnv(envPath);

    expect(process.env.EODHD_API_KEY).toBe("from-file");
    expect(process.env.QDCA_EXISTING).toBe("already-set");
    expect(process.env.QUOTED).toBe("quoted value");

    if (originalApiKey === undefined) {
      delete process.env.EODHD_API_KEY;
    } else {
      process.env.EODHD_API_KEY = originalApiKey;
    }
    delete process.env.QDCA_EXISTING;
    delete process.env.QUOTED;
  });
});
