// Builds the extension into dist/chrome and dist/firefox: the same files, each browser's own manifest.
//
// A browser loads an extension's scripts as they are, one file each: the worker and the two scripts that run on
// pages can't be split into pieces that load each other. So each is built on its own into a single file, and the
// options page, an ordinary page of the extension's own, is built the ordinary way.
import react from "@vitejs/plugin-react";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
 * from clearing the dictionaries, which can be hundreds of megabytes, when the disk runs low.
 */
const manifest = {
  manifest_version: 3,
  name: "Panki",
  version,
  description: "Add what you hear and read to your Panki decks.",
  icons: { 32: "icons/icon-32.png", 192: "icons/icon-192.png", 512: "icons/icon-512.png" },
  action: { default_icon: { 32: "icons/icon-32.png" }, default_title: "Add to Panki" },
  options_ui: { page: "options.html", open_in_tab: true },
  permissions: ["storage", "unlimitedStorage", "contextMenus", "scripting", "activeTab"],
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

console.log(`Panki extension ${version} built: ${path.relative(process.cwd(), out)} for Chrome, ${path.relative(process.cwd(), firefox)} for Firefox.`);
