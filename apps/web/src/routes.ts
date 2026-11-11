/** @panki Every screen's address: its path, and the screen a path names (`Route`, `routePath`, `parsePath`). */
import { ActionPlaceId, AiPlaceId } from "@panki/contracts";

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
  /** A Panki AI template, the account's own or one of Panki's starters (`starter:grammar`), from Settings → Panki AI. */
  | { kind: "aiTemplate"; id: string }
  /** A new template of a place, picking what it starts from. */
  | { kind: "aiNew"; place: AiPlaceId }
  /** A Panki AI action, the account's own or one of Panki's, from Settings → Panki AI; or, `id` null, a new one of a place. */
  | { kind: "aiAction"; id: string }
  | { kind: "aiAction"; id: null; place: ActionPlaceId }
  /** What everyone shares and an admin alone changes: its own screen, at the bar's far end. */
  | { kind: "admin" }
  | { kind: "stats" }
  /** Where streaks are made, changed and deleted: a place of its own in the bar, beside Stats. */
  | { kind: "streaks" };

const NEW = "new";
/** Where Panki AI's templates live in the addresses: under Settings, whose Panki AI tab lists them. */
const AI_TEMPLATES = "/settings/ai";

/** A part of a path as it was written into it; null when it's no part a path of Panki's could hold. */
function decoded(part: string): string | null {
  try {
    return decodeURIComponent(part);
  } catch {
    return null;
  }
}

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
    // A starter's id holds a colon, so ids are written encoded here (and read back decoded).
    case "aiTemplate":
      return `${AI_TEMPLATES}/templates/${encodeURIComponent(route.id)}`;
    case "aiNew":
      return `${AI_TEMPLATES}/${NEW}/${route.place}`;
    // A place with actions has no templates, so a new action's address is its place's new one.
    case "aiAction":
      return route.id === null ? `${AI_TEMPLATES}/${NEW}/${route.place}` : `${AI_TEMPLATES}/actions/${encodeURIComponent(route.id)}`;
    case "admin":
      return "/admin";
    case "stats":
      return "/stats";
    case "streaks":
      return "/streaks";
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
    case "settings": {
      if (id !== "ai" || !more) return { kind: "settings" };
      if (rest === "templates") {
        const templateId = decoded(more);
        return templateId ? { kind: "aiTemplate", id: templateId } : { kind: "settings" };
      }
      if (rest === "actions") {
        const actionId = decoded(more);
        return actionId ? { kind: "aiAction", id: actionId } : { kind: "settings" };
      }
      if (rest !== NEW) return { kind: "settings" };
      const withActions = ActionPlaceId.safeParse(more);
      if (withActions.success) return { kind: "aiAction", id: null, place: withActions.data };
      const place = AiPlaceId.safeParse(more);
      return place.success ? { kind: "aiNew", place: place.data } : { kind: "settings" };
    }
    case "admin":
      return { kind: "admin" };
    // Streaks were a tab of Stats once (`/stats/streaks`): that address still lands on them.
    case "stats":
      return id === "streaks" ? { kind: "streaks" } : { kind: "stats" };
    case "streaks":
      return { kind: "streaks" };
    default:
      return { kind: "home" };
  }
}
