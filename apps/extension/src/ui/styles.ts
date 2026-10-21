import appCss from "@web/app.css?raw";
import themeCss from "@web/theme.css?raw";
import ownCss from "./extension.css?raw";

/**
 * The app's own styles, as text, for a shadow root on someone else's page: its tokens, its components, then the
 * extension's few extras. One home each, in the app; nothing is copied here. Two things are changed on the way in.
 * The tokens are declared on `:root`, which inside a shadow root is the root's host. And the app's font is declared
 * with files under the app's own address, which on another site would be asked of that site: the declarations are
 * dropped, and the panel falls back to the device's own font, the next one in the app's list.
 */
const tokens = themeCss
  .replace(/@font-face\s*\{[^}]*\}/g, "")
  .replace(/:root\[data-theme="([^"]+)"\]/g, ':host([data-theme="$1"])')
  .replace(/:root\b/g, ":host");

/**
 * The app's tokens alone, declared on one class of the page's own (`.panki-thumb`), for the many small marks on a
 * page's thumbnails: each is a shadow root with a few lines of its own styles, and the tokens reach in from its host as
 * custom properties do, rather than the app's whole stylesheet copied into every one.
 */
export function tokensOn(selector: string): string {
  return themeCss
    .replace(/@font-face\s*\{[^}]*\}/g, "")
    .replace(/:root\[data-theme="([^"]+)"\]/g, `${selector}[data-theme="$1"]`)
    .replace(/:root\b/g, selector);
}

/** `all: initial` first, so nothing the page sets on text (its font, its colour, its line height) is inherited in. */
export const SHADOW_CSS = `:host { all: initial; }\n${tokens}\n${appCss}\n${ownCss}`;
