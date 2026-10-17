import { FieldKind, holdsFile, type MediaKind } from "@panki/contracts";

/**
 * The kinds a field can be, one registry: the word for each, and for a kind that's typed, whether it's one line or
 * several (what it's typed into, and how its value is shown). A kind that holds a file says so in the contracts
 * (`mediaKindsOf`), and so does one that holds a link (`linkOf`), which is what the form, the list and the review card
 * go by. A new kind is one entry here and its id in the contracts' `FieldKind`, never a special case elsewhere.
 */
export const FIELD_KINDS: Record<FieldKind, { name: string; multiline: boolean }> = {
  text: { name: "Text", multiline: false },
  long: { name: "Paragraph", multiline: true },
  media: { name: "Media", multiline: false },
  image: { name: "Image", multiline: false },
  // Holds the video's link, title and channel as one value (`youtubeMetaValue`); it was "YouTube link", the link alone, until 2026-10-18.
  youtube: { name: "YouTube metadata", multiline: false },
  pitch: { name: "Pitch accent", multiline: false },
};

/** The kinds as choices, in the contracts' order. */
export const FIELD_KIND_OPTIONS = FieldKind.options.map((id) => ({ id, label: FIELD_KINDS[id].name }));

/** The class a shown value gets from its field's kind: `is-long` keeps a Paragraph's line breaks. */
export function kindClass(kind: FieldKind) {
  return FIELD_KINDS[kind].multiline ? "is-long" : "";
}

/**
 * What the file a value names is (a clip, a sound, a picture), when its field holds files and the card says the value
 * is one (`Card.files`); null when it's to be shown as words. Words typed into a field before it was changed to hold
 * files are still words, and still shown.
 */
export function fileKindOf(kind: FieldKind, value: string, files: Readonly<Record<string, MediaKind>> | undefined): MediaKind | null {
  return holdsFile(kind) ? (files?.[value] ?? null) : null;
}
