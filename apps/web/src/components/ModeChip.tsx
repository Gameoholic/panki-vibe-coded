/** @panki A transcription mode named anywhere (`ModeChip`, `MODE_ICONS`). Never a mode's name as bare text in a sentence. */
import { TRANSCRIBE_MODES, type TranscribeMode } from "@panki/contracts";
import { Icon, type IconName } from "./Icon";

/** Each transcription mode's icon. One home: wherever a mode is shown, it's with this. */
export const MODE_ICONS: Record<TranscribeMode, IconName> = { full: "download", live: "lead", hybrid: "hybrid" };

/**
 * A transcription mode named in a sentence: its icon and its name on a soft highlight of the accent, as every mention of
 * a mode in the app is. Where a mode is a heading or a
 * choice of its own (the Admin chart's columns, the strip's Mode dropdown) it's its icon and name without the highlight.
 */
export function ModeChip({ mode }: { mode: TranscribeMode }) {
  return (
    <span className="mode-chip">
      <Icon name={MODE_ICONS[mode]} />
      {TRANSCRIBE_MODES[mode].name}
    </span>
  );
}
