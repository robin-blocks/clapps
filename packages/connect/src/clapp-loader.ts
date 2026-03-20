import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ClappHandler, ClappHandlerContext, ClappHandlerFactory } from "./clapp-handler.js";

interface ClappManifest {
  name: string;
  handlers?: string[];
}

export async function loadClappHandlers(
  clappsDir: string,
  ctx: ClappHandlerContext,
): Promise<ClappHandler[]> {
  const handlers: ClappHandler[] = [];

  if (!existsSync(clappsDir)) {
    console.warn(`[clapp-loader] Clapps directory not found: ${clappsDir}`);
    return handlers;
  }

  let entries: string[];
  try {
    entries = readdirSync(clappsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    console.warn(`[clapp-loader] Failed to read clapps directory: ${clappsDir}`);
    return handlers;
  }

  for (const entry of entries) {
    const manifestPath = resolve(clappsDir, entry, "clapp.json");
    if (!existsSync(manifestPath)) continue;

    let manifest: ClappManifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    } catch (err) {
      console.warn(`[clapp-loader] Failed to parse ${manifestPath}: ${err}`);
      continue;
    }

    if (!Array.isArray(manifest.handlers) || manifest.handlers.length === 0) {
      continue;
    }

    for (const handlerRef of manifest.handlers) {
      // Manifest references .ts source paths; convert to compiled .js
      const jsPath = handlerRef.replace(/\.ts$/, ".js");
      const fullPath = resolve(clappsDir, entry, jsPath);

      if (!existsSync(fullPath)) {
        console.warn(`[clapp-loader] Handler not found: ${fullPath}`);
        continue;
      }

      try {
        const mod = await import(pathToFileURL(fullPath).href);
        const factory: ClappHandlerFactory = mod.default;
        if (typeof factory !== "function") {
          console.warn(`[clapp-loader] ${fullPath} does not export a default factory function`);
          continue;
        }
        const handler = factory(ctx);
        handlers.push(handler);
        console.log(`[clapp-loader] Loaded handler: ${manifest.name}`);
      } catch (err) {
        console.error(`[clapp-loader] Failed to load handler ${fullPath}: ${err}`);
      }
    }
  }

  return handlers;
}
