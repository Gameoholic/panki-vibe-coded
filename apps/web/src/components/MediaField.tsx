import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { MEDIA_ENDINGS, type MediaKind } from "@panki/contracts";
import { Ask } from "./Ask";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { MediaView } from "./MediaView";

/** A file of each kind, as a question about deleting it names it. */
const KIND_WORDS: Record<MediaKind, string> = { audio: "sound", video: "clip", image: "picture" };

type Props = {
  /** The id of the button that opens the chooser, so a form can point at this field when it's wrong. */
  id: string;
  label: string;
  /** The kinds of file the field takes: what the chooser is told to offer. */
  kinds: readonly MediaKind[];
  /** What the file showing is (the one picked, or else the one the card holds): how it's drawn. */
  kind: MediaKind | null;
  /** The file picked for it, or none yet. */
  file: File | null;
  /** Where the file the card already holds here is (`api.mediaUrl`), when a card is being changed: shown until another is picked or it's taken off. */
  held?: string | undefined;
  /** A file was chosen or dropped (whether it's one Panki takes is the form's to say), or the one showing was taken off. */
  onPick: (file: File | null) => void;
  error?: string | undefined;
  /** Laid over the held clip's picture: its subtitles, as a review shows them (`MediaView`'s `over`); never over one just picked. */
  subtitles?: ReactNode;
};

/**
 * A field that holds a file: press to choose one, or drop one on it. Once picked it shows as it will on the card,
 * with its name, and can be changed or deleted, Delete asking first in the field (`Ask`); a file the card already
 * holds shows the same way. Deleting takes it off the form: the card itself changes only once it's saved. What's wrong
 * is said in the app's own bubble, as in `TextField`.
 */
export function MediaField({ id, label, kinds, kind, file, held, onPick, error, subtitles = null }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  // The picked file's own address in the browser, for showing it before Panki holds it; given back when it's let go.
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const made = URL.createObjectURL(file);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [file]);

  /** Whether Delete is asking first (the owner, 2026-10-29: anything that takes something off a card is confirmed). */
  const [asking, setAsking] = useState(false);
  const choose = () => input.current?.click();
  // What's in the field right now: the file just picked, or else the one the card already holds.
  const there = file && url ? { src: url, name: file.name } : !file && held ? { src: held, name: "On this card" } : null;
  const showing = there && kind ? { ...there, kind } : null;
  function drop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) onPick(dropped);
  }

  return (
    <div
      className={`field media-field ${error ? "field-invalid" : ""} ${over ? "is-over" : ""} ${asking && showing ? "is-asking" : ""}`.replace(/\s+/g, " ").trim()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        // Leaving for something inside the field isn't leaving it.
        if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) setOver(false);
      }}
      onDrop={drop}
    >
      <span className="field-label">{label}</span>
      {showing ? (
        <div className="media-picked">
          <MediaView key={showing.src} kind={showing.kind} src={showing.src} label={label} over={file ? null : subtitles} />
          <div className="media-picked-row">
            <span className="media-name">{showing.name}</span>
            <Button id={id} aria-describedby={error ? `${id}-error` : undefined} disabled={asking} onClick={choose}>
              <Icon name="upload" />
              Replace
            </Button>
            <Button className="is-danger" aria-pressed={asking} onClick={() => setAsking((was) => !was)}>
              <Icon name="trash" />
              Delete
            </Button>
          </div>
          {asking ? (
            <Ask
              idPrefix={`${id}-delete`}
              question={`Delete this ${KIND_WORDS[showing.kind]}?`}
              go={{ words: `Delete ${KIND_WORDS[showing.kind]}`, busy: "Deleting…" }}
              busy={false}
              failure={null}
              onKeep={() => setAsking(false)}
              onGo={() => {
                setAsking(false);
                onPick(null);
              }}
            />
          ) : null}
        </div>
      ) : (
        <Button id={id} className="media-drop" aria-label={`${label}: choose a file`} aria-describedby={error ? `${id}-error` : undefined} onClick={choose}>
          <Icon name="add" />
          Choose a file
          <span className="media-drop-hint">or drop it here</span>
        </Button>
      )}
      {/* The system's own file chooser is opened by the buttons above; this input is never seen. A file whose name
          ends the right way is offered too: a .webm is a "video" to the system even when it's only sound. */}
      <input
        ref={input}
        type="file"
        hidden
        tabIndex={-1}
        accept={kinds.flatMap((taken) => [`${taken}/*`, ...MEDIA_ENDINGS[taken].map((ending) => `.${ending}`)]).join(",")}
        onChange={(e) => {
          const picked = e.target.files?.[0];
          // Cleared, so choosing the same file again after taking it off is still a change.
          e.target.value = "";
          if (picked) onPick(picked);
        }}
      />
      {error ? (
        <div id={`${id}-error`} className="field-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
