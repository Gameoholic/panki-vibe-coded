/** @panki Anything loading, anywhere: the shape of what's coming (`Skeleton`, `Bone`, `SkeletonShape`). Never "Loading…", a spinner, or a blank that pops in. */
import type { CSSProperties } from "react";
import { CORNER_MARK_IDS } from "@panki/contracts";
import { FloatPanel } from "./FloatPanel";

/**
 * What's coming, drawn as its shape while it loads, wherever anything in the app loads: quiet blocks where the words, rows and tiles will be, a soft sweep passing over them. Each
 * shape is built of the real screen's own classes (a deck's row is a `deck-row`, a setting a `setting`, the review a
 * `review is-fit`), so it stands exactly where the real thing will and nothing jumps as it arrives; and it shows only
 * once a load has taken a moment (`.skel-in`, `.skel`), so a quick one never shows it at all. The one way anything in the app says it's loading; never
 * "Loading…" in words.
 */

/** One block: a line of words, a button, a picture, as wide and as tall as given. */
export function Bone({ w = "100%", h = "0.9em", round = false, className = "" }: { w?: string; h?: string; round?: boolean; className?: string }) {
  const style: CSSProperties = { width: w, height: h };
  return <span className={`skel ${round ? "is-round" : ""} ${className}`.trim()} style={style} aria-hidden="true" />;
}

/**
 * The shapes a screen or a part of one takes while it loads, one registry: a list of rows (decks, types, SRS types), a
 * deck's cards, the rows of a panel in Settings (`kept-row`: storage, the extension, dictionaries), today's cards before
 * a review (`review-today`), panels of settings, setting rows inside a panel already there, the board's tiles, a review, a card
 * type's Layout (the review with its panel over it), a form, an editor beside its card, a few lines in a panel, and one tile's body. A new kind of screen takes the one it looks
 * like, or is one entry here built of its own classes.
 */
export type SkeletonShape = "rows" | "picks" | "cards" | "kept" | "panels" | "settings" | "board" | "today" | "done" | "review" | "layout" | "form" | "editor" | "lines" | "tile";

/** Widths that vary a little from row to row, so a list of blocks reads as a list of things and not a grid. */
const WIDTHS = ["46%", "62%", "38%", "54%", "70%", "42%"];
const widthAt = (i: number) => WIDTHS[i % WIDTHS.length] ?? "50%";
const times = (n: number) => Array.from({ length: n }, (_, i) => i);

/** What says it's loading, on the shape's own root. */
const status = { role: "status", "aria-label": "Loading", "aria-busy": true } as const;

/** Setting rows as `Setting` draws them: the label at the left, the control at the right. */
function SettingRows({ count }: { count: number }) {
  return (
    <>
      {times(count).map((i) => (
        <div key={i} className="setting">
          <div className="setting-head">
            <span className="setting-label">
              <Bone w={`${7 + (i % 3) * 2}em`} h="1em" />
            </span>
            <Bone w="9em" h="2.4em" />
          </div>
        </div>
      ))}
    </>
  );
}

/** A count over the review: its number's room (a space in the number's own type) and a block for its words. */
function CountShape({ w }: { w: string }) {
  return (
    <span className="review-count">
      <span className="review-n">{" "}</span>
      <Bone w={w} h="1em" />
    </span>
  );
}

/**
 * The review's frame as `ReviewScreen` draws it: the counts with Step back, Undo, Chart and Flag at their right, the
 * card taking the room, Show back of card under it, and the answers set apart under that when there are some (`asides`).
 */
function ReviewShape({ asides = false }: { asides?: boolean }) {
  return (
    <>
      <div className="review-top">
        <span className="review-counts">
          <CountShape w="3.5em" />
          <CountShape w="2.5em" />
          <CountShape w="3em" />
        </span>
        <span className="review-tools">
          {REVIEW_TOOL_PX.map((w, i) => (
            <Bone key={i} w={w} h={REVIEW_TOOL_H} />
          ))}
        </span>
      </div>
      <div className="review-card is-still skel-review-card">
        <span className="review-place">
          <Bone w="6em" h="1.5em" round />
        </span>
        <div className="review-body">
          <Bone w="30%" h="3em" />
          <Bone w="60%" h="1.1em" className="is-faint" />
        </div>
      </div>
      <div className="review-actions">
        <Bone h="46px" />
      </div>
      {asides ? (
        <div className="review-asides">
          <Bone w="9em" h={ASIDE_H} />
          <Bone w="9em" h={ASIDE_H} />
        </div>
      ) : null}
    </>
  );
}

