// Drives the real UI in headless Chrome against a scratch instance. Never the owner's data or servers.
// Usage: pnpm verify   (env: CHROME to point at another chrome.exe, VERBOSE=1 to see server output)
import path from "node:path";
import { Cdp, WEB_PORT, api, dbRow, getJson, json, openChrome, scratch, shots, sleep, startServers, stopAll, waitFor } from "./lib/scratch.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`  ok  ${message}`);
}
const field = (name) => `[data-field=${JSON.stringify(name)}]`;

/** The opening moment must show up on a fresh load, then lift away on its own before anything is pressed. */
async function openingMoment(cdp) {
  await waitFor("the opening moment", () => cdp.exists(".intro"), 5_000);
  await waitFor("the opening moment to lift away", async () => !(await cdp.exists(".intro")), 10_000);
  assert(true, "the mark plays on load and lifts away by itself");
}

/** A review session of new cards from the first to the end, answering the best answer each time, with whatever "press" the device uses. */
async function reviewToTheEnd(cdp, press, total, shotName, goesTo = "Apprentice 1 · 4 h") {
  await waitFor("the review card", () => cdp.exists(".review-card"));
  assert((await cdp.text(".review-progress")) === `1 of ${total}`, `the session has ${total} ${total === 1 ? "card" : "cards"}`);
  assert((await cdp.eval("document.querySelector('.review-card').dataset.revealed")) === "false", "the answer starts hidden");
  assert((await cdp.text(".review-place")) === "Lesson", "the card says it stands on the first stage");
  await press(".review-card");
  await waitFor("reveal", () => cdp.eval("document.querySelector('.review-card').dataset.revealed === 'true'"));
  assert((await cdp.count(".btn-answer")) === 2, "pressing the card reveals the answer and the two answers under it");
  assert((await cdp.text(".btn-answer.ans-up .to")) === goesTo, "the best answer says where the card goes and when it comes back");
  const shot = await cdp.screenshot(shotName);
  for (let i = 1; i <= total; i++) {
    if (i > 1) {
      await press(".review-card");
      await waitFor("reveal", () => cdp.eval("document.querySelector('.review-card').dataset.revealed === 'true'"));
    }
    await press(".btn-answer.ans-up");
    if (i < total) await waitFor(`card ${i + 1}`, async () => (await cdp.text(".review-progress")) === `${i + 1} of ${total}`);
  }
  await waitFor("the end", () => cdp.exists(".review-done"));
  assert((await cdp.text(".summary-title")) === "That’s the lot.", "the end of the session says so");
  return shot;
}

