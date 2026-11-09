// Keeps the docs within their budgets. What loads every session (CLAUDE.md,
// every file it imports with an `@path` line, and the memory index when
// PANKI_MEMORY_INDEX names it) stays under SESSION_MAX, and every doc under
// docs/ stays under DOC_MAX, so a task reads one small file. And
// docs/COMPONENTS.md is what the code's `@panki` lines say (docs-components.mjs).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { componentsCheck } from "./docs-components.mjs";

const SESSION_MAX = 40 * 1024;
const DOC_MAX = 60 * 1024;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const sizeOf = (path) => statSync(path).size;

// CLAUDE.md and what it pulls in, an `@path` line at a time, each file once.
function loadedWith(file, seen) {
  if (seen.has(file)) return;
  seen.add(file);
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^@(\S+)\s*$/.exec(line.trim());
    if (!m) continue;
    const imported = resolve(dirname(file), m[1]);
    if (!existsSync(imported)) throw new Error(`${relative(root, file)} imports ${m[1]}, which isn't there`);
    loadedWith(imported, seen);
  }
}

const loaded = new Set();
loadedWith(join(root, "CLAUDE.md"), loaded);
const memoryIndex = process.env.PANKI_MEMORY_INDEX;
if (memoryIndex) {
  if (!existsSync(memoryIndex)) throw new Error(`PANKI_MEMORY_INDEX names ${memoryIndex}, which isn't there`);
  loaded.add(resolve(memoryIndex));
}

let failed = false;
let session = 0;
console.log("Loaded every session:");
for (const file of loaded) {
  const size = sizeOf(file);
  session += size;
  const shown = relative(root, file);
  console.log(`  ${kb(size).padStart(9)}  ${shown.startsWith("..") ? file : shown}`);
}
if (!memoryIndex) console.log("  (memory index skipped: PANKI_MEMORY_INDEX is not set)");
console.log(`  ${kb(session).padStart(9)}  in all, of ${kb(SESSION_MAX)}`);
if (session > SESSION_MAX) {
  failed = true;
  console.log(`FAIL: what loads every session is ${kb(session)}, over ${kb(SESSION_MAX)}.`);
}

function docsIn(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return docsIn(path);
    return name.endsWith(".md") ? [path] : [];
  });
}

const docsDir = join(root, "docs");
const over = docsIn(docsDir)
  .map((path) => ({ path, size: sizeOf(path) }))
  .filter(({ size }) => size > DOC_MAX)
  .sort((a, b) => b.size - a.size);
if (over.length) {
  failed = true;
  console.log(`FAIL: ${over.length} doc${over.length === 1 ? "" : "s"} over ${kb(DOC_MAX)}:`);
  for (const { path, size } of over) console.log(`  ${kb(size).padStart(9)}  ${relative(root, path)}`);
} else {
  console.log(`Every doc under docs/ is within ${kb(DOC_MAX)}.`);
}

const components = componentsCheck();
if (components.length) {
  failed = true;
  for (const problem of components) console.log(`FAIL: ${problem}`);
} else {
  console.log("docs/COMPONENTS.md is what the code's @panki lines say.");
}

process.exit(failed ? 1 : 0);
