/**
 * Where Panki is, as its origin ("https://panki.example"), from what was typed; null when that isn't a web address.
 * A bare host is taken as https, but for this machine's and a home network's own addresses, which are http.
 */
/**
 * What the browser is asked to allow for an origin: its host, on any port. A pattern can't name a port in every
 * browser, and one without a port covers them all.
 */
export function hostPattern(origin: string): string {
  const url = new URL(origin);
  return `${url.protocol}//${url.hostname}/*`;
}

export function originOf(text: string): string | null {
  const typed = text.trim();
  if (!typed) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(typed);
  const nearby = /^(localhost|127\.|10\.|192\.168\.|\[::1\])/i.test(typed);
  try {
    const url = new URL(hasScheme ? typed : `${nearby ? "http" : "https"}://${typed}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}
