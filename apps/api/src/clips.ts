/**
 * A card's clips as the time left reads them, from what's already kept: each side's clips' lengths summed (heard one
 * after another), and where the picked word starts in its clip. Read only, never written. Clips alone: a file of the
 * video kind, never a sound (a dictionary's word, the picked word's own cut, any other). A clip's length is its
 * recording's own stretch (`media_recordings`), else the stretch of the video its card or example was taken from; the
 * word's place is the capture's word less the clip's start. With an example, its own files stand where it has them,
 * the card's elsewhere, each with its own source.
 */
import type { DatabaseSync } from "node:sqlite";
import { CaptureFacts } from "@panki/contracts";

/** What a side of a card shows of its clips, in ms: their lengths summed, and where the picked word starts in its clip; null where none is known. */
export type SideMedia = { sum: number | null; word: number | null };
export type CardClips = { front: SideMedia; back: SideMedia };
/** A clip as kept: its length and where the picked word starts in it, each when known. */
export type SideClip = { lengthMs: number | null; wordMs: number | null };

/** A side's clips as each measure reads them: every length kept, summed; a clip with none kept counts for nothing. */
export function sideMediaOf(clips: readonly SideClip[]): SideMedia {
  const lengths = clips.flatMap((c) => (c.lengthMs === null ? [] : [c.lengthMs]));
  const word = clips.find((c) => c.wordMs !== null)?.wordMs ?? null;
  return { sum: lengths.length === 0 ? null : lengths.reduce((s, l) => s + l, 0), word };
}

/** Where a card or an example was taken from: the video's stretch and the picked word's start, each when kept. */
type Taken = { startMs: number | null; endMs: number | null; wordMs: number | null };
type TakenRow = { startMs: number | null; endMs: number | null; capture: string | null };

function takenOf(row: TakenRow | undefined): Taken | null {
  if (!row) return null;
  let wordMs: number | null = null;
  try {
    const capture = CaptureFacts.safeParse(row.capture === null ? null : JSON.parse(row.capture));
    wordMs = capture.success ? (capture.data.word?.startMs ?? null) : null;
  } catch {
    wordMs = null;
  }
  return { startMs: row.startMs, endMs: row.endMs, wordMs };
}

type FileRow = { fieldId: string; side: "front" | "back"; value: string };
type MediaRow = { kind: string; cut: string | null; startMs: number | null; endMs: number | null };

/** A reader of cards' clips over a database: one card at a time, with the example shown (null, its own). */
export function clipReader(db: DatabaseSync): (cardId: string, exampleId: string | null) => CardClips {
  const media = "JOIN card_fields f ON f.id = v.field_id WHERE f.kind = 'media' AND f.removed_at IS NULL";
  const selectCardFiles = db.prepare(`SELECT v.field_id AS fieldId, f.side, v.value FROM card_values v ${media} AND v.card_id = ?`);
  const selectExampleFiles = db.prepare(`SELECT v.field_id AS fieldId, f.side, v.value FROM card_example_values v ${media} AND v.example_id = ?`);
  const selectMedia = db.prepare("SELECT m.kind, r.cut, r.start_ms AS startMs, r.end_ms AS endMs FROM media m LEFT JOIN media_recordings r ON r.media_id = m.id WHERE m.id = ?");
  const selectCardTaken = db.prepare("SELECT start_ms AS startMs, end_ms AS endMs, capture FROM card_sources WHERE card_id = ?");
  const selectExampleTaken = db.prepare("SELECT start_ms AS startMs, end_ms AS endMs, capture FROM card_examples WHERE id = ?");

  const clipOf = (mediaId: string, taken: Taken | null): SideClip | null => {
    const file = selectMedia.get(mediaId) as MediaRow | undefined;
    // The picked word's own cut is the word's, a short sound like any other, not the sentence's clip.
    if (!file || file.kind !== "video" || file.cut === "word") return null;
    if (file.startMs !== null && file.endMs !== null) {
      const wordMs = taken?.wordMs != null ? Math.max(0, taken.wordMs - file.startMs) : null;
      return { lengthMs: Math.max(0, file.endMs - file.startMs), wordMs };
    }
    if (!taken || taken.startMs === null || taken.endMs === null) return { lengthMs: null, wordMs: null };
    return { lengthMs: Math.max(0, taken.endMs - taken.startMs), wordMs: taken.wordMs === null ? null : Math.max(0, taken.wordMs - taken.startMs) };
  };

  return (cardId, exampleId) => {
    const cardTaken = takenOf(selectCardTaken.get(cardId) as TakenRow | undefined);
    const files = new Map<string, { side: "front" | "back"; value: string; taken: Taken | null }>();
    for (const f of selectCardFiles.all(cardId) as FileRow[]) files.set(f.fieldId, { side: f.side, value: f.value, taken: cardTaken });
    if (exampleId !== null) {
      const exampleTaken = takenOf(selectExampleTaken.get(exampleId) as TakenRow | undefined);
      for (const f of selectExampleFiles.all(exampleId) as FileRow[]) files.set(f.fieldId, { side: f.side, value: f.value, taken: exampleTaken });
    }
    const sides: Record<"front" | "back", SideClip[]> = { front: [], back: [] };
    for (const f of files.values()) {
      const clip = f.value === "" ? null : clipOf(f.value, f.taken);
      if (clip) sides[f.side].push(clip);
    }
    return { front: sideMediaOf(sides.front), back: sideMediaOf(sides.back) };
  };
}
