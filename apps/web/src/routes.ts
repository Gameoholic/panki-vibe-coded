/**
 * Every screen's address. A route is a screen by ids alone, so it can be written as a path and read back from one:
 * the browser's back and forward (and a mouse's side buttons) walk the screens, and a reload lands where you were.
 * `App` turns a route into its `Screen` once the lists it names are loaded.
 */
export type DeckTab = "cards" | "settings";
/** Inside a card type: its fields, or how its cards look in a review. */
export type TypeTab = "fields" | "layout";
export type Route =
  | { kind: "home" }
  | { kind: "decks" }
  /** `card`: one of its cards open in the list, to change or delete (`/decks/…/cards/…`); the extension opens Panki at one so. */
  | { kind: "deck"; id: string; tab: DeckTab; card?: string | undefined }
  | { kind: "pick" }
  | { kind: "review"; id: string; from: "deck" | "pick" }
  | { kind: "add" }
  | { kind: "types" }
  | { kind: "type"; id: string | null; tab: TypeTab }
  | { kind: "srs" }
  | { kind: "srsNew" }
  | { kind: "srsEdit"; id: string }
  | { kind: "settings" }
  | { kind: "stats" };

const NEW = "new";

export function routePath(route: Route): string {
  switch (route.kind) {
    case "home":
      return "/";
    case "decks":
      return "/decks";
    case "deck":
      if (route.tab === "settings") return `/decks/${route.id}/settings`;
      return route.card ? `/decks/${route.id}/cards/${route.card}` : `/decks/${route.id}`;
    case "pick":
      return "/review";
    case "review":
      return route.from === "deck" ? `/decks/${route.id}/review` : `/review/${route.id}`;
    case "add":
      return "/add";
    case "types":
      return "/types";
    case "type":
      return route.id !== null && route.tab === "layout" ? `/types/${route.id}/layout` : `/types/${route.id ?? NEW}`;
    case "srs":
      return "/srs";
    case "srsNew":
      return `/srs/${NEW}`;
    case "srsEdit":
      return `/srs/${route.id}`;
    case "settings":
      return "/settings";
    case "stats":
      return "/stats";
  }
}

/** The route a path names; a path that names nothing is the home. */
export function parsePath(path: string): Route {
  const [section, id, rest, more] = path.split("/").filter(Boolean);
  switch (section) {
    case "decks":
      if (!id) return { kind: "decks" };
      if (rest === "review") return { kind: "review", id, from: "deck" };
      if (rest === "cards" && more) return { kind: "deck", id, tab: "cards", card: more };
      return { kind: "deck", id, tab: rest === "settings" ? "settings" : "cards" };
    case "review":
      return id ? { kind: "review", id, from: "pick" } : { kind: "pick" };
    case "add":
      return { kind: "add" };
    case "types":
      if (!id) return { kind: "types" };
      return id === NEW ? { kind: "type", id: null, tab: "fields" } : { kind: "type", id, tab: rest === "layout" ? "layout" : "fields" };
    case "srs":
      if (!id) return { kind: "srs" };
      return id === NEW ? { kind: "srsNew" } : { kind: "srsEdit", id };
    case "settings":
      return { kind: "settings" };
    case "stats":
      return { kind: "stats" };
    default:
      return { kind: "home" };
  }
}
