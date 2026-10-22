import { useCallback, useEffect, useState } from "react";
import { Button } from "@web/components/Button";
import { Setting } from "@web/components/Setting";
import { NO_UPDATE, askCheckUpdate, askUpdate, type UpdateState } from "../messages";
import { UPDATE_WORDS, UpdateBody, buildDayWords, updateShown } from "../ui/UpdateNotice";

/**
 * The extension's update on its own page: at the top of every tab while there's one (`UpdateBanner`), and on the About
 * tab what this build is and how it stands, with Check now (`VersionPanel`). Both read the worker's answer, kept from its
 * last check (`updates.ts`); the page reads it again whenever it gets the focus back.
 */
export function useUpdate(): { update: UpdateState; check: () => Promise<string | null>; checking: boolean } {
  const [update, setUpdate] = useState<UpdateState>(NO_UPDATE);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    const read = () => void askUpdate().then(setUpdate);
    read();
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
  }, []);
  /** Panki asked afresh; what went wrong, or null. */
  const check = useCallback(async () => {
    setChecking(true);
    try {
      const answer = await askCheckUpdate();
      if (!answer.ok) return answer.message;
      setUpdate(answer.update);
      return null;
    } finally {
      setChecking(false);
    }
  }, []);
  return { update, check, checking };
}

export function UpdateBanner({ update }: { update: UpdateState }) {
  if (!updateShown(update)) return null;
  const needed = update.state === "needed";
  return (
    <section className={`panel update-panel ${needed ? "is-needed" : ""}`.trim()} aria-labelledby="update-title">
      <h2 id="update-title" className="panel-title">
        {needed ? UPDATE_WORDS.needed : UPDATE_WORDS.available}
      </h2>
      {/* The page closes as the extension reloads, and opens again on its About tab once it's back. */}
      <UpdateBody update={update} reopen />
    </section>
  );
}

/** How this build stands, in words. */
const STATE_WORDS: Record<UpdateState["state"], string> = {
  current: "Up to date",
  available: UPDATE_WORDS.available,
  needed: UPDATE_WORDS.needed,
  unknown: "Not checked",
};

export function VersionPanel({ update, check, checking }: { update: UpdateState; check: () => Promise<string | null>; checking: boolean }) {
  const [failure, setFailure] = useState<string | null>(null);
  const own = update.own;
  return (
    <section className="panel" aria-labelledby="version-title">
      <h2 id="version-title" className="panel-title">
        Extension
      </h2>
      <Setting id="extension-version" label="Version" control={<span className="update-version">{own ? `${buildDayWords(own.changedAt)} · ${own.fingerprint}` : "Unknown"}</span>} />
      <Setting
        id="extension-updates"
        label="Updates"
        control={
          <span className="update-check">
            <span className="update-version">{STATE_WORDS[update.state]}</span>
            <Button disabled={checking} onClick={() => void check().then(setFailure)}>
              {checking ? "Checking…" : "Check now"}
            </Button>
          </span>
        }
      />
      {failure ? (
        <p className="load-error" role="alert">
          {failure}
        </p>
      ) : null}
    </section>
  );
}
