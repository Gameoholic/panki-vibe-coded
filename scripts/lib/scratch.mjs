// A scratch instance and the browsers that drive it: the API and the web on their own ports with an empty data folder,
// and headless Chrome over the DevTools protocol. Never the owner's data or servers.
// Used by verify.mjs. No dependency: Node's own WebSocket.
import { spawn, execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const API_PORT = 3101;
export const WEB_PORT = 5174;
export const CDP_PORT = 9333;
export const ROOT = path.resolve(import.meta.dirname, "..", "..");
export const CHROME = process.env.CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

export const scratch = mkdtempSync(path.join(tmpdir(), "panki-verify-"));
export const shots = path.join(scratch, "shots");
mkdirSync(shots);

const children = [];
export function start(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts });
  children.push(child);
  const echo = (chunk) => {
    if (process.env.VERBOSE) process.stdout.write(chunk);
  };
  child.stdout.on("data", echo);
  child.stderr.on("data", echo);
  return child;
}
export function stopAll() {
  for (const child of children) {
    if (child.exitCode !== null) continue;
    try {
      if (process.platform === "win32") execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
      else child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
}
process.on("exit", stopAll);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function waitFor(label, check, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < until) {
    try {
      if (await check()) return;
    } catch (e) {
      lastError = e;
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}`);
}
export async function httpOk(url) {
  const res = await fetch(url);
  return res.ok;
}
export const api = (p) => `http://127.0.0.1:${API_PORT}/api${p}`;
export const json = { "content-type": "application/json" };
export async function getJson(p) {
  return (await fetch(api(p))).json();
}
/** One row straight from the scratch database, read-only, for what the API deliberately doesn't show (what's kept after a delete). */
export function dbRow(sql, ...params) {
  const db = new DatabaseSync(path.join(scratch, "data", "panki.sqlite"), { readOnly: true });
  try {
    return db.prepare(sql).get(...params);
  } finally {
    db.close();
  }
}

// ---------- a tiny DevTools client over Node's built-in WebSocket ----------
export class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve);
      ws.addEventListener("error", reject);
    });
    return new Cdp(ws);
  }
  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const { result, exceptionDetails } = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? "evaluate failed");
    return result.value;
  }
  text(selector) {
    return this.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent`);
  }
  value(selector) {
    return this.eval(`document.querySelector(${JSON.stringify(selector)})?.value`);
  }
  count(selector) {
    return this.eval(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
  }
  exists(selector) {
    return this.eval(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
  }
  pressed(selector) {
    return this.eval(`document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-pressed') === 'true'`);
  }
  checked(selector) {
    return this.eval(`document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-checked') === 'true'`);
  }
  /** The centre of the element, scrolled into view first: a dispatched click lands only inside the window. */
  async rect(selector) {
    const r = await this.eval(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({ block: "center", inline: "nearest" }); const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`,
    );
    if (!r) throw new Error(`No element matches ${selector}`);
    return r;
  }
  async click(selector) {
    const { x, y } = await this.rect(selector);
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  }
  async tap(selector) {
    const { x, y } = await this.rect(selector);
    await this.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await this.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  async type(selector, text) {
    await this.eval(`document.querySelector(${JSON.stringify(selector)}).focus()`);
    await this.send("Input.insertText", { text });
  }
  async key(key, code, keyCode, text, modifiers = 0) {
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: keyCode, text, modifiers });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode, modifiers });
  }
  enter() {
    return this.key("Enter", "Enter", 13, "\r");
  }
  /** Ctrl+Enter: sends the form from a box of several lines. */
  ctrlEnter() {
    return this.key("Enter", "Enter", 13, undefined, 2);
  }
  /** Ctrl+Z: undoes in the SRS editor. */
  ctrlZ() {
    return this.key("z", "KeyZ", 90, undefined, 2);
  }
  space() {
    return this.key(" ", "Space", 32, " ");
  }
  /** The window, or with `clip` ({ x, y, width, height } in the window) just that part of it. */
  async screenshot(name, clip) {
    const { data } = await this.send("Page.captureScreenshot", { format: "png", ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    const file = path.join(shots, `${name}.png`);
    writeFileSync(file, Buffer.from(data, "base64"));
    return file;
  }
  wheel(x, y, deltaY) {
    return this.send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY });
  }
  async navigate(url) {
    await this.send("Page.navigate", { url });
    await waitFor("page load", () => this.eval("document.readyState === 'complete'"));
  }
  fitsScreen() {
    return this.eval("document.documentElement.scrollWidth <= window.innerWidth");
  }
  litTab(id) {
    return this.eval(`document.querySelector(${JSON.stringify(`#tab-${id}`)})?.getAttribute('aria-current') === 'page'`);
  }
}

/** Starts the scratch API and web server and waits until both answer. */
export async function startServers() {
  const shell = process.platform === "win32";
  start("pnpm", ["--filter", "@panki/api", "dev"], { cwd: ROOT, shell, env: { ...process.env, PORT: String(API_PORT), PANKI_DATA_DIR: path.join(scratch, "data") } });
  start("pnpm", ["--filter", "@panki/web", "dev"], { cwd: ROOT, shell, env: { ...process.env, PANKI_WEB_PORT: String(WEB_PORT), PANKI_API_PORT: String(API_PORT) } });
  await waitFor("API", () => httpOk(api("/decks")));
  await waitFor("web", () => httpOk(`http://127.0.0.1:${WEB_PORT}/`));
}

/** Headless Chrome with a throwaway profile, connected. */
export async function openChrome() {
  start(CHROME, [
    "--headless=new",
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${path.join(scratch, "chrome")}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1280,900",
    "about:blank",
  ]);
  let wsUrl;
  await waitFor("Chrome", async () => {
    const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const targets = await res.json();
    wsUrl = targets.find((t) => t.type === "page")?.webSocketDebuggerUrl;
    return Boolean(wsUrl);
  });
  const cdp = await Cdp.connect(wsUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  return cdp;
}
