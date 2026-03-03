#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, cpSync, readdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const clappsDir = resolve(root, "clapps");

/**
 * Build-time sync:
 * - clapps/<id>/components/*.tsx -> packages/web-app/src/components/primitives/*.tsx
 * - clapps/<id>/handlers/*.ts -> packages/connect/src/*.ts
 *
 * This keeps each clapp as the source-of-truth while preserving current package build layout.
 */
const TARGETS = {
  components: resolve(root, "packages", "web-app", "src", "components", "primitives"),
  handlers: resolve(root, "packages", "connect", "src"),
};

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function copyRelative(clappRoot, relativePath, targetDir) {
  const src = resolve(clappRoot, relativePath);
  if (!existsSync(src)) {
    console.warn(`⚠️  Missing source: ${src}`);
    return;
  }
  mkdirSync(targetDir, { recursive: true });
  const dest = resolve(targetDir, basename(relativePath));
  cpSync(src, dest);
  console.log(`sync ${relativePath} -> ${dest.replace(root + "/", "")}`);
}

function main() {
  if (!existsSync(clappsDir)) {
    console.log("No clapps directory found; skipping sync.");
    return;
  }

  const clappIds = readdirSync(clappsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const clappId of clappIds) {
    const clappRoot = resolve(clappsDir, clappId);
    const manifestPath = resolve(clappRoot, "clapp.json");
    if (!existsSync(manifestPath)) continue;

    const manifest = loadJson(manifestPath);
    const components = Array.isArray(manifest.components) ? manifest.components : [];
    const handlers = Array.isArray(manifest.handlers) ? manifest.handlers : [];

    for (const rel of components) copyRelative(clappRoot, rel, TARGETS.components);
    for (const rel of handlers) copyRelative(clappRoot, rel, TARGETS.handlers);
  }
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