/**
 * The review's Step back (with its key, Backspace to begin with), Undo, Chart and Flag (no key to begin with) in the
 * counts' row, and an answer set apart: Undo and Chart as measured, Step back and Flag worked out from them.
 */
const REVIEW_TOOL_PX = ["180px", "77px", "79px", "72px"] as const;
const REVIEW_TOOL_H = "30px";
const ASIDE_H = "30px";
/** The Layout tab's panel as measured: its header's buttons, and each of its rows' controls (a switch, a dropdown, a choice of sides, the chips of what isn't on the side). */
const PANEL_BUTTON = "32px";
const TAG_SWITCH = { w: "119px", h: "46px" };
const DROPDOWN = { w: "70px", h: "33px" };
const SIDES = { w: "125px", h: "48px" };
const AWAY_CHIP = { w: "94px", h: "28px" };

/** A setting row as `Setting` draws it, its label's block and its control's. */
function SettingShape({ label, control }: { label: string; control: { w: string; h: string } }) {
  return (
    <div className="setting">
      <div className="setting-head">
        <span className="setting-label">
          <Bone w={label} h="1em" />
        </span>
        <Bone w={control.w} h={control.h} />
      </div>
    </div>
  );
}

/**
 * One tile's body as `widgets.tsx` → `Tile` draws it: the figure (`.w-hero`, 36 px) with the change under it, the
 * chart (`.w-col`'s 14 px cap, 64 px of columns and their labels), the foot line. The tile itself is held at the height
 * this device last drew it (`Widget`), so the shape only has to stand where those parts will.
 */
const TILE_HERO_H = "36px";
const TILE_CHART_H = "96px";
function TileBody() {
  return (
    <div className="skel-tile">
      <Bone w="35%" h={TILE_HERO_H} />
      <Bone w="55%" h="0.8em" className="is-faint" />
      <Bone h={TILE_CHART_H} />
      <Bone w="70%" h="0.85em" />
    </div>
  );
}

/** `TodayBar`'s parts as measured: a character of its bold words, Show cards and Hide cards, a button's height, and Start's room besides its words (its padding, the gaps and keycap, 82 px as measured, and its play icon's 16 px with its 8 px gap). */
const TODAY_CHAR_PX = 8.6;
const TODAY_SHOW_PX = "134px";
const TODAY_HIDE_PX = "126px";
const TODAY_BUTTON_H = "42px";
const TODAY_START_PX = 106;
/** A character of the quieter words after the bar's controls (what's left for later, what extra study has), as measured. */
const TODAY_LEFT_CHAR_PX = 6.6;
/** A `NumberField` as measured: its − and +, the number between them, and the gaps. */
const NUMBER_FIELD_PX = "160px";
const NUMBER_FIELD_H = "46px";
/** "Coming up" at a review's end, as measured: how wide each of its days' words is ("Tomorrow", "In 2 days", "In 3 days", "This week": `ReviewView` → `COMING_UP`). */
const COMING_UP_WORDS = ["4.6em", "3.85em", "3.85em", "4.45em"];
/** A button's room besides its words (its padding, and its icon's 16 px and 8 px gap since it has one), and a character of them, as measured: what sizes the button at a review's end. */
const BUTTON_PAD_PX = 60;
const BUTTON_CHAR_PX = 9;

/**
 * `count` is how many rows, lines or tiles (for `done`, how many cards extra study offers, none for no bar); `parts`,
 * for `today`, how many tiles each of its panels holds (reviews, then new), for `layout` how many chips stand for what
 * isn't on the front and whether the answers set apart hold a row (1 or 0); `firstReviews` whether the first is the
 * reviews one, whose head alone carries a stage's chip; `words` and `start`, for `today`, what its bar will say (the
 * counts, Start's label), known from the deck, so their blocks are as wide as the words will be; `words`, for `done`,
 * what the button at its foot says, and `available` how many new cards extra study has.
 */
