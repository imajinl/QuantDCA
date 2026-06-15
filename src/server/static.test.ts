import { resolve } from "node:path";
import { contentTypeFor, resolveStaticCandidate, shouldServeSpaFallback } from "./static";

describe("static file helpers", () => {
  const distPath = resolve("/repo/dist");

  it("keeps static candidates inside the built asset directory", () => {
    expect(resolveStaticCandidate(distPath, "/")).toBe(resolve("/repo/dist/index.html"));
    expect(resolveStaticCandidate(distPath, "/assets/app.js")).toBe(resolve("/repo/dist/assets/app.js"));
    expect(resolveStaticCandidate(distPath, "/../package.json")).toBeNull();
    expect(resolveStaticCandidate(distPath, "/%2e%2e/package.json")).toBeNull();
  });

  it("maps production asset content types", () => {
    expect(contentTypeFor("app.js")).toBe("text/javascript");
    expect(contentTypeFor("app.css")).toBe("text/css");
    expect(contentTypeFor("favicon.svg")).toBe("image/svg+xml");
    expect(contentTypeFor("manifest.json")).toBe("application/json");
    expect(contentTypeFor("index.html")).toBe("text/html");
  });

  it("serves SPA fallback only for app routes, not missing asset files", () => {
    expect(shouldServeSpaFallback("/")).toBe(true);
    expect(shouldServeSpaFallback("/app")).toBe(true);
    expect(shouldServeSpaFallback("/legacy/deep-link")).toBe(true);
    expect(shouldServeSpaFallback("/assets/app.js")).toBe(false);
    expect(shouldServeSpaFallback("/favicon.svg")).toBe(false);
    expect(shouldServeSpaFallback("/%E0%A4%A")).toBe(false);
  });
});
