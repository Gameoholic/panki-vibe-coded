/**
 * The themes: one entry each, and the only place a theme is listed. The colours themselves live in `theme.css` as one
 * `[data-theme]` block per entry; `swatch` carries just the two that show on the chip and the address bar. The choice
 * is kept on the device, not the account, because the phone and the PC are set up differently on purpose (the same
 * call as the home's layout). `index.html` repeats the read-and-apply in a few inline lines so the page never flashes
 * light before its theme on load.
 */
export type ThemeId = "system" | "light" | "dark" | "nord" | "tokyo" | "onedark" | "gruvbox" | "solarized-light" | "solarized-dark" | "monokai";

type Scheme = "light" | "dark";

export type Theme = {
  id: ThemeId;
  name: string;
  /** Which way it goes; `system` has none of its own and takes the device's at run time. */
  scheme: Scheme | null;
  /** Its `--surface` and `--accent`, as on the chip's swatch and Android's address bar. */
  swatch: readonly [surface: string, accent: string];
};

const SYSTEM: Theme = { id: "system", name: "Match the device", scheme: null, swatch: ["#ffffff", "#3350b5"] };

export const THEMES: readonly Theme[] = [
  SYSTEM,
  { id: "light", name: "Light", scheme: "light", swatch: ["#ffffff", "#3350b5"] },
  { id: "dark", name: "Dark", scheme: "dark", swatch: ["#1e1f29", "#8aa4f8"] },
  { id: "nord", name: "Nord", scheme: "dark", swatch: ["#3b4252", "#81a1c1"] },
  { id: "tokyo", name: "Tokyo Night", scheme: "dark", swatch: ["#24283b", "#7aa2f7"] },
  { id: "onedark", name: "One Dark", scheme: "dark", swatch: ["#282c34", "#61afef"] },
  { id: "gruvbox", name: "Gruvbox", scheme: "dark", swatch: ["#3c3836", "#83a598"] },
  { id: "solarized-light", name: "Solarized Light", scheme: "light", swatch: ["#fdf6e3", "#268bd2"] },
  { id: "solarized-dark", name: "Solarized Dark", scheme: "dark", swatch: ["#073642", "#268bd2"] },
  { id: "monokai", name: "Monokai", scheme: "dark", swatch: ["#2d2e27", "#66d9ef"] },
];

const KEY = "panki.theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

const isThemeId = (x: unknown): x is ThemeId => typeof x === "string" && THEMES.some((t) => t.id === x);

export const themeOf = (id: ThemeId): Theme => THEMES.find((t) => t.id === id) ?? SYSTEM;

/** The theme actually drawn: `system` becomes the device's light or dark; anything else is itself. */
export function shownTheme(id: ThemeId): Theme {
  if (id !== "system") return themeOf(id);
  return themeOf(window.matchMedia(DARK_QUERY).matches ? "dark" : "light");
}

/** The colour Android's address bar takes: the top bar's surface. */
export const themeColorOf = (id: ThemeId): string => shownTheme(id).swatch[0];

export function readTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(KEY);
    return isThemeId(raw) ? raw : "system";
  } catch {
    return "system";
  }
}

export function writeTheme(id: ThemeId) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Storage full or switched off: the theme holds for this visit and follows the device next time.
  }
}

/** Stops following the device's scheme; set while `system` is the choice. */
let unfollow: (() => void) | null = null;

/** Puts the theme on the page now, and keeps `system` following the device until another choice is applied. */
export function applyTheme(id: ThemeId) {
  unfollow?.();
  unfollow = null;
  const paint = () => {
    document.documentElement.dataset.theme = shownTheme(id).id;
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", themeColorOf(id));
  };
  paint();
  if (id === "system") {
    const query = window.matchMedia(DARK_QUERY);
    query.addEventListener("change", paint);
    unfollow = () => query.removeEventListener("change", paint);
  }
}