export function Skeleton({ shape, count, parts, firstReviews = false, tabs = false, words = "", start = "", available = 0 }: { shape: SkeletonShape; count?: number; parts?: readonly number[]; firstReviews?: boolean; tabs?: boolean; words?: string; start?: string; available?: number }) {
  switch (shape) {
    case "today": {
      // As `ReviewView` → `TodayCards` draws today's cards: the folded bar (`TodayBar`: the counts, Show cards, Start at
      // the right), then, only when they open shown, a panel of tiles for each kind.
      const open = (parts ?? []).length > 0;
      return (
        <section className="skel-in review-today" {...status}>
          <div className="panel today-bar">
            <span className="today-counts">
              <Bone w={`${Math.max(words.length, 5) * TODAY_CHAR_PX}px`} h="1em" />
            </span>
            <Bone w={open ? TODAY_HIDE_PX : TODAY_SHOW_PX} h={TODAY_BUTTON_H} />
            <span className="today-left" />
            <Bone w={`${TODAY_START_PX + Math.max(start.length, 13) * TODAY_CHAR_PX}px`} h="56px" />
          </div>
          {(parts ?? []).length > 0 ? (
            <div className="review-today">
              {(parts ?? []).map((tiles, i) => (
                <section key={i} className="panel today-panel">
                  <div className="today-head">
                    <h2 className="panel-title">
                      <Bone w="5em" h="0.8em" />
                    </h2>
                    <span className="today-of">
                      <Bone w="2.5em" h="0.9em" />
                    </span>
                    <span className="chips">
                      {firstReviews && i === 0 ? <Bone w="8.5em" h="33px" /> : null}
                      <Bone w="2.6em" h="33px" />
                      <Bone w="3.6em" h="33px" />
                    </span>
                  </div>
                  <div className="today-cards">
                    {times(tiles).map((t) => (
                      <div key={t} className="btn btn-chip today-card">
                        <Bone w={`${2.4 + (t % 3) * 0.8}em`} h="26px" />
                        <Bone w="5.5em" h="21px" round />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : null}
        </section>
      );
    }
    case "done": {
      // As `ReviewView` draws its end with nothing to review: the title, extra study's bar when there are new cards for
      // it (`TodayCards` under its name, how many after Show cards, how many it has, Start), what's coming up, and the
      // button at the foot.
      const extra = count ?? 0;
      const has = `${Math.max(available, extra)} new ${Math.max(available, extra) === 1 ? "card" : "cards"} available`;
      const start = `Start ${extra} ${extra === 1 ? "card" : "cards"}`;
      return (
        <section className="skel-in summary review-done" {...status}>
          <h2 className="summary-title skel-line">
            <Bone w="12.5em" h="1.2em" />
          </h2>
          {extra > 0 ? (
            <section className="review-today">
              <div className="panel today-bar">
                <span className="today-name">
                  <Bone w="5.25em" h="1em" />
                </span>
                <Bone w={TODAY_SHOW_PX} h={TODAY_BUTTON_H} />
                <Bone w={NUMBER_FIELD_PX} h={NUMBER_FIELD_H} />
                <span className="today-left skel-line">
                  <Bone w={`${has.length * TODAY_LEFT_CHAR_PX}px`} h="1em" className="is-faint" />
                </span>
                <Bone w={`${TODAY_START_PX + start.length * TODAY_CHAR_PX}px`} h="56px" />
              </div>
            </section>
          ) : null}
          <section className="panel">
            <h3 className="panel-title skel-line">
              <Bone w="6.2em" h="0.9em" />
            </h3>
            <div className="next-days">
              {COMING_UP_WORDS.map((w, i) => (
                <div key={i} className="next-day">
                  <span className="skel-line">
                    <Bone w={w} h="1em" />
                  </span>
                  <span className="barwrap" />
                  <span className="n skel-line">
                    <Bone w="1.1em" h="1em" />
                  </span>
                </div>
              ))}
            </div>
          </section>
          <div className="add-actions add-actions-start">
            <Bone w={`${BUTTON_PAD_PX + words.length * BUTTON_CHAR_PX}px`} h="42px" />
          </div>
        </section>
      );
    }
    case "picks":
      // As `ReviewPickView` draws the decks to review: a title, then a `TodayBar` for each deck.
      return (
        <section className="skel-in" {...status}>
          <h2 className="list-title">
            <Bone w="6em" h="1.5em" />
          </h2>
          <ul className="pick-list">
            {times(count ?? 3).map((i) => (
              <li key={i}>
                <div className="panel today-bar">
                  <span className="today-name">
                    <Bone w={`${[7.5, 4.5, 6][i % 3]}em`} h="1em" />
                  </span>
                  <span className="today-counts">
                    <Bone w={`${9 * TODAY_CHAR_PX}px`} h="1em" className="is-faint" />
                  </span>
                  <Bone w={TODAY_SHOW_PX} h={TODAY_BUTTON_H} />
                  <span className="today-left" />
                  {/* Start, its play icon before its word. */}
                  <Bone w="90px" h={TODAY_BUTTON_H} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      );
    case "rows":
      // As `DeckList`, `TypesView` and `SrsTypesView` draw theirs: a title, then rows of a name, a line under it and a pill.
      return (
        <section className="skel-in" {...status}>
          <h2 className="list-title">
            <Bone w="5em" h="1em" />
          </h2>
          <ul className="deck-list">
            {times(count ?? 4).map((i) => (
              <li key={i} className="deck-item">
                <div className="btn btn-row deck-row">
                  <span className="deck-name">
                    <Bone w={widthAt(i)} h="1em" />
                    <span className="row-sub">
                      <Bone w={widthAt(i + 3)} h="0.8em" className="is-faint" />
                    </span>
                  </span>
                  <span className="deck-count">
                    <Bone w="3.5em" h="0.9em" />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      );
    case "cards": {
      // As `CardsView` really stands: the count with Sort by at its right and Search under them (there with two cards
      // or more, as the real ones are), then `CardList`'s rows: the word with its sentence, the meaning under them,
      // the pill and its due time at the right, the pencil and delete past them.
      const rows = count ?? 5;
      return (
        <section className="skel-in" {...status}>
          {rows >= 2 ? (
            <>
              <div className="list-head">
                <h2 className="list-title">
                  <Bone w="4em" h="0.8em" />
                </h2>
                <span className="skel-tools">
                  <Bone w="3em" h="0.8em" className="is-faint" />
                  <Bone w="5.5em" h="2em" />
                  <Bone w="10.5em" h="2em" />
                </span>
              </div>
              <div className="list-search">
                <span className="skel-field">
                  <Bone w="3em" h="0.75em" className="is-faint" />
                  <Bone h="38px" />
                </span>
              </div>
            </>
          ) : (
            <h2 className="list-title">
              <Bone w="4em" h="0.8em" />
            </h2>
          )}
          <ul className="card-list">
            {times(rows).map((i) => (
              <li key={i} className="card-row has-state has-tools">
                <div className="card-row-ja">
                  <Bone w={`${3 + (i % 3)}em`} h="1.1em" />
                  <Bone w={widthAt(i)} h="0.95em" className="is-faint" />
                </div>
                <div className="card-meaning">
                  <Bone w={widthAt(i + 2)} h="0.95em" />
                </div>
                <div className="card-state">
                  <Bone w="3.5em" h="1.35em" round />
                  <Bone w="2.5em" h="0.8em" className="is-faint" />
                </div>
                {/* Preview, Edit, Suspend, Delete: each its icon and word. */}
                <div className="card-tools">
                  <Bone w="96px" h="32px" />
                  <Bone w="96px" h="32px" />
                  <Bone w="96px" h="32px" />
                  <Bone w="96px" h="32px" />
                </div>
              </li>
            ))}
          </ul>
        </section>
      );
    }
    case "kept":
      // As Settings' panels list what's kept: a name with a line under it, and a size or a button at the right.
      return (
        <div className="skel-in kept-rows" {...status}>
          {times(count ?? 2).map((i) => (
            <div key={i} className="kept-row">
              <span className="kept-name">
                <Bone w={widthAt(i)} h="1em" />
                <span className="row-sub">
                  <Bone w={widthAt(i + 2)} h="0.8em" className="is-faint" />
                </span>
              </span>
              <span className="kept-size">
                <Bone w="4em" h="1em" />
              </span>
            </div>
          ))}
        </div>
      );
    case "panels":
      // As Settings and a deck's settings draw theirs: panels of setting rows under a small title, `parts` how many rows
      // each panel holds; `tabs` is the Segmented row over the app's Settings, which a deck's settings don't have.
      return (
        <div className="skel-in skel-panels" {...status}>
          {tabs ? <Bone h="42px" /> : null}
          {(parts ?? [4, 3]).map((rows, i) => (
            <section key={i} className="panel">
              <h2 className="panel-title">
                <Bone w="7em" h="0.8em" />
              </h2>
              <SettingRows count={rows} />
            </section>
          ))}
        </div>
      );
    case "settings":
      return (
        <div className="skel-in" {...status}>
          <SettingRows count={count ?? 3} />
        </div>
      );
    case "board":
      return (
        <div className="skel-in board" {...status}>
          {times(count ?? 6).map((i) => (
            <section key={i} className="panel widget">
              <div className="w-head">
                <h3 className="panel-title">
                  <Bone w={widthAt(i)} h="0.8em" />
                </h3>
              </div>
              <TileBody />
            </section>
          ))}
        </div>
      );
    case "review":
      // The review's own frame (`ReviewScreen`, `.review.is-fit`): the counts, the card taking the room, Show answer under it.
      return (
        <section className="skel-in review is-fit" {...status}>
          <ReviewShape />
        </section>
      );
    case "layout": {
      // A card type's Layout tab: the review's frame it's drawn in, and its panel over it, where and as folded as it
      // stands on this device (the real `FloatPanel`): the type's own panel (Full screen shows, the card previewed, the
      // side), and the one for what isn't on the front with each corner mark's switch. `parts` is how many chips stand
      // for what isn't on the front, and whether the answers set apart hold a row under the answers, as last drawn here.
      const [away = 0, asides = 0] = parts ?? [];
      return (
        <section className="skel-in review is-fit" {...status}>
          <ReviewShape asides={asides > 0} />
          <FloatPanel
            id="layout-panel"
            label="Layout"
            title={
              <span className="layout-part-title">
                <Bone w="9em" h="1em" />
              </span>
            }
            tools={
              <>
                <Bone w={PANEL_BUTTON} h={PANEL_BUTTON} />
                <Bone w={PANEL_BUTTON} h={PANEL_BUTTON} />
              </>
            }
          >
            <section className="panel layout-panel">
              <SettingShape label="7em" control={DROPDOWN} />
              <SettingShape label="2.5em" control={SIDES} />
            </section>
            <section className="panel layout-panel">
              {away > 0 ? (
                <div className="layout-away">
                  <Bone w="6em" h="1em" />
                  {times(away).map((i) => (
                    <Bone key={i} w={AWAY_CHIP.w} h={AWAY_CHIP.h} />
                  ))}
                </div>
              ) : null}
              {CORNER_MARK_IDS.map((id) => (
                <SettingShape key={id} label="5.5em" control={TAG_SWITCH} />
              ))}
            </section>
          </FloatPanel>
        </section>
      );
    }
    case "form":
      return (
        <section className="skel-in panel skel-form" {...status}>
          <h2 className="panel-title">
            <Bone w="8em" h="0.8em" />
          </h2>
          {times(3).map((i) => (
            <span key={i} className="skel-field">
              <Bone w="6em" h="0.8em" />
              <Bone h="2.75em" />
            </span>
          ))}
          <Bone w="7em" h="2.6em" />
        </section>
      );
    case "editor":
      return (
        <div className="skel-in skel-editor" {...status}>
          <div className="panel skel-editor-main">
            <Bone w="40%" h="1.2em" />
            <Bone h="16em" />
          </div>
          <section className="panel">
            <SettingRows count={3} />
          </section>
        </div>
      );
    case "lines":
      return (
        <div className="skel-in skel-lines" {...status}>
          {times(count ?? 3).map((i) => (
            <Bone key={i} w={i === (count ?? 3) - 1 && (count ?? 3) > 1 ? "40%" : widthAt(i + 1)} />
          ))}
        </div>
      );
    case "tile":
      return (
        <div className="skel-in" {...status}>
          <TileBody />
        </div>
      );
  }
}
