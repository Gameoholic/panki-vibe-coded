/**
 * A signed-in device in the app's words ("Firefox on Windows"), read off the browser's own description of itself.
 * The full user agent is stored beside it; this is only what the list of devices shows.
 */

// Order matters: Edge says "Chrome" too, Chrome says "Safari" too, Android says "Linux" too.
const BROWSERS: ReadonlyArray<[pattern: RegExp, name: string]> = [
  [/\bEdg(e|A|iOS)?\//, "Edge"],
  [/\b(Firefox|FxiOS)\//, "Firefox"],
  [/\b(Chrome|CriOS)\//, "Chrome"],
  [/\bSafari\//, "Safari"],
];
const SYSTEMS: ReadonlyArray<[pattern: RegExp, name: string]> = [
  [/\bWindows\b/, "Windows"],
  [/\bAndroid\b/, "Android"],
  [/\b(iPhone|iPad|iPod)\b/, "iOS"],
  [/\bMac OS X\b|\bMacintosh\b/, "Mac"],
  [/\bLinux\b/, "Linux"],
];

export function deviceOf(userAgent: string): string {
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? "a browser";
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? "a device";
  return `${browser} on ${system}`;
}
