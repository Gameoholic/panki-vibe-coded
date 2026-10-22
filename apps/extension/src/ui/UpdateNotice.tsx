import { useEffect, useRef, useState } from "react";
import { Button } from "@web/components/Button";
import { Icon } from "@web/components/Icon";
import { useDismiss } from "@web/hooks/useDismiss";
import { dateWords } from "@web/words";
import { askDownloadUpdate, askReloadPanki, askShowFolder, askUpdate, type UpdateState } from "../messages";

/**
 * The extension's update, said where it's used (the owner, 2026-10-22, from the prototype at
 * https://claude.ai/artifact/SbBEB7JFVxbtLtvkW7rCMN): the way to it is Update Panki, in the folder the extension was put
 * in, then Reload Panki; or the zip downloaded and put there by hand. `UpdateBody` is what's said, as two steps;
 * the strip's head carries it under a button of its own (`UpdateMenu`), the options page in a panel at its top. Never a
 * second notice of an update.
 */

/** Whether there's an update to speak of. */
export const updateShown = (update: UpdateState): boolean => update.state === "available" || update.state === "needed";

export const UPDATE_WORDS = { available: "Update available", needed: "Update needed" } as const;

/** The day a build's files last changed, in words. Noon, so no zone turns it into the day before. */
export const buildDayWords = (changedAt: string): string => dateWords(Date.parse(`${changedAt}T12:00:00`));

/** How often an open notice asks whether the new files are in the folder yet, in ms: a question to the worker, which reads a file of the extension's own. */
const READY_EVERY_MS = 2000;

/**
 * What's said of an update, as the two steps it takes (the owner, 2026-10-22: words over a Reload button went unread,
 * and Reload was pressed as if it updated): 1, double-click Update Panki in Panki's folder (Find the folder opens
 * Chrome's page for the extension, which says where it's loaded from); 2, Reload Panki, which stays off until the new
 * files are in the folder (`UpdateState.ready`, asked again every few seconds while this is open), step 1 ticked then.
 * Under them, the zip, to extract over the folder by hand. `onReloading` is told just before the extension reloads (a
 * page reloads itself after it, to take the new one); `reopen` has the extension open its own page again once it's
 * back (that page, which the reload closes).
 */
export function UpdateBody({ update, onReloading, reopen = false }: { update: UpdateState; onReloading?: () => void; reopen?: boolean }) {
  const [failure, setFailure] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [ready, setReady] = useState(update.ready);
  const shown = updateShown(update);
  useEffect(() => {
    if (!shown) return;
    let alive = true;
    const ask = () => void askUpdate().then((now) => alive && setReady(now.ready));
    ask();
    const every = setInterval(ask, READY_EVERY_MS);
    return () => {
      alive = false;
      clearInterval(every);
    };
  }, [shown]);
  if (!shown) return null;
  async function download() {
    setFailure(null);
    const answer = await askDownloadUpdate();
    if (answer.ok) setDownloaded(true);
    else setFailure(answer.message);
  }
  function reload() {
    onReloading?.();
    void askReloadPanki(reopen);
  }
  return (
    <div className="update-body">
      <p className="update-what">{update.state === "needed" ? "This version no longer works with Panki." : update.latest ? `From ${buildDayWords(update.latest.changedAt)}.` : null}</p>
      <ol className="update-steps">
        <li className={ready ? "is-done" : undefined}>
          <span className="update-step-mark" aria-hidden="true">
            {ready ? <Icon name="check" /> : "1"}
          </span>
          {ready ? (
            <span className="update-step-words">The new version is in Panki's folder.</span>
          ) : (
            <span className="update-step-words">
              <b>Double-click Update Panki</b> in Panki's folder.
              <Button className="update-find" onClick={() => void askShowFolder()}>
                Find the folder
              </Button>
            </span>
          )}
        </li>
        <li className={ready ? "is-now" : undefined}>
          <span className="update-step-mark" aria-hidden="true">
            2
          </span>
          <span className="update-step-words">
            <Button variant="primary" disabled={!ready} onClick={reload}>
              Reload Panki
            </Button>
          </span>
        </li>
      </ol>
      <p className="update-by-hand">
        Or extract the zip over Panki's folder yourself:
        <Button className="update-find" onClick={() => void download()}>
          {downloaded ? "Downloaded" : "Manual download"}
        </Button>
      </p>
      {failure ? (
        <p className="load-error" role="alert">
          {failure}
        </p>
      ) : null}
    </div>
  );
}

/** The update in the strip's head: a button in the accent (available) or the flag's amber (needed), its panel under it. Open from the start while the update is needed: then it's all the strip has. */
export function UpdateMenu({ update, onReloading }: { update: UpdateState; onReloading?: () => void }) {
  const [open, setOpen] = useState(update.state === "needed");
  const rootRef = useRef<HTMLDivElement>(null);
  useDismiss(rootRef, open, () => setOpen(false));
  if (!updateShown(update)) return null;
  const words = update.state === "needed" ? UPDATE_WORDS.needed : UPDATE_WORDS.available;
  return (
    <div ref={rootRef} className="strip-menu-wrap">
      <Button className={`capture-tool strip-menu-button is-${update.state}`} aria-expanded={open} aria-controls="panki-update-menu" onClick={() => setOpen((was) => !was)}>
        <i className="strip-menu-dot" aria-hidden="true" />
        {words}
        <Icon name="down" />
      </Button>
      {open ? (
        <div id="panki-update-menu" className="strip-menu" role="dialog" aria-label={words}>
          <UpdateBody update={update} onReloading={onReloading} />
        </div>
      ) : null}
    </div>
  );
}
