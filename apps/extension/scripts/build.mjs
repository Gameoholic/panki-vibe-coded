// Builds the extension into dist/chrome and dist/firefox: the same files, each browser's own manifest.
//
// A browser loads an extension's scripts as they are, one file each: the worker and the two scripts that run on
// pages can't be split into pieces that load each other. So each is built on its own into a single file, and the
// options page, an ordinary page of the extension's own, is built the ordinary way.
import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { build } from "vite";

const root = path.resolve(import.meta.dirname, "..");
const web = path.resolve(root, "../web");
const dist = path.join(root, "dist");
const out = path.join(dist, "chrome");
const { version } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

/** The scripts that must each be one file: the name it's built as, and where it starts. */
const SCRIPTS = {
  background: "src/background.ts",
  youtube: "src/content/youtube.tsx",
  page: "src/content/page.tsx",
};

const shared = {
  configFile: false,
  root,
  logLevel: "warn",
  plugins: [react()],
  resolve: { alias: { "@web": path.join(web, "src") } },
  // A script built as one plain file gets no "this is production" from the bundler; React asks, so it's said here.
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
};

rmSync(dist, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// The options page. The app's own public files come along with it: the font the app's styles ask for, and the icons.
await build({
  ...shared,
  base: "./",
  publicDir: path.join(web, "public"),
  build: { outDir: out, emptyOutDir: true, modulePreload: { polyfill: false }, rollupOptions: { input: path.join(root, "options.html") } },
});
// Two of those files are the web app's alone.
for (const stray of ["manifest.webmanifest", "icon.svg"]) rmSync(path.join(out, stray), { force: true });

for (const [name, entry] of Object.entries(SCRIPTS)) {
  await build({
    ...shared,
    publicDir: false,
    build: {
      outDir: out,
      emptyOutDir: false,
      lib: { entry: path.join(root, entry), formats: ["iife"], name: `panki_${name}`, fileName: () => `${name}.js` },
    },
  });
}

/**
 * What the extension is and what it may do, the same for both browsers but for how the worker is named.
 *
 * It asks for little on purpose. It runs by itself on one site only, the video site, to draw the line under the
 * player. Anywhere else it does nothing until it's asked (`activeTab`: the one tab acted on, for that one act). And
 * the only address it may ever call is Panki's own, which isn't known here: it's asked for by name, on the options
 * page, when the owner types it (`optional_host_permissions` only says what may be asked for). Word audio from Forvo
 * comes through Panki too: its server holds the key and calls Forvo. Looking words up on
 * other sites asks for those sites the same way, on the options page, and the worker then puts the page's script
 * there itself (`scripting.registerContentScripts`); nothing here names them. `unlimitedStorage` keeps the browser
 * from clearing the dictionaries, which can be hundreds of megabytes, when the disk runs low. `alarms` wakes the worker
 * every hour to ask Panki whether there's a newer build, and `downloads` fetches it as a zip when asked (`updates.ts`).
 */
const manifest = {
  manifest_version: 3,
  name: "Panki",
  version,
  description: "Add what you hear and read to your Panki decks.",
  icons: { 32: "icons/icon-32.png", 192: "icons/icon-192.png", 512: "icons/icon-512.png" },
  action: { default_icon: { 32: "icons/icon-32.png" }, default_title: "Add to Panki" },
  options_ui: { page: "options.html", open_in_tab: true },
  permissions: ["storage", "unlimitedStorage", "contextMenus", "scripting", "activeTab", "alarms", "downloads"],
  optional_host_permissions: ["http://*/*", "https://*/*"],
  content_scripts: [{ matches: ["https://www.youtube.com/*"], js: ["youtube.js"], run_at: "document_idle" }],
};
const write = (dir, extra) => writeFileSync(path.join(dir, "manifest.json"), `${JSON.stringify({ ...manifest, ...extra }, null, 2)}\n`);

write(out, { minimum_chrome_version: "116", background: { service_worker: "background.js" } });

const firefox = path.join(dist, "firefox");
cpSync(out, firefox, { recursive: true });
write(firefox, {
  background: { scripts: ["background.js"] },
  browser_specific_settings: { gecko: { id: "panki@panki.invalid", strict_min_version: "128.0" } },
});

/**
 * Chrome's build, made to be downloaded from Panki and kept up to date by hand (the owner, 2026-10-22: no store). The
 * Update Panki script goes in with it (`update/`): double-clicked, it fetches the newest zip and puts it over the
 * folder it's in. Then the build's fingerprint: every file it's made of, read in one order, through SHA-256. The same
 * files always give the same one, so a deploy that changes nothing of the extension leaves it, and an extension tells
 * an update by comparing its own with the one Panki's server carries (the contracts' `extension.ts`). It's written
 * beside them as `build.json`, left out of what it's worked out from, with the day the extension's sources last changed
 * (from git; the day it's built when git can't say). The zip is the server's to make as it's downloaded, with its own
 * address in it (`apps/api/src/routes/extension.ts`).
 */
const updater = path.join(root, "update");
// A batch file is read by Windows' own rules: lines that end the Windows way, whatever the checkout gave.
writeFileSync(path.join(out, "Update Panki.cmd"), readFileSync(path.join(updater, "Update Panki.cmd"), "utf8").replace(/\r?\n/g, "\r\n"));
cpSync(path.join(updater, "update.ps1"), path.join(out, "update.ps1"));

/** Every file under a folder, as paths from it with forward slashes, in one fixed order. */
function filesUnder(dir, from = dir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const at = path.join(dir, entry.name);
      if (entry.isDirectory()) return filesUnder(at, from);
      return entry.isFile() ? [path.relative(from, at).split(path.sep).join("/")] : [];
    })
    .sort();
}

const BUILD_FILE = "build.json";
const hash = createHash("sha256");
for (const name of filesUnder(out).filter((n) => n !== BUILD_FILE)) {
  hash.update(`${name}\0`);
  hash.update(readFileSync(path.join(out, ...name.split("/"))));
  hash.update("\0");
}
const fingerprint = hash.digest("hex").slice(0, 12);

/** The day the extension's sources last changed: its own, the app's pieces it's built of, and the contracts. */
function changedAt() {
  try {
    const repo = path.resolve(root, "../..");
    const said = execFileSync("git", ["log", "-1", "--format=%cs", "--", "apps/extension", "apps/web/src", "apps/web/public", "packages/contracts"], { cwd: repo, encoding: "utf8" }).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(said)) return said;
  } catch {
    // No git here, or no history: the day it's built stands in.
  }
  return new Date().toISOString().slice(0, 10);
}
writeFileSync(path.join(out, BUILD_FILE), `${JSON.stringify({ fingerprint, changedAt: changedAt() }, null, 2)}\n`);

console.log(`Panki extension ${version} (${fingerprint}) built: ${path.relative(process.cwd(), out)} for Chrome, ${path.relative(process.cwd(), firefox)} for Firefox.`);
