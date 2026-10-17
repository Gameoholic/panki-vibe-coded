// Renders the mark into the files a browser tab and an Android home screen need, from its one home:
// the geometry in apps/web/src/brand/geometry.ts and the --mark-* colours in apps/web/src/theme.css.
// Writes apps/web/public/icon.svg and apps/web/public/icons/icon-{32,192,512}.png. Run with `pnpm icons`
// (tsx, so the .ts import works). Needs Chrome, like verify.mjs: override its path with CHROME.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { MARK_PARTS, MARK_RADIUS, MARK_SIZE } from "../apps/web/src/brand/geometry.ts";

const ROOT = resolve(import.meta.dirname, "..");
const WEB = join(ROOT, "apps", "web");
const CHROME = process.env.CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const SIZES = [32, 192, 512];

function token(name) {
  const css = readFileSync(join(WEB, "src", "theme.css"), "utf8");
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`theme.css has no --${name} token`);
  return m[1];
}

const tile = token("mark-tile");
const glyph = token("mark-glyph");
const glyphPath = MARK_PARTS.left + MARK_PARTS.right + MARK_PARTS.dot;
const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MARK_SIZE} ${MARK_SIZE}">` +
  `<rect width="${MARK_SIZE}" height="${MARK_SIZE}" rx="${MARK_RADIUS}" fill="${tile}"/>` +
  `<path d="${glyphPath}" fill="${glyph}"/></svg>`;

writeFileSync(join(WEB, "public", "icon.svg"), svg + "\n");
mkdirSync(join(WEB, "public", "icons"), { recursive: true });

const scratch = mkdtempSync(join(tmpdir(), "panki-icons-"));
try {
  for (const size of SIZES) {
    const page = join(scratch, `icon-${size}.html`);
    writeFileSync(page, `<!doctype html><meta charset="utf-8"><body style="margin:0">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`);
    const out = join(WEB, "public", "icons", `icon-${size}.png`);
    const run = spawnSync(
      CHROME,
      ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--default-background-color=00000000", `--window-size=${size},${size}`, `--screenshot=${out}`, `file:///${page.replace(/\\/g, "/")}`],
      { stdio: "ignore", timeout: 60_000 },
    );
    if (run.status !== 0) throw new Error(`Chrome failed on ${size}px (exit ${run.status})`);
    console.log(`wrote public/icons/icon-${size}.png`);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
console.log("wrote public/icon.svg");
