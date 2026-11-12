# The dictionary

> **Scope of this file.** The extension's dictionary: its files, looking a word up, the Word pop-up.

Panki's own dictionary, inside the extension, reading the term-bank zip files most browser dictionaries share. **None of any such tool's code is used** (GPL, and the no-lifted-code rule): the format was written from its description, the endings from the grammar.

## Where it's kept, and reading a file

- **IndexedDB `panki-dictionary`, in the extension's own origin** (`dictionary/store.ts`): `dictionaries` (one record each; `name` is the owner's own, shown by `shownName` everywhere, while `title` stays what tells it apart), `terms`, `meta` (frequencies and pitch accents), `tags`. The options page imports and removes; the worker reads. **A page's script never opens it**: its IndexedDB would be the page's own. `unlimitedStorage` keeps the browser from clearing it.
- **Removing by rows**: every row names its dictionary. The record is marked `removing` first, which takes it out of every list and look-up at once; then each store's rows go in one `delete` of their key range when nothing of another dictionary's is among them (an import writes them in a run; one at a time took minutes for JMdict), a key cursor otherwise; the record last. A removal cut short is finished when the options page next opens (`finishRemovals`).
- **Reading a file** (`packages/contracts/src/zip.ts`, `dictionary.ts`, `dictionaryRows.ts`, shared with the API, which reads and counts a kept dictionary the same way). The zip is read here, not by a library: the central directory, then each file through `DecompressionStream("deflate-raw")`; stored and deflated only, no zip64, at most 256 MB unpacked each, and a file that unpacks past what it declared is stopped mid-stream. `index.json` and every row are Zod-checked; a row that doesn't read is skipped; a title already in is refused; an import that fails part-way deletes what it wrote. Kanji banks aren't read.

## Dictionaries kept on Panki

Uploaded by an admin, kept for everyone (`shared.sqlite` → `dictionary_files`). The API counts what each provides the extension's way (`providesOf`; `countDictionaries` at startup for older ones). Add on the options page fetches the zip through `panki.ts` → `dictionaryFile` and hands it to the same `importDictionary` a picked file goes to. The extension only ever calls Panki's own address.

## What a dictionary provides

`dataKinds.ts` is the one registry of the kinds of data Panki reads from a dictionary, each with its sentence and the pop-up's parts it shows in; which card fields it fills is `roles.ts`'s; the ids and the counting are the contracts' (`tallyTerm`, `tallyMeta`). A record's `provides` is counted from its rows at import, or once on the options page for an older one (`countProvides`). Counts are stated as read, never guessed.

## Undoing endings, looking up, splitting

- **Endings** (`dictionary/deinflect.ts`): one registry of rules in the format's own word kinds; four stages (`te`, `ta`, `masu`, `stem`) are only ever undone further, never looked up. Breadth first, each step recorded so the pop-up shows the chain; `fits(kind, rules)` is the final check against a row's kinds. An ending may be the whole word (来ない) as long as something is left.
- **Looking up** (`dictionary/lookup.ts`, the worker): up to 16 letters, never across a stop or space, every prefix longest first, every form of each, in one transaction. Best first: longest stretch, fewest endings, best frequency rank, the owner's dictionary order, score.
- **Splitting a line** (`lookup.ts` → `latticeOf` in the worker; `split.ts` → `wordsOf` on the page): every word starting at each place, with a cost from its rank plus half a point per ending (`costOf`, `UNKNOWN`, tuned by feel); the page picks the cheapest split; where no word starts, `Intl.Segmenter` pieces stand in. A stretch forced by hand is one word and nothing crosses it. `dictionary/useWords.ts` holds each line's answer in one store, so the line, the drawer's sentence and a double-click split the same text the same way. `lookState` carries a signature of the dictionaries on; when it changes every line is asked again.
- `lookState`, `lookup` and `lattice` are answered before the sign-in is looked at: the dictionaries work signed out.

## Pointing

`capture/look.ts` (`createLooker`, the state machine), `capture/listening.tsx` (`listenOnPage`), `ui/Lookup.tsx`.