// ---------- the run ----------
const shotsTaken = [];
let cdp = null;
try {
  console.log(`Scratch instance in ${scratch}`);
  await startServers();
  cdp = await openChrome();
  const base = `http://127.0.0.1:${WEB_PORT}/`;
  const click = cdp.click.bind(cdp);
  const tap = cdp.tap.bind(cdp);
  /** Drags a row's grip from one row to another's place, as a mouse or as a finger: press, a few moves, release. */
  async function dragRow(from, to, press, rows = ".field-rows > .field-row") {
    const row = (n) => `${rows}:nth-child(${n})`;
    const grip = await cdp.rect(`${row(from)} .field-grip`);
    const centre = (n) => cdp.eval(`(() => { const b = document.querySelector(${JSON.stringify(row(n))}).getBoundingClientRect(); return b.top + b.height / 2; })()`);
    const dy = (await centre(to)) - (await centre(from)) + (to < from ? -12 : 12);
    const steps = 6;
    if (press === "touch") {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: grip.x, y: grip.y }] });
      for (let s = 1; s <= steps; s++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: grip.x, y: grip.y + (dy * s) / steps }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      // Chrome swallows a tap that lands right after a touch gesture ends (its guard against accidental taps, about a second long); a real finger is never that quick.
      await sleep(1500);
    } else {
      await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: grip.x, y: grip.y, button: "left", buttons: 1, clickCount: 1 });
      for (let s = 1; s <= steps; s++) await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: grip.x, y: grip.y + (dy * s) / steps, button: "left", buttons: 1 });
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: grip.x, y: grip.y + dy, button: "left", clickCount: 1 });
    }
  }
  const goHome = async (press) => {
    await press("#tab-home");
    await waitFor("the home screen", () => cdp.exists("#door-review"));
  };
  /** The header says Saved and the API agrees. */
  const saved = (label, check) => waitFor(label, async () => (await cdp.text("#srs-saved")) === "Saved" && (await check()));

  console.log("Desktop, light scheme");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  await cdp.navigate(base);
  await openingMoment(cdp);
  await waitFor("the home screen", () => cdp.exists("#door-review"));
  await waitFor("the decks to load", async () => (await cdp.text("#door-review .door-detail")) !== "");
  assert((await cdp.text("#door-review .door-detail")) === "No decks yet", "the home says there are no decks yet");
  await waitFor("the types to load", async () => (await cdp.text("#door-types .door-detail")) !== "");
  assert((await cdp.text("#door-types .door-detail")) === "Word", "the starter card type is there from the first start");
  await waitFor("the SRS types to load", async () => (await cdp.text("#door-srs .door-detail")) !== "");
  assert((await cdp.text("#door-srs .door-detail")) === "WaniKani-like, Classic, Gentle", "the three starter SRS types are there from the first start");
  assert((await cdp.litTab("home")) && !(await cdp.litTab("settings")), "the Home tab is lit on the home screen");
  await waitFor("the self-hosted font", () => cdp.eval("document.fonts.check('700 16px Urbanist')"));
  assert(await cdp.eval("document.fonts.check('700 16px Urbanist')"), "Urbanist is loaded from the app's own files");

  await click("#door-decks");
  await waitFor("the decks screen", () => cdp.exists("#new-deck"));
  await waitFor("the decks list", async () => (await cdp.text(".list-title")) === "No decks yet");
  assert(!(await cdp.exists("#deck-name")), "the new-deck form stays closed until asked for");
  await click("#new-deck");
  await waitFor("the new-deck form", () => cdp.exists("#deck-name"));
  assert((await cdp.eval("document.activeElement?.id")) === "deck-name", "New deck opens the form with the name focused");
  assert((await cdp.text(".btn-chip[aria-pressed='true']")) === "Word", "New deck picks the starter card type by itself");
  assert((await cdp.text(".srs-chip[aria-pressed='true']")) === "WaniKani-like", "and the first SRS type");
  await cdp.enter();
  await waitFor("Panki's own error bubble", async () => (await cdp.count(".field-error")) > 0);
  assert((await cdp.text("#deck-name-error")) === "Give the deck a name.", "an empty deck name is answered in the app's words");

  await cdp.type("#deck-name", "Mined");
  await cdp.enter();
  await waitFor("the new deck to open", async () => (await cdp.text("#screen-title")) === "Mined");
  await waitFor("the deck's cards", () => cdp.exists("#add-card"));
  assert(true, "creating a deck opens it");
  assert(!(await cdp.exists("[data-field]")), "the add-card form stays closed until asked for");
  const types0 = (await getJson("/types")).types;
  const srs0 = (await getJson("/srs")).types;
  const wk = srs0[0];
  const decks = (await getJson("/decks")).decks;
  assert(decks.length === 1 && decks[0].name === "Mined" && decks[0].cardCount === 0 && decks[0].typeId === types0[0].id && decks[0].srsTypeId === wk.id, "the API has the deck, with no cards, on the starter card type and the first SRS type");
  const deckId = decks[0].id;
  assert(types0[0].fields.every((f) => f.kind === "text"), "the starter type's fields each hold one line of text");

  await click("#add-card");
  await waitFor("the add form", () => cdp.exists(field("Word")));
  assert((await cdp.eval("document.activeElement?.dataset.field")) === "Word", "Add card opens the form, shaped by the type, with the first field focused");
  await cdp.enter();
  await waitFor("the card error bubble", async () => (await cdp.count(".field-error")) > 0);
  assert((await cdp.text(".field-error")) === "Fill in the Word.", "an empty card is answered in the app's words, not the browser's");
  assert((await cdp.eval("document.activeElement?.dataset.field")) === "Word", "focus goes to the first field that's wrong");

  await cdp.type(field("Word"), "懐かしい");
  await cdp.type(field("Reading"), "なつかしい");
  await cdp.type(field("Meaning"), "nostalgic");
  await cdp.enter();
  await waitFor("the card in the list", async () => (await cdp.count(".card-row")) === 1);
  assert((await cdp.text(".card-word")) === "懐かしい", "the card shows in the list");
  assert((await cdp.text(".card-row .pill")) === "Lesson" && (await cdp.text(".card-row .due")) === "new", "a card starts on the first stage, new");
  assert((await cdp.value(field("Word"))) === "", "the form clears after adding");
  const cards = (await getJson(`/decks/${deckId}/cards`)).cards;
  const values0 = Object.values(cards[0]?.values ?? {});
  assert(cards.length === 1 && values0.includes("懐かしい") && values0.includes("なつかしい") && cards[0].deckId === deckId, "the API has the card's values in that deck");
  assert(cards[0].place.stageId === null && !cards[0].place.burned && cards[0].seen === 0 && cards[0].dueAt === null, "the API says the card is new, never answered");

  await cdp.type(field("Word"), "とりあえず");
  await cdp.type(field("Meaning"), "for now");
  await cdp.enter();
  await waitFor("two cards", async () => (await cdp.count(".card-row")) === 2);
  assert((await cdp.text(".list-title")) === "2 cards", "the count reads '2 cards'");
  await waitFor("the review count", async () => (await cdp.text("#nav-review")) === "Review · 2");
  assert(true, "the Review button counts what a session would show: two new cards");
  shotsTaken.push(await cdp.screenshot("desktop-cards"));

  await click("#nav-review");
  shotsTaken.push(await reviewToTheEnd(cdp, click, 2, "desktop-review"));
  assert((await cdp.text(".tally .pill.ans-up")) === "Got it · 2", "the end tallies the answers");
  shotsTaken.push(await cdp.screenshot("desktop-review-end"));
  const answered = (await getJson(`/decks/${deckId}/cards`)).cards;
  assert(answered.every((c) => c.place.stageId === wk.stages[1].id && c.seen === 1 && c.dueAt > c.lastAt && !c.due), "the API moved both cards up to Apprentice 1, due in a few hours");
  const places = dbRow("SELECT COUNT(*) AS n, MIN(stage_from) AS stageFrom, MAX(stage_to) AS stageTo FROM card_places WHERE reason = 'answer'");
  assert(places.n === 2 && places.stageFrom === null && places.stageTo === wk.stages[1].id, "each answer is kept as a row: from new up to Apprentice 1");
  await click("#nav-back");
  await waitFor("the deck's cards again", () => cdp.exists("#add-card"));
  assert((await cdp.text("#screen-title")) === "Mined", "back from a deck's review returns to its cards");
  await waitFor("the places", async () => (await cdp.text(".card-row .pill")) === "Apprentice 1");
  assert((await cdp.text(".card-row .due")) === "in 4 h", "each card now says its stage and when it comes back");

  await click("#nav-back");
  await waitFor("the decks list", async () => (await cdp.count(".deck-row")) === 1);
  assert((await cdp.text(".deck-count")) === "2 cards", "back on the list, the deck shows its card count");
  assert((await cdp.text(".deck-row .row-sub")) === "Word · WaniKani-like", "each deck says its card type and its SRS type");
  assert((await cdp.text(".list-title")) === "1 deck", "the list counts one deck");
  assert(await cdp.eval("Boolean(document.querySelector('.main').lastElementChild.querySelector('.deck-list'))"), "nothing sits under the deck list");
  assert(!(await cdp.exists(".intro")), "the opening moment doesn't play again inside the app");
  shotsTaken.push(await cdp.screenshot("desktop-decks"));

  await goHome(click);
  await waitFor("the counts", async () => (await cdp.text("#door-review .door-detail")) === "Nothing due right now");
  assert(true, "the home says nothing is due once the cards are answered");
  shotsTaken.push(await cdp.screenshot("desktop-home"));

  await click("#door-add");
  await waitFor("the add screen", () => cdp.exists(field("Word")));
  assert((await cdp.text(".btn-chip[aria-pressed='true']")) === "Mined", "Add a card starts with the first deck picked");
  assert((await cdp.eval("document.activeElement?.dataset.field")) === "Word", "the first field is ready to type into");
  await cdp.type(field("Word"), "急ぐ");
  await cdp.type(field("Meaning"), "to hurry");
  await cdp.enter();
  await waitFor("the card under the form", async () => (await cdp.count(".card-row")) === 1);
  assert((await cdp.text(".list-title")) === "Just added", "the card shows under the form as just added");
  const three = (await getJson(`/decks/${deckId}/cards`)).cards;
  assert(three.length === 3 && Object.values(three[0].values).includes("急ぐ"), "the API has the card in the picked deck");
  shotsTaken.push(await cdp.screenshot("desktop-add"));

  await goHome(click);
  await waitFor("the counts", async () => (await cdp.text("#door-review .door-detail")) === "0 due · 1 new");
  await click("#door-review");
  await waitFor("the deck picker", async () => (await cdp.count(".deck-row")) === 1);
  assert((await cdp.text("#screen-title")) === "Review" && (await cdp.text(".list-title")) === "Which deck?", "Review asks which deck");
  assert((await cdp.text(".deck-count")) === "0 due · 1 new" && (await cdp.text(".deck-row .row-sub")) === "WaniKani-like", "the picker says what each deck has for today, and its SRS type");
  await click(".deck-row");
  await reviewToTheEnd(cdp, click, 1, "desktop-review-pick");
  await click("#nav-back");
  await waitFor("the deck picker again", async () => (await cdp.text(".list-title")) === "Which deck?");
  assert(true, "back from that review returns to the picker");

  await click("#tab-settings");
  await waitFor("settings", async () => (await cdp.text("#screen-title")) === "Settings");
  await waitFor("the settings", () => cdp.exists("#setting-new"));
  assert((await cdp.value("#setting-new")) === "10" && (await cdp.checked("#setting-no-limit")) && (await cdp.pressed("#setting-first-reviews")) && (await cdp.checked("#setting-fuzz")), "Settings shows the defaults: 10 new a day, no limit, reviews first, waits spread");
  assert((await cdp.litTab("settings")) && !(await cdp.litTab("home")), "the Settings tab is lit there");
  shotsTaken.push(await cdp.screenshot("desktop-settings"));
  await click("[data-setting='newPerDay'] [aria-label='More']");
  await waitFor("the setting to save", async () => (await getJson("/settings")).settings.newPerDay === 11);
  assert((await cdp.value("#setting-new")) === "11", "pressing + on a setting changes it and the API has it a moment later");
  await click("[data-setting='newPerDay'] [aria-label='Fewer']");
  await waitFor("the setting back", async () => (await getJson("/settings")).settings.newPerDay === 10);
  const settingChange = dbRow("SELECT from_value, to_value FROM settings_changes WHERE key = 'newPerDay' ORDER BY id ASC LIMIT 1");
  assert(settingChange && settingChange.from_value === "10" && settingChange.to_value === "11", "a setting's change is kept, from and to");
  await click("#setting-no-limit");
  await waitFor("the limit", () => cdp.exists("#setting-reviews"));
  assert((await cdp.value("#setting-reviews")) === "100", "switching off No limit offers a number to set");
  await click("#setting-no-limit");
  await waitFor("no limit again", async () => !(await cdp.exists("#setting-reviews")) && (await getJson("/settings")).settings.reviewsPerDay === null);

  await goHome(click);
  await click("#door-decks");
  await waitFor("the decks list", () => cdp.exists(".deck-settings"));
  await click(".deck-settings");
  await waitFor("the deck's settings", () => cdp.exists("#deck-rename"));
  assert(await cdp.pressed("#deck-tab-settings"), "the row's settings button opens the deck on its Settings tab");
  assert(await cdp.eval("document.querySelector('#deck-rename').form.querySelector('[type=submit]').disabled"), "Save stays off until the name changes");
  await cdp.eval("document.querySelector('#deck-rename').select()");
  await cdp.type("#deck-rename", "Mined words");
  await cdp.enter();
  await waitFor("the new name", async () => (await cdp.text("#screen-title")) === "Mined words");
  assert(true, "renaming changes the title straight away");
  const renamed = (await getJson("/decks")).decks;
  assert(renamed.length === 1 && renamed[0].name === "Mined words", "the API has the new name");
  const rename = dbRow("SELECT from_name, to_name FROM deck_renames WHERE deck_id = ?", deckId);
  assert(rename && rename.from_name === "Mined" && rename.to_name === "Mined words", "the old name is kept in the rename history");
  assert((await cdp.count(".srs-chip")) === 3 && (await cdp.text(".srs-chip[aria-pressed='true']")) === "WaniKani-like", "the deck's settings show its SRS type among the three");
  shotsTaken.push(await cdp.screenshot("desktop-deck-settings"));
  await click("#deck-delete");
  await waitFor("the question", () => cdp.exists("#deck-delete-question"));
  assert((await cdp.text("#deck-delete-question")) === "Delete “Mined words” and its 3 cards?", "delete asks once, with the name and the card count");
  shotsTaken.push(await cdp.screenshot("desktop-deck-delete"));
  await click("#deck-delete-keep");
  await waitFor("the question to go", async () => !(await cdp.exists("#deck-delete-question")));
  assert(await cdp.exists("#deck-delete"), "Keep closes the question and nothing happened");
  await click("#deck-tab-cards");
  await waitFor("the cards tab", async () => (await cdp.count(".card-row")) === 3);
  assert(!(await cdp.exists("[data-field]")), "the Cards tab shows the deck's cards, with the add form closed");

  console.log("Card types");
  await goHome(click);
  await click("#door-types");
  await waitFor("the types list", async () => (await cdp.count(".type-row")) === 1);
  assert((await cdp.text(".type-row .row-sub")) === "Word · Reading · Meaning" && (await cdp.text(".type-row .deck-count")) === "1 deck", "the starter type lists its fields and the deck using it");
  shotsTaken.push(await cdp.screenshot("desktop-types"));
  await click(".type-row");
  await waitFor("the type editor", () => cdp.exists("#type-name"));
  assert((await cdp.value("#type-name")) === "Word" && (await cdp.count(".field-row")) === 3, "the editor shows the type's name and its three fields");
  assert(!(await cdp.exists("#type-delete")) && (await cdp.text(".main")).includes("Used by 1 deck"), "a type a deck uses can't be deleted");
  await click("#add-field");
  await waitFor("the new field", async () => (await cdp.count(".field-row")) === 4);
  assert((await cdp.eval("document.activeElement?.id ?? ''")).startsWith("field-name-"), "Add field adds a row with its name focused");
  await cdp.send("Input.insertText", { text: "Sentence" });
  const row4 = ".field-rows > .field-row:nth-child(4)";
  const kindText = `${row4} [id^="field-kind-"][id$="-text"]`;
  const kindLong = `${row4} [id^="field-kind-"][id$="-long"]`;
  const sideFront = `${row4} [id^="field-side-"][id$="-front"]`;
  const required = `${row4} [role="switch"]`;
  assert((await cdp.pressed(kindText)) && !(await cdp.checked(required)), "a new field starts as one line of text, not required");
  await click(kindLong);
  await waitFor("the kind", () => cdp.pressed(kindLong));
  await click(sideFront);
  await waitFor("the side", () => cdp.pressed(sideFront));
  await click(required);
  await waitFor("required", () => cdp.checked(required));
  assert(true, "a field can be set to Paragraph, Front and required");
  const options = await cdp.eval(`[...document.querySelectorAll(${JSON.stringify(`${row4} .field-row-options > *`)})].map((el) => { const b = el.getBoundingClientRect(); return [b.top, b.height]; })`);
  assert(options.length === 3 && options.every(([top, height]) => Math.abs(top - options[0][0]) < 1 && Math.abs(height - options[0][1]) < 1), "the kind, the side and Required stand in one line at one height");
  const [nameBox, toolBox] = await cdp.eval(`[".field-input", ".field-grip"].map((s) => { const b = document.querySelector(${JSON.stringify(row4)}).querySelector(s).getBoundingClientRect(); return [b.top, b.bottom]; })`);
  assert(Math.abs(nameBox[0] - toolBox[0]) < 1 && Math.abs(nameBox[1] - toolBox[1]) < 1, "the grip and the hide button stand as tall as the name beside them");
  await dragRow(4, 3, "mouse");
  await waitFor("the move", async () => (await cdp.value(".field-rows > .field-row:nth-child(3) .field-input")) === "Sentence");
  assert(true, "a field can be dragged by its grip to a new place");
  await cdp.eval("document.querySelector('.field-rows > .field-row:nth-child(3) .field-grip').focus()");
  await cdp.key("ArrowUp", "ArrowUp", 38);
  await waitFor("the key move", async () => (await cdp.value(".field-rows > .field-row:nth-child(2) .field-input")) === "Sentence");
  await cdp.key("ArrowDown", "ArrowDown", 40);
  await waitFor("the key move back", async () => (await cdp.value(".field-rows > .field-row:nth-child(3) .field-input")) === "Sentence");
  assert(true, "the arrow keys on the grip move it too, and keep hold of it");
  shotsTaken.push(await cdp.screenshot("desktop-type"));
  await click("#type-save");
  await waitFor("the types list", async () => (await cdp.count(".type-row")) === 1);
  assert((await cdp.text(".type-row .row-sub")) === "Word · Reading · Sentence · Meaning", "saving keeps the fields in their order");
  const typesAfter = (await getJson("/types")).types;
  assert(typesAfter[0].fields.map((f) => f.name).join(",") === "Word,Reading,Sentence,Meaning" && typesAfter[0].fields[2].side === "front" && typesAfter[0].fields[2].required && typesAfter[0].fields[2].kind === "long", "the API has the changed type, the new field of the Paragraph kind");

  await goHome(click);
  await click("#door-decks");
  await waitFor("the decks list", async () => (await cdp.count(".deck-row")) === 1);
  await click(".deck-row");
  await waitFor("the deck", async () => (await cdp.count(".card-row")) === 3);
  await click("#add-card");
  await waitFor("the add form", () => cdp.exists(field("Sentence")));
  assert((await cdp.count("[data-field]")) === 4 && (await cdp.exists(`textarea${field("Sentence")}`)), "the deck's add form follows its type; the Paragraph field is a box of several lines");
  await cdp.type(field("Word"), "面倒くさい");
  await cdp.type(field("Meaning"), "a hassle");
  await cdp.type(field("Sentence"), "面倒くさいなあ");
  await cdp.enter();
  await cdp.send("Input.insertText", { text: "本当に" });
  assert((await cdp.value(field("Sentence"))) === "面倒くさいなあ\n本当に" && (await cdp.count(".card-row")) === 3, "Enter in a Paragraph field makes a new line, not a card");
  shotsTaken.push(await cdp.screenshot("desktop-add-long"));
  await cdp.ctrlEnter();
  await waitFor("the card", async () => (await cdp.count(".card-row")) === 4);
  assert((await cdp.text(".card-row .card-front")) === "面倒くさいなあ\n本当に", "Ctrl+Enter adds the card, and the new Front field shows on it");
  assert((await cdp.eval("getComputedStyle(document.querySelector('.card-row .card-front')).whiteSpace")) === "pre-line", "a Paragraph value keeps its line breaks on the card");

  await goHome(click);
  await click("#door-types");
  await waitFor("the types list", () => cdp.exists("#new-type"));
  await click("#new-type");
  await waitFor("a blank editor", () => cdp.exists("#type-name"));
  assert((await cdp.eval("document.activeElement?.id")) === "type-name" && (await cdp.count(".field-row")) === 1, "New type starts with the name focused and one Front field");
  await cdp.send("Input.insertText", { text: "Phrase" });
  await cdp.enter();
  await waitFor("the first field's name", async () => (await cdp.eval("document.activeElement?.id ?? ''")).startsWith("field-name-"));
  assert((await cdp.count(".field-row")) === 1 && (await cdp.exists("#type-name")), "Enter in the name moves to the first field instead of leaving the editor");
  await cdp.send("Input.insertText", { text: "Phrase" });
  await cdp.enter();
  await waitFor("a second field", async () => (await cdp.count(".field-row")) === 2);
  assert((await cdp.eval("document.activeElement?.id ?? ''")) === (await cdp.eval("document.querySelector('.field-rows > .field-row:nth-child(2) .field-input').id")), "Enter on the last field adds the next one, focused");
  await click(".field-rows > .field-row:nth-child(2) .field-hide");
  await waitFor("one field again", async () => (await cdp.count(".field-row")) === 1);
  await click("#type-save");
  await waitFor("two types", async () => (await cdp.count(".type-row")) === 2);
  assert((await getJson("/types")).types.length === 2, "the new type is saved");

  await goHome(click);
  await click("#door-decks");
  await waitFor("the decks list", () => cdp.exists("#new-deck"));
  await click("#new-deck");
  await waitFor("the new-deck form", () => cdp.exists("#deck-name"));
  await cdp.type("#deck-name", "Listening");
  await cdp.eval("[...document.querySelectorAll('.btn-chip')].find((b) => b.textContent === 'Phrase').click()");
  await waitFor("the pick", () => cdp.eval("document.querySelector('.btn-chip[aria-pressed=\"true\"]')?.textContent === 'Phrase'"));
  await cdp.enter();
  await waitFor("the new deck", async () => (await cdp.text("#screen-title")) === "Listening");
  await click("#add-card");
  await waitFor("its add form", () => cdp.exists(field("Phrase")));
  assert((await cdp.count("[data-field]")) === 1, "a deck on another type gets that type's form");
  await cdp.type(field("Phrase"), "お疲れ様");
  await cdp.enter();
  await waitFor("the card", async () => (await cdp.count(".card-row")) === 1);
  const listening = (await getJson("/decks")).decks.find((d) => d.name === "Listening");
  const phraseCards = (await getJson(`/decks/${listening.id}/cards`)).cards;
  assert(phraseCards.length === 1 && Object.values(phraseCards[0].values).includes("お疲れ様"), "the API has the card with its one value");

  const usedType = await fetch(api(`/types/${types0[0].id}`), { method: "DELETE" });
  assert(usedType.status === 409, "deleting a type a deck uses is refused");
  const tempType = { id: crypto.randomUUID(), name: "Temp", fields: [{ id: crypto.randomUUID(), name: "Front", kind: "text", side: "front", required: true }] };
  assert((await fetch(api("/types"), { method: "POST", headers: json, body: JSON.stringify(tempType) })).status === 201, "a type can be made through the API");
  assert((await fetch(api(`/types/${tempType.id}`), { method: "DELETE" })).status === 204, "an unused type can be deleted");
  const noFront = { ...tempType, id: crypto.randomUUID(), fields: [{ id: crypto.randomUUID(), name: "Back", kind: "text", side: "back", required: false }] };
  assert((await fetch(api("/types"), { method: "POST", headers: json, body: JSON.stringify(noFront) })).status === 400, "a type with no Front field is refused");
  const badKind = { ...tempType, id: crypto.randomUUID(), fields: [{ ...tempType.fields[0], id: crypto.randomUUID(), kind: "video" }] };
  assert((await fetch(api("/types"), { method: "POST", headers: json, body: JSON.stringify(badKind) })).status === 400, "a field of a kind that doesn't exist is refused");
  const badDeck = await fetch(api("/decks"), { method: "POST", headers: json, body: JSON.stringify({ id: crypto.randomUUID(), name: "x", typeId: crypto.randomUUID(), srsTypeId: wk.id }) });
  assert(badDeck.status === 400, "a deck on a type that doesn't exist is refused");
  const badSrsDeck = await fetch(api("/decks"), { method: "POST", headers: json, body: JSON.stringify({ id: crypto.randomUUID(), name: "x", typeId: types0[0].id, srsTypeId: crypto.randomUUID() }) });
  assert(badSrsDeck.status === 400, "a deck on an SRS type that doesn't exist is refused");
  const emptyCard = await fetch(api(`/decks/${deckId}/cards`), { method: "POST", headers: json, body: JSON.stringify({ id: crypto.randomUUID(), values: {} }) });
  assert(emptyCard.status === 400, "a card missing a required field is refused by the API too");
  const missing = await fetch(api(`/decks/${crypto.randomUUID()}/cards`), { method: "POST", headers: json, body: JSON.stringify({ id: crypto.randomUUID(), values: {} }) });
  assert(missing.status === 404, "a card for a deck that doesn't exist is refused with 404");
  const malformed = await fetch(api("/decks/not-a-deck/cards"));
  assert(malformed.status === 400, "a malformed deck id is refused with 400");
  const badAnswer = await fetch(api(`/decks/${deckId}/cards/${three[0].id}/answers`), { method: "POST", headers: json, body: JSON.stringify({ answerId: crypto.randomUUID() }) });
  assert(badAnswer.status === 400, "an answer that isn't one of the deck's SRS type's is refused");
  const usedSrs = await fetch(api(`/srs/${wk.id}`), { method: "DELETE" });
  assert(usedSrs.status === 409, "deleting an SRS type a deck uses is refused");

  console.log("SRS types");
  const [forgot, got] = wk.answers.map((a) => a.id);
  await goHome(click);
  await click("#door-srs");
  await waitFor("the SRS list", async () => (await cdp.count(".srs-row")) === 3);
  assert((await cdp.text(".srs-row .row-sub")) === "9 stages · 4h → 4mo, then Burned · 2 answers" && (await cdp.text(".srs-row .deck-count")) === "2 decks", "the list says what each type is and how many decks use it");
  shotsTaken.push(await cdp.screenshot("desktop-srs-list"));
  await click(".srs-row");
  await waitFor("the editor", () => cdp.exists("[data-canvas]"));
  assert((await cdp.value("#srs-name")) === "WaniKani-like" && (await cdp.text("#screen-title")) === "WaniKani-like", "the editor opens on the type, named in the header");
  assert((await cdp.count(".fnode")) === 5 && (await cdp.count(".fnode.again")) === 1 && (await cdp.count(".fnode.up1")) === 1, "the chart shows the default rules: Forgot asks again and branches, Got it goes up one");
  assert((await cdp.text("#srs-saved")) === "Saved", "the header says the type is saved");
  assert((await cdp.count(".preview .journey")) === 2 && (await cdp.text(".preview .jend.is-done")).startsWith("burned · 9 reviews"), "the preview walks one card to Burned in nine reviews");
  assert((await cdp.count(".rail .rail-chip")) === 11 && (await cdp.text(".rail .rail-chip:nth-child(2) small")) === "right away", "the rail lists the default rules, the nine stages (the first with no wait) and Burned");
  shotsTaken.push(await cdp.screenshot("desktop-srs-editor"));
  await click(".fnode.up1");
  await waitFor("the menu", () => cdp.exists(".menu"));
  assert((await cdp.text(".menu-head span")) === "After Got it" && (await cdp.pressed(".menu [data-opt='up1']")), "tapping a box opens its menu beside it, with what it does lit");
  shotsTaken.push(await cdp.screenshot("desktop-srs-menu"));
  await click(".menu [data-opt='up2']");
  await waitFor("the box", () => cdp.exists(".fnode.up2"));
  await saved("the rule to save", async () => (await getJson("/srs")).types[0].flow[got].by === 2);
  assert(true, "picking Up two changes the box, and the API has the rule a moment later");
  const change = dbRow("SELECT COUNT(*) AS n FROM srs_type_changes WHERE type_id = ?", wk.id);
  assert(change.n === 1, "the change is kept, the whole type before and after");
  await click(".menu-close");
  await waitFor("the menu to close", async () => !(await cdp.exists(".menu")));
  assert(true, "the × in the menu's head closes it");
  await click(".fnode.up2");
  await waitFor("the menu", () => cdp.exists(".menu"));
  /**
   * A spot of empty ground on the chart, on screen: between the top and bottom bars, and clear by a finger's width of
   * every box, arrow label, +, and the menu (a touch near a control snaps to it).
   */
  async function groundPoint() {
    const p = await cdp.eval(
      "(() => { const canvas = document.querySelector('[data-canvas]'); const b = canvas.getBoundingClientRect(); const top = canvas.querySelector('.canvas-top').getBoundingClientRect().bottom; const bottom = canvas.querySelector('.canvas-bottom').getBoundingClientRect().top; const busy = '.menu, .canvas-top, .canvas-bottom, .own-line, [data-node], .edge-plus, .edge-label'; const free = (x, y) => { const el = document.elementFromPoint(x, y); return !!el && canvas.contains(el) && !el.closest(busy); }; const clear = (x, y) => free(x, y) && free(x - 16, y) && free(x + 16, y) && free(x, y - 16) && free(x, y + 16); for (let y = Math.max(top, 0) + 20; y < Math.min(bottom, innerHeight) - 20; y += 12) for (let x = Math.max(b.left, 0) + 20; x < Math.min(b.right, innerWidth) - 20; x += 12) if (clear(x, y)) return { x, y }; return null; })()",
    );
    if (!p) throw new Error("No empty ground on the chart is on screen");
    return p;
  }
  const deskGround = await groundPoint();
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: deskGround.x, y: deskGround.y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: deskGround.x, y: deskGround.y, button: "left", clickCount: 1 });
  await waitFor("the menu to close", async () => !(await cdp.exists(".menu")));
  assert(true, "a click on the ground closes the menu too");
  await click(`[data-plus="${got}"]`);
  await waitFor("the ask-again", async () => (await cdp.count(".fnode.again")) === 2 && (await cdp.count(".fnode")) === 7);
  assert((await cdp.exists("#again-wait")) && (await cdp.value("#again-wait")) === "1", "+ on an arrow puts an ask-again before the step, and opens its wait");
  await saved("the ask-again to save", async () => (await getJson("/srs")).types[0].flow[got].kind === "again");
  await cdp.ctrlZ();
  await waitFor("the undo", async () => (await cdp.count(".fnode")) === 5);
  await saved("the undo to save", async () => (await getJson("/srs")).types[0].flow[got].kind === "move");
  assert(true, "Ctrl+Z takes it back, and that is saved too");

  await click(".rail .rail-chip:nth-child(2)");
  await waitFor("the first stage's chart", () => cdp.exists("#stage-name"));
  assert((await cdp.value("#stage-name")) === "Lesson" && !(await cdp.exists("#stage-wait")), "the first stage's box has its name and no wait: cards start there");
  await click(".rail .rail-chip:nth-child(3)");
  await waitFor("the stage's chart", async () => (await cdp.value("#stage-name")) === "Apprentice 1");
  assert((await cdp.value("#stage-wait")) === "4" && (await cdp.pressed("#stage-unit-h")), "picking a stage shows its own box with its name and wait");
  assert(!(await cdp.exists("#flow-sync")), "a stage on the default rules has no Sync to default");
  await cdp.eval("document.querySelector('#stage-name').select()");
  await cdp.type("#stage-name", "Apprentice One");
  await saved("the name to save", async () => (await getJson("/srs")).types[0].stages[1].name === "Apprentice One");
  assert((await cdp.text(".rail .rail-chip:nth-child(3)")).startsWith("Apprentice One"), "renaming the stage on its box renames it on the rail, and the API has it");
  await click(".fnode.up2");
  await waitFor("the menu", () => cdp.exists(".menu"));
  await click(".menu [data-opt='up1']");
  await waitFor("own rules", () => cdp.exists("#flow-sync"));
  assert((await cdp.exists(".rail .rail-chip:nth-child(3).has-dot")) && (await cdp.text(".own-line")).startsWith("Apprentice One has its own rules."), "changing a rule for one stage gives it its own rules, marked on the rail");
  await saved("the own rules to save", async () => (await getJson("/srs")).types[0].overrides[wk.stages[1].id]?.[got]?.by === 1);
  shotsTaken.push(await cdp.screenshot("desktop-srs-stage"));
  await click("#flow-sync");
  await waitFor("the default again", async () => !(await cdp.exists("#flow-sync")));
  await saved("the sync to save", async () => Object.keys((await getJson("/srs")).types[0].overrides).length === 0);
  assert(await cdp.exists(".fnode.up2"), "Sync to default takes the stage back to the default rules");

  assert((await cdp.count(".stage-rows > .stage-row")) === 10 && (await cdp.exists(".burned-row")), "the Stages list has the nine stages and Burned as its last row");
  await click("#remove-burned");
  await waitFor("no end", () => cdp.exists("#after-repeat"));
  assert((await cdp.pressed("#after-repeat")) && (await cdp.exists("#add-burned")) && (await cdp.count(".rail .rail-chip")) === 10, "removing Burned: the card keeps coming back at the last wait, and the rail loses its chip");
  await saved("the end to save", async () => (await getJson("/srs")).types[0].after === "repeat");
  await click("#add-burned");
  await waitFor("the end again", () => cdp.exists(".burned-row"));
  await saved("the end back", async () => (await getJson("/srs")).types[0].after === "burn");
  await click("#add-stage");
  await waitFor("the new stage", async () => (await cdp.count(".stage-rows > .stage-row")) === 11);
  assert((await cdp.eval("document.activeElement?.id ?? ''")).startsWith("stage-") && (await cdp.text(".rail .rail-chip:nth-child(11)")).endsWith("8 mo"), "Add stage adds one at the end, waiting twice as long as the last, with its name focused");
  await saved("the stage to save", async () => (await getJson("/srs")).types[0].stages.length === 10);
  await dragRow(10, 9, "mouse", ".stage-rows > .stage-row");
  await waitFor("the move", async () => (await cdp.text(".rail .rail-chip:nth-child(10)")).endsWith("8 mo"));
  await saved("the order to save", async () => (await getJson("/srs")).types[0].stages[8].wait.n === 8);
  assert(true, "a stage can be dragged by its grip to a new place");
  await click(".stage-rows > .stage-row:nth-child(9) .stage-remove");
  await waitFor("the stage gone", async () => (await cdp.count(".stage-rows > .stage-row")) === 10);
  await saved("the removal to save", async () => (await getJson("/srs")).types[0].stages.length === 9);
  assert(!(await cdp.exists("#stage-move-question")), "a stage with no cards on it goes without a question");
  await click(".stage-rows > .stage-row:nth-child(2) .stage-remove");
  await waitFor("the question", () => cdp.exists("#stage-move-question"));
  assert((await cdp.text("#stage-move-question")) === "Where do the 3 cards on Apprentice One go?" && (await cdp.text(".ask .btn-chip[aria-pressed='true']")) === "Lesson", "removing a stage with cards on it asks where they go, the stage below picked");
  shotsTaken.push(await cdp.screenshot("desktop-srs-move"));
  await click("#stage-move-keep");
  await waitFor("the question to go", async () => !(await cdp.exists("#stage-move-question")));
  assert((await cdp.count(".stage-rows > .stage-row")) === 10, "Keep the stage keeps it");
  await click(".stage-rows > .stage-row:nth-child(2) .stage-remove");
  await waitFor("the question", () => cdp.exists("#stage-move-question"));
  await cdp.eval("[...document.querySelectorAll('.ask .btn-chip')].find((b) => b.textContent === 'Apprentice 2').click()");
  await waitFor("the pick", () => cdp.eval("document.querySelector('.ask .btn-chip[aria-pressed=\"true\"]')?.textContent === 'Apprentice 2'"));
  await click("#stage-move-go");
  await waitFor("the stage gone", async () => (await cdp.count(".stage-rows > .stage-row")) === 9);
  await saved("the move to save", async () => (await getJson("/srs")).types[0].stages.length === 8);
  const moved = (await getJson(`/decks/${deckId}/cards`)).cards.filter((c) => c.place.stageId !== null);
  assert(moved.length === 3 && moved.every((c) => c.place.stageId === wk.stages[2].id), "the three cards moved to the stage picked, Apprentice 2");
  const moveRows = dbRow("SELECT COUNT(*) AS n FROM card_places WHERE reason = 'stage-removed' AND stage_from = ? AND stage_to = ?", wk.stages[1].id, wk.stages[2].id);
  assert(moveRows.n === 3, "each card's move is kept as a row, from the removed stage to the one picked");
  await waitFor("the counts", async () => (await getJson("/srs")).types[0].cardCounts[wk.stages[2].id] === 3);
  await cdp.eval("document.querySelector('#srs-name').select()");
  await cdp.type("#srs-name", "");
  await cdp.key("Backspace", "Backspace", 8);
  // The bubble and the header's status land in two renders (the editor's, then the App's), so wait for both.
  await waitFor("the name error", async () => (await cdp.text("#srs-name-error")) === "Give the type a name." && (await cdp.text("#srs-saved")) === "Not saved yet");
  assert(true, "an empty name is pointed out, and nothing is saved until it's fixed");
  await cdp.type("#srs-name", "WaniKani-like");
  await saved("the name again", async () => (await getJson("/srs")).types[0].name === "WaniKani-like");

  await click("#nav-back");
  await waitFor("the SRS list", async () => (await cdp.count(".srs-row")) === 3);
  assert((await cdp.text(".srs-row .row-sub")) === "8 stages · 8h → 4mo, then Burned · 2 answers", "the list shows the changed ladder");
  await click("#new-srs");
  await waitFor("the starters", async () => (await cdp.count(".btn-start")) === 4);
  await click("[data-starter='blank']");
  await waitFor("the new type's editor", async () => (await cdp.value("#srs-name")) === "New SRS type");
  assert((await cdp.count(".fnode")) === 4 && (await cdp.exists("#srs-delete")), "a type started from Blank opens with its one stage and three answers, and can be deleted");
  await click("#srs-delete");
  await waitFor("the question", () => cdp.exists("#srs-delete-go"));
  await click("#srs-delete-go");
  await waitFor("the SRS list", async () => (await cdp.count(".srs-row")) === 3);
  assert((await getJson("/srs")).types.length === 3, "deleting an unused SRS type hides it");

  await goHome(click);
  await click("#door-decks");
  await waitFor("the decks list", async () => (await cdp.count(".deck-settings")) === 2);
  await click(".deck-item:nth-child(2) .deck-settings");
  await waitFor("the deck's settings", () => cdp.exists(".srs-chip"));
  await cdp.eval("[...document.querySelectorAll('.srs-chip')].find((b) => b.textContent === 'Classic').click()");
  await waitFor("the switch", () => cdp.pressed(".srs-chip:nth-child(2)"));
  await waitFor("the API", async () => (await getJson("/decks")).decks.find((d) => d.id === listening.id).srsTypeId === srs0[1].id);
  assert(true, "a deck can switch to another SRS type in its settings");
  const srsChange = dbRow("SELECT from_type_id, to_type_id FROM deck_srs_changes WHERE deck_id = ?", listening.id);
  assert(srsChange && srsChange.from_type_id === wk.id && srsChange.to_type_id === srs0[1].id, "the switch is kept, from and to");
  await click("#nav-back");
  await waitFor("the decks list", async () => (await cdp.text(".deck-item:nth-child(2) .row-sub")) === "Phrase · Classic");
  assert(true, "the deck's row says its new SRS type");

  console.log("Phone, dark scheme");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 });
  await cdp.navigate(base);
  await openingMoment(cdp);
  await waitFor("the home screen", () => cdp.exists("#door-review"));
  await waitFor("the counts", async () => (await cdp.text("#door-review .door-detail")) === "0 due · 2 new");
  assert(await cdp.fitsScreen(), "the home screen fits the phone");
  assert(await cdp.eval("window.matchMedia('(hover: none)').matches && window.matchMedia('(pointer: coarse)').matches"), "the page sees a touch device");
  assert(
    await cdp.eval("(() => { const r = document.querySelector('.tabs').getBoundingClientRect(); return Math.abs(r.bottom - window.innerHeight) < 2 && r.top > window.innerHeight / 2; })()"),
    "the tabs sit along the bottom of the phone",
  );
  shotsTaken.push(await cdp.screenshot("phone-home"));
  await tap("#door-decks");
  await waitFor("the decks list", async () => (await cdp.count(".deck-row")) === 2);
  assert(await cdp.fitsScreen(), "the decks screen fits the phone");
  shotsTaken.push(await cdp.screenshot("phone-decks"));
  await tap(".deck-row");
  await waitFor("the deck to open", async () => (await cdp.count(".card-row")) === 4);
  assert(await cdp.fitsScreen(), "the cards screen fits the phone");
  shotsTaken.push(await cdp.screenshot("phone-cards"));
  await tap("#nav-review");
  await waitFor("the review card", () => cdp.exists(".review-card"));
  assert(
    (await cdp.eval("getComputedStyle(document.querySelector('.review-card')).webkitTapHighlightColor")) === "rgba(0, 0, 0, 0)",
    "the card has no blue tap flash from the browser",
  );
  // By now the first stage is gone and Got it goes up two, so a new card lands on the second rung.
  shotsTaken.push(await reviewToTheEnd(cdp, tap, 1, "phone-review", "Apprentice 3 · 1 d"));
  assert(await cdp.fitsScreen(), "the review screen fits the phone too");
  shotsTaken.push(await cdp.screenshot("phone-review-end"));
  await tap("#nav-back");
  await waitFor("the deck's cards", () => cdp.exists("#add-card"));
  await goHome(tap);
  assert(true, "back and the Home tab work by touch");

  await tap("#door-types");
  await waitFor("the types list", async () => (await cdp.count(".type-row")) === 2);
  await tap(".type-row");
  await waitFor("the type editor", () => cdp.exists("#type-name"));
  assert(await cdp.fitsScreen(), "the type editor fits the phone");
  shotsTaken.push(await cdp.screenshot("phone-type"));
  const firstRequired = ".field-rows > .field-row:first-child [role='switch']";
  const wasOn = await cdp.checked(firstRequired);
  await tap(firstRequired);
  await waitFor("the switch", async () => (await cdp.checked(firstRequired)) !== wasOn);
  assert(true, "Required flips by touch");
  await dragRow(1, 2, "touch");
  await waitFor("the touch move", async () => (await cdp.value(".field-rows > .field-row:nth-child(2) .field-input")) === "Word");
  assert(await cdp.fitsScreen(), "a field can be dragged by a finger, and the editor still fits");

  await goHome(tap);
  await tap("#door-srs");
  await waitFor("the SRS list", async () => (await cdp.count(".srs-row")) === 3);
  await tap(".srs-row");
  await waitFor("the editor", () => cdp.exists("[data-canvas]"));
  assert(await cdp.fitsScreen(), "the SRS editor fits the phone");
  shotsTaken.push(await cdp.screenshot("phone-srs-editor"));
  const before = await cdp.eval("document.querySelector('.viewport').style.transform");
  await cdp.rect("[data-canvas]");
  const ground = await groundPoint();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: ground.x, y: ground.y }] });
  for (let s = 1; s <= 5; s++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: ground.x + 16 * s, y: ground.y + 10 * s }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(1500);
  const panned = (await cdp.eval("document.querySelector('.viewport').style.transform")) !== before;
  assert(panned, panned ? "a finger pans the chart" : `a finger pans the chart (the touch started at ${ground.x}, ${ground.y})`);
  await tap(".fnode.up2");
  await waitFor("the menu", () => cdp.exists(".menu"));
  assert(await cdp.fitsScreen(), "tapping a box opens its menu, and the page still fits");
  shotsTaken.push(await cdp.screenshot("phone-srs-menu"));
  await tap(".menu [data-opt='up1']");
  await waitFor("the box", () => cdp.exists(".fnode.up1"));
  await saved("the rule to save", async () => (await getJson("/srs")).types[0].flow[got].by === 1);
  assert(true, "a rule can be changed by touch");
  const tapAt = await groundPoint();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: tapAt.x, y: tapAt.y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await waitFor("the menu to close", async () => !(await cdp.exists(".menu")));
  assert(true, "a tap on the ground closes the menu");

  await goHome(tap);
  await tap("#door-decks");
  await waitFor("the decks list", () => cdp.exists(".deck-settings"));
  await tap(".deck-settings");
  await waitFor("the deck's settings", () => cdp.exists("#deck-delete"));
  assert(await cdp.fitsScreen(), "the deck's settings fit the phone");
  await tap("#deck-delete");
  await waitFor("the question", () => cdp.exists("#deck-delete-go"));
  shotsTaken.push(await cdp.screenshot("phone-deck-delete"));
  await tap("#deck-delete-go");
  await waitFor("the decks list without it", async () => (await cdp.text(".list-title")) === "1 deck");
  assert(true, "deleting the deck by touch returns to the list, which has one deck left");
  const after = (await getJson("/decks")).decks;
  assert(after.length === 1 && after[0].name === "Listening", "the API no longer lists the deck");
  assert((await fetch(api(`/decks/${deckId}/cards`))).status === 404, "its cards are no longer served");
  const kept = dbRow("SELECT removed_at, (SELECT COUNT(*) FROM cards WHERE deck_id = d.id) AS cards FROM decks d WHERE id = ?", deckId);
  assert(kept && kept.removed_at > 0 && kept.cards === 4, "the deck and its 4 cards are kept in the database with the removal time");
  const again = await fetch(api(`/decks/${deckId}`), { method: "DELETE" });
  assert(again.status === 204, "deleting it again is harmless");

  console.log(`\nAll checks passed. Screenshots:\n  ${shotsTaken.join("\n  ")}`);
} catch (e) {
  console.error(`\n${e.message}`);
  // What the page looked like when it failed, so a timeout has a face.
  if (cdp) {
    try {
      console.error(`  where: ${await cdp.eval("location.href + ' · active: ' + (document.activeElement?.id || document.activeElement?.tagName) + ' · tabs: ' + getComputedStyle(document.querySelector('.tabs')).display + ' · scrollY: ' + window.scrollY + ' · title: ' + document.querySelector('#screen-title')?.textContent")}`);
      console.error(`  screenshot: ${await cdp.screenshot("failure")}`);
    } catch {
      /* the page is gone */
    }
  }
  process.exitCode = 1;
} finally {
  stopAll();
}
