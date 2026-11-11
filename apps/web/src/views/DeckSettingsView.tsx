import { useRef, useState } from "react";
import type { Deck, DeckSettings } from "@panki/contracts";
import { Ask } from "../components/Ask";
import { Button } from "../components/Button";
import { DeckNameForm } from "../components/DeckNameForm";
import { Dropdown } from "../components/Dropdown";
import { Icon } from "../components/Icon";
import { NumberField } from "../components/NumberField";
import { Setting } from "../components/Setting";
import { Toggle } from "../components/Toggle";
import { useSavedSoon } from "../hooks/useSavedSoon";
import { count } from "../words";

type Props = {
  deck: Deck;
  cardCount: number;
  /** The names of what the deck is made of, shown read-only. */
  cardTypeName: string;
  srsTypeName: string;
  /** Opens each one's own screen; absent when the type is missing. */
  onOpenCardType?: (() => void) | undefined;
  onOpenSrsType?: (() => void) | undefined;
  onRename: (name: string) => Promise<void>;
  /** Changes some of the deck's own settings; gives back all of them as saved. */
  onChangeSettings: (patch: Partial<DeckSettings>) => Promise<DeckSettings>;
  onRemove: () => Promise<void>;
};

/** Where "Reviews a day, at most" starts when a limit is switched on. */
const REVIEWS_LIMIT_START = 100;

/**
 * A type the deck is made of: its name as a choice that can't be changed here (greyed, as a disabled `Dropdown`), and
 * Open beside it to see or edit the type itself. One button that both showed the name and opened the type read as a
 * way to change it.
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

/**
 * A deck's settings: "About" (its name, and the card type and SRS type it's made of, shown and not changed), what of
 * its reviews is its own (new cards and reviews a day; saved a moment after each change), and at the bottom, delete,
 * which asks once, here, with what it costs.
 */
export function DeckSettingsView({ deck, cardCount, cardTypeName, srsTypeName, onOpenCardType, onOpenSrsType, onRename, onChangeSettings, onRemove }: Props) {
  const [asking, setAsking] = useState(false);
  const deleteAt = useRef<HTMLButtonElement>(null);
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

      {/* What of a review is this deck's own; how every review runs is the account's, Settings → General → Reviews. */}
      <section className="panel" aria-labelledby="deck-reviews-title">
        <h2 id="deck-reviews-title" className="panel-title">
          Reviews
        </h2>
        {ownFailure ? (
          <p className="load-error" role="alert">
            {ownFailure}
          </p>
        ) : null}
        <Setting id="newPerDay" label="New cards a day" control={<NumberField id="deck-new-per-day" label="New cards a day" value={own.newPerDay} min={0} max={999} onChange={(newPerDay) => patch({ newPerDay })} />} />
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
      </section>

      <section className="panel" aria-labelledby="deck-delete-title">
        <h2 id="deck-delete-title" className="panel-title">
          Danger Zone
        </h2>
        <div className="add-actions add-actions-start">
          <Button ref={deleteAt} id="deck-delete" className="is-danger" aria-pressed={asking} aria-expanded={asking} onClick={() => setAsking(!asking)}>
            <Icon name="trash" />
            Delete deck…
          </Button>
        </div>
        {asking ? (
          <Ask
            idPrefix="deck-delete"
            anchor={deleteAt}
            question={`Delete “${deck.name}” and its ${cards}?`}
            go={{ words: "Delete deck", busy: "Deleting…" }}
            busy={busy}
            failure={failure}
            onKeep={() => setAsking(false)}
            onGo={() => void run(onRemove)}
          />
        ) : null}
      </section>
    </>
  );
}
