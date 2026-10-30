import { useState } from "react";
import { POOL_MAX, againPlaceOf, type Deck, type DeckSettings } from "@panki/contracts";
import { Ask } from "../components/Ask";
import { Button } from "../components/Button";
import { DeckNameForm } from "../components/DeckNameForm";
import { Dropdown } from "../components/Dropdown";
import { Icon } from "../components/Icon";
import { NumberField } from "../components/NumberField";
import { Segmented } from "../components/Segmented";
import { Setting } from "../components/Setting";
import { Toggle } from "../components/Toggle";
import { useSavedSoon } from "../hooks/useSavedSoon";
import { count } from "../words";

type Props = {
  deck: Deck;
  cardCount: number;
  /** The names of what the deck is made of, shown read-only. */
  cardTypeName: string;
  /** Whether its card type has a field that goes with an example (`exampleFieldsOf`): its cards can have more than one. */
  takesExamples: boolean;
  srsTypeName: string;
  /** Opens each one's own screen; absent when the type is missing. */
  onOpenCardType?: (() => void) | undefined;
  onOpenSrsType?: (() => void) | undefined;
  onRename: (name: string) => Promise<void>;
  /** Changes some of how this deck's reviews run; gives back all of them as saved. */
  onChangeSettings: (patch: Partial<DeckSettings>) => Promise<DeckSettings>;
  onRemove: () => Promise<void>;
};

/** How many cards are in play when the limit is first switched on. */
const POOL_START = 10;

const NEW_PLACE_OPTIONS = [
  { id: "first", label: "Before reviews" },
  { id: "last", label: "After reviews" },
  { id: "scattered", label: "Scattered" },
] as const;
const NEW_ORDER_OPTIONS = [
  { id: "added", label: "Oldest added first" },
  { id: "shuffled", label: "Shuffled" },
] as const;
const REVIEW_ORDER_OPTIONS = [
  { id: "random", label: "Shuffled" },
  { id: "overdue", label: "Longest overdue" },
] as const;
/** Under a setting: what the choice made right now does, never a tour of the others. */
const REVIEW_ORDER_WORDS: Record<DeckSettings["reviewOrder"], string> = {
  random: "The cards due come in a random order.",
  overdue: "The card that has been due the longest comes first.",
};
const AGAIN_PLACE_WORDS: Record<DeckSettings["againPlace"], string> = {
  // A pile of its own (the owner, 2026-10-21: "make it more obvious… like there's a separate section for cards that failed").
  end: "Cards you're asked again collect in a separate pile at the end, after the rest of the review.",
  random: "A card you're asked again comes back at a random point in the rest of the review.",
};
/** With only so many cards in play, a card asked again lands anywhere among them (`againPlaceOf`). */
const againInPool = (pool: number) => `A card you're asked again comes back at a random point within the next ${count(pool, "card", "cards")}.`;
/** Where "Reviews a day, at most" starts when a limit is switched on. */
const REVIEWS_LIMIT_START = 100;
const AGAIN_PLACE_OPTIONS = [
  { id: "end", label: "At the end" },
  { id: "random", label: "Anywhere" },
] as const;
const EXAMPLE_SHOWN_OPTIONS = [
  { id: "rotate", label: "Rotate" },
  { id: "newest", label: "Newest" },
  { id: "random", label: "Random" },
] as const;

/**
 * A type the deck is made of: its name as a choice that can't be changed here (greyed, as a disabled `Dropdown`), and
 * Open beside it to see or edit the type itself. One button that both showed the name and opened the type read as a
 * way to change it (the owner, 2026-10-30).
 */
function MadeOf({ id, label, name, onOpen }: { id: string; label: string; name: string; onOpen: (() => void) | undefined }) {
  return (
    <Setting
      id={id}
      label={label}
      control={
        <span className="setting-pair">
          <Dropdown id={id} label={label} options={[{ id: name, label: name }]} value={name} disabled onChange={() => undefined} />
          {/* A chip, so it stands as tall as the dropdown beside it. */}
          <Button id={`${id}-open`} variant="chip" disabled={!onOpen} onClick={onOpen}>
            Open
            <Icon name="forward" />
          </Button>
        </span>
      }
    />
  );
}

