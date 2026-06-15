import { extname, isAbsolute, relative, resolve } from "node:path";

export function resolveStaticCandidate(distPath: string, pathname: string): string | null {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  } catch {
    return null;
  }

  const filePath = resolve(distPath, `.${decodedPath}`);
  const relativePath = relative(distPath, filePath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return null;
  }

  return filePath;
}

export function shouldServeSpaFallback(pathname: string): boolean {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return false;
  }

  const finalSegment = decodedPath.split("/").filter(Boolean).at(-1) ?? "";
  return finalSegment === "" || extname(finalSegment) === "";
}

export function contentTypeFor(filePath: string): string {
  const extension = extname(filePath);
  if (extension === ".js") return "text/javascript";
  if (extension === ".css") return "text/css";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".json") return "application/json";
  return "text/html";
}