- **The key held** while pointing opens the pop-up; off the word with the key held closes it or moves to the next word. Let go on the word, or a click on it, keeps it open (`locked`); a kept pop-up gives way only to the key held over another word, a click outside the pop-up and its word, or Escape.
- **On hover** is a key of its own (`LookKey` `hover`), and there are two keys: **globally** (pages, YouTube's captions, the options page) and **in Panki subtitles** (Panki's lines and a review clip's subtitles, told by `SUBTITLES_AREA`). `pointWith` is the one way a move is taken. A hovered pop-up stays only while the pointer is on its word's box or the pop-up, which stands **flush against the word, no gap**: a gap is the next line's room, whose word gets hovered on the way. It closes the moment the pointer is anywhere else (`looker.drift`). **Hover delay** (`HOVER_DELAY`, one per key): the pop-up opens only once the pointer has rested that long, so words passed over open nothing; moving on first lets the rest and any look-up in flight go. A kept pop-up never yields to a hover.
- **The word under the pointer** comes from `caretPositionFromPoint` (`caretRangeFromPoint` before Chrome 128), checked against the letter's own box since both return the nearest caret even past a line's end. Panki's own line is in a closed shadow root caret APIs can't see into, so `Line` reports its own words (`LineLook`). `listenOnPage` ignores everything inside Panki's places (`mount.ts` → `inPanki`, read off `composedPath()`).
- **The pop-up's place** lies over the whole window with `pointer-events: none` but on the pop-up, so caret look-ups go through it; inside the fullscreen element when a video fills the screen.
- **A word already a card** (`InCards`) is outside the layout registry on purpose: it can't be hidden or moved.

## Words that are in your decks, marked

`capture/known.ts`. The worker keeps `GET /api/cards/words` as `kept.ts`'s `words` entry; nothing is marked on Panki's own pages (`onPanki`). That one answer carries each word's cards too (`WordsInCards.cards`, as `cardsCalled` would answer them), so **the pop-up's In your decks is drawn from what the page already holds** (`knownCards`, `Lookup.tsx` → `InCards`) and asks nothing as it opens; a signed-in page gets the cards whether or not anything marks the words. The drawer's "already there" still asks `GET /api/cards/called` by the words typed.

- **One check, shared with the pop-up, so they can't drift apart:** the dictionary's word for a stretch is chosen by `lookup.ts` → `wordsFound`, which both `lookUp` and `latticeOf` use, and it's known when it's exactly a value a card is called by (`knownIn`). Nothing is marked before the dictionary has answered, or with no dictionary.
- **Colours**: by stage, a word takes its highest card's stage's colour (`WordsInCards.colours`, the contracts' `placeColour`); a word whose every card is suspended, or any of whose cards is flagged, has its own colour, the flag winning (on the video is where a flag is acted on). These three are the only colours of in-deck, suspended and flagged anywhere: the seek bar's marks of them wear them too (`storage.ts` → `seekLookOf`, what the seek look kept of them unread), so their rows are on the Highlight panel alone. The YouTube-only colours stay the seek bar's: in Panki subtitles a word one of whose cards (as `cards` has them) was made from the video on the page (`videoCardOf`, against `askVideoCards`' list) is tinted in the Cards made from this video colour, after flagged and suspended; and the picked word in the Clip colour (`Line`'s `pickColour`, `--pick`), filled a little stronger than a tint and edged in it, Panki blue where there's no video.
- **On a page** (Highlight globally): the browser's highlight layer (`markKnownOnPage`, one `Highlight` per colour in use, since a `Highlight` has one colour; their colours as literals in a `<style>`, since the app's tokens don't reach the page), so no node of the page changes and nothing a site's script holds breaks. Text is read again where a `MutationObserver` says it changed; each line is split once, `IN_FLIGHT` asks at a time, with a cache of its own (`useWords`' 400-line cache would loop on a page's thousands). YouTube's captions are page text: they go by the global switch and the global key. Unproven: the highlight layer from a content script's isolated world (Firefox 140+; without it nothing is marked, nothing breaks).
- **On Panki's lines** each word button is tinted; **on the seek bar** `useKnownMoments` reads Panki's transcript, so a video without one has none.

## The pop-up's layout

`popupLayout.ts` → `PopupLayout`, part names read from `dataKinds.ts`. `popupLayoutOf` fills a kept layout out against the dictionaries with meanings. Handed to a page in `lookState`, asked again on focus, since the dictionaries in IndexedDB tell no page of a change. `LookupBody` draws it on a page and in the editor (`options/PopupLayout.tsx`) alike.

**The editor's trap:** nothing on the options page may move while the trial pop-up is open. The editor once took the pointed word at once, the laid-out pop-up changed height, the page scrolled, and a scroll closes an unkept pop-up: it vanished as it opened. The pointed word goes on the pop-up being laid out only once the trial one has closed.

## Drawing what a dictionary says

`ui/Glossary.tsx`: a formatted definition is a tree rebuilt from an allowlist (block and inline tags by `createElement`, a few looks kept by Zod, `lang`, a cell's spans); links become their words; pictures, `data` attributes and classes dropped; 30 deep and 3000 pieces at most. **Nothing from a file is ever handed to the page as markup.** `glossaryText` reads the same tree as text for a card.

## Where the pop-up works

`lookSettings.ts`, `background.ts` → `placePageScript`. YouTube needs nothing more (`youtube.js` is in the manifest). Anywhere else needs the browser's leave (`permissionsFor`), asked from the press itself; the worker registers `page.js` as a dynamic content script (`persistAcrossSessions`) for those matches minus YouTube and the excluded sites, re-registering on every change, one at a time. Leave given is never taken back: removing `https://*/*` might take Panki's own address with it.

## Into the drawer

`roles.ts` → `DICTIONARY_ROLE`, a record over `dataKinds.ts`'s kinds, so a new kind doesn't build until it has a role. What's typed over a dictionary field is kept apart (`dictTyped`) and let go when another word or other meanings are chosen. The drawer's pick is characters of the sentence (`Chars`), not tokens, so the caller's split and the drawer's never have to agree.

**Unproven:** `caretPositionFromPoint` reaching YouTube's captions; the capture-phase click stopping a link on a site acting on `pointerdown`; text in an open shadow root or iframe.