/** A deck's settings: "About" (its name, and the card type and SRS type it's made of, shown and not changed), how its reviews run (saved a moment after each change), and at the bottom, delete, which asks once, here, with what it costs. */
export function DeckSettingsView({ deck, cardCount, cardTypeName, takesExamples, srsTypeName, onOpenCardType, onOpenSrsType, onRename, onChangeSettings, onRemove }: Props) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [own, patch, ownFailure] = useSavedSoon<DeckSettings>(deck.settings, onChangeSettings);
  const cards = count(cardCount, "card", "cards");

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setFailure(null);
    try {
      await work();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* What the deck is: its name, to change, and what it's made of, shown and not changed here (a press opens the type's own screen). */}
      <section className="panel" aria-labelledby="deck-about-title">
        <h2 id="deck-about-title" className="panel-title">
          About
        </h2>
        <DeckNameForm id="deck-rename" initial={deck.name} action="Save" busyAction="Saving…" onlyWhenChanged onSubmit={onRename} />
        <MadeOf id="deck-card-type" label="Card type" name={cardTypeName} onOpen={onOpenCardType} />
        <MadeOf id="deck-srs-type" label="SRS type" name={srsTypeName} onOpen={onOpenSrsType} />
      </section>

      <section className="panel" aria-labelledby="deck-new-title">
        <h2 id="deck-new-title" className="panel-title">
          New cards
        </h2>
        {ownFailure ? (
          <p className="load-error" role="alert">
            {ownFailure}
          </p>
        ) : null}
        <Setting id="newPerDay" label="New cards a day" control={<NumberField id="deck-new-per-day" label="New cards a day" value={own.newPerDay} min={0} max={999} onChange={(newPerDay) => patch({ newPerDay })} />} />
        {/* With no new cards a day there's nothing for these two to place or order. */}
        <Setting
          id="newPlace"
          label="In a review, new cards come"
          control={<Segmented idPrefix="deck-new-place" label="In a review, new cards come" options={NEW_PLACE_OPTIONS} value={own.newPlace} disabled={own.newPerDay === 0} onChange={(newPlace) => patch({ newPlace })} />}
        />
        <Setting
          id="newOrder"
          label="Which new cards first"
          control={<Segmented idPrefix="deck-new-order" label="Which new cards first" options={NEW_ORDER_OPTIONS} value={own.newOrder} disabled={own.newPerDay === 0} onChange={(newOrder) => patch({ newOrder })} />}
        />
      </section>

      <section className="panel" aria-labelledby="deck-reviews-title">
        <h2 id="deck-reviews-title" className="panel-title">
          Reviews
        </h2>
        <Setting
          id="reviewsPerDay"
          label="Max reviews a day"
          control={
            <div className="setting-pair">
              <Toggle id="deck-reviews-no-limit" says={{ on: "No limit", off: "Limited" }} on={own.reviewsPerDay === null} onChange={(none) => patch({ reviewsPerDay: none ? null : REVIEWS_LIMIT_START })} />
              {own.reviewsPerDay === null ? null : <NumberField id="deck-reviews-per-day" label="Max reviews a day" value={own.reviewsPerDay} min={1} max={9999} onChange={(reviewsPerDay) => patch({ reviewsPerDay })} />}
            </div>
          }
        />
        <Setting
          id="reviewOrder"
          label="Which reviews first"
          control={<Segmented idPrefix="deck-review-order" label="Which reviews first" options={REVIEW_ORDER_OPTIONS} value={own.reviewOrder} onChange={(reviewOrder) => patch({ reviewOrder })} />}
          why={REVIEW_ORDER_WORDS[own.reviewOrder]}
        />
      </section>

      <section className="panel" aria-labelledby="deck-pace-title">
        <h2 id="deck-pace-title" className="panel-title">
          During a review
        </h2>
        <Setting
          id="todayFirst"
          label="Today's cards before a review"
          control={<Toggle id="deck-today-first" says={{ on: "Shown", off: "Skipped" }} on={own.todayFirst} onChange={(todayFirst) => patch({ todayFirst })} />}
        />
        <Setting
          id="againPlace"
          label="A card asked again comes back"
          control={
            <Segmented idPrefix="deck-again-place" label="A card asked again comes back" options={AGAIN_PLACE_OPTIONS} value={againPlaceOf(own)} disabled={own.pool !== null} onChange={(againPlace) => patch({ againPlace })} />
          }
          why={own.pool !== null ? againInPool(own.pool) : AGAIN_PLACE_WORDS[own.againPlace]}
        />
        <Setting
          id="pool"
          label="Cards at a time"
          control={
            <div className="setting-pair">
              <Toggle id="deck-pool-all" says={{ on: "All of them", off: "Only some" }} on={own.pool === null} onChange={(all) => patch({ pool: all ? null : POOL_START })} />
              {own.pool === null ? null : <NumberField id="deck-pool" label="Cards at a time" value={own.pool} min={1} max={POOL_MAX} onChange={(pool) => patch({ pool })} />}
            </div>
          }
          why={
            own.pool === null
              ? "Every card of a review is in play from the start."
              : `Up to ${count(own.pool, "card", "cards")} at a time. A new card is added once you're done with one.`
          }
        />
        {/* Only a type with a field that goes with an example has examples to choose between. */}
        {takesExamples ? (
          <Setting
            id="exampleShown"
            label="Example shown"
            control={<Segmented idPrefix="deck-example-shown" label="Example shown" options={EXAMPLE_SHOWN_OPTIONS} value={own.exampleShown} onChange={(exampleShown) => patch({ exampleShown })} />}
          />
        ) : null}
      </section>

      <section className={`panel ${asking ? "panel-alarm" : ""}`.trim()} aria-labelledby="deck-delete-title">
        <h2 id="deck-delete-title" className="panel-title">
          Danger Zone
        </h2>
        {asking ? (
          <Ask
            idPrefix="deck-delete"
            question={`Delete “${deck.name}” and its ${cards}?`}
            go={{ words: "Delete deck", busy: "Deleting…" }}
            busy={busy}
            failure={failure}
            onKeep={() => setAsking(false)}
            onGo={() => void run(onRemove)}
          />
        ) : (
          <div className="add-actions add-actions-start">
            <Button id="deck-delete" className="is-danger" onClick={() => setAsking(true)}>
              <Icon name="trash" />
              Delete deck…
            </Button>
          </div>
        )}
      </section>
    </>
  );
}
