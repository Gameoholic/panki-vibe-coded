// Temporary: the prompt trial, removed whole once the owner picks (aiActions.ts → the key above TRIAL_ACTIONS).
import { useEffect, useRef, useState } from "react";
import { trialResultsText, type TrialResults } from "@panki/contracts";
import { api } from "../api";
import { Ask } from "../components/Ask";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { CopyButton } from "../components/PromptContext";
import { Skeleton } from "../components/Skeleton";

/** What Clear results says, and its question. */
const CLEAR_WORDS = {
  button: "Clear results",
  busy: "Clearing…",
  ask: "Clear the trial's results?",
  detail: "Every count starts again from nothing, and answers given before can't be rated any more. Nothing kept is deleted.",
};

/**
 * Settings → Prompt trial, a tab of its own (temporary: `aiActions.ts`, the key above `TRIAL_ACTIONS`): the blind
 * trial's results so far, per set, each wording by its codename with how often it went and its thumbs; Copy results,
 * the lot as plain text for the owner to hand on; and Clear results, asking first, so the trial starts over (nothing
 * destroyed: every read counts from the latest clear), greyed with nothing to clear. Nothing of what a codename says:
 * that's the key's alone.
 */
export function PromptTrialPanel() {
  const [results, setResults] = useState<TrialResults | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearFailure, setClearFailure] = useState<string | null>(null);
  const clearAt = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let alive = true;
    api.trialResults().then(
      (got) => {
        if (alive) setResults(got);
      },
      (error: unknown) => {
        if (alive) setFailure(error instanceof Error ? error.message : "Couldn't load the results.");
      },
    );
    return () => {
      alive = false;
    };
  }, []);
  async function clear() {
    setClearing(true);
    setClearFailure(null);
    try {
      setResults(await api.clearTrial());
      setAsking(false);
    } catch (error) {
      setClearFailure(error instanceof Error ? error.message : "Couldn't clear the results.");
    } finally {
      setClearing(false);
    }
  }
  /** Something to clear: an answer went with the trial since it last started over (a rating is always of one). */
  const anything = results?.sets.some((set) => set.rows.some((row) => row.used > 0)) ?? false;
  return (
    <section className="panel" aria-labelledby="prompt-trial-title">
      <h2 id="prompt-trial-title" className="panel-title">
        Prompt trial
      </h2>
      {failure !== null ? (
        <p className="form-failure">{failure}</p>
      ) : results === null ? (
        <Skeleton shape="rows" count={2} />
      ) : (
        <>
          {results.sets.map((set) => (
            <table key={set.name} className="prompt-trial-table">
              <caption>{set.name}</caption>
              <thead>
                <tr>
                  <th scope="col">Wording</th>
                  <th scope="col">Used</th>
                  <th scope="col" aria-label="Thumbs up">
                    👍
                  </th>
                  <th scope="col">Meh</th>
                  <th scope="col" aria-label="Thumbs down">
                    👎
                  </th>
                </tr>
              </thead>
              <tbody>
                {set.rows.map((row) => (
                  <tr key={row.codename}>
                    <th scope="row">{row.codename}</th>
                    <td>{row.used}</td>
                    <td>{row.up}</td>
                    <td>{row.meh}</td>
                    <td>{row.down}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
          <div className="add-actions add-actions-start">
            <CopyButton id="prompt-trial-copy" words="Copy results" text={trialResultsText(results)} />
            <Button ref={clearAt} id="prompt-trial-clear" aria-expanded={asking} disabled={!anything || clearing} onClick={() => setAsking(!asking)}>
              <Icon name="trash" />
              {CLEAR_WORDS.button}
            </Button>
          </div>
          {asking ? (
            <Ask
              idPrefix="prompt-trial-clear"
              anchor={clearAt}
              question={CLEAR_WORDS.ask}
              detail={CLEAR_WORDS.detail}
              go={{ words: CLEAR_WORDS.button, busy: CLEAR_WORDS.busy }}
              busy={clearing}
              failure={clearFailure}
              onKeep={() => {
                setAsking(false);
                setClearFailure(null);
              }}
              onGo={() => void clear()}
            />
          ) : null}
        </>
      )}
    </section>
  );
}
