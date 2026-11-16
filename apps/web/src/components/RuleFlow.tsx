/** @panki Automations as a flow: each trigger a node, each automation a node joined to it by a line tinted by its use, opened in place (`RuleFlow`). Never a second drawing of them. */
import { useLayoutEffect, useRef, useState } from "react";
import { SLIDE_MS, useSlide } from "../hooks/useHoist";
import { RULE_TRIGGERS, RULE_TRIGGER_IDS, ruleProblem, type AccountActions, type Rule, type RuleTriggerId } from "@panki/contracts";
import { ACTION_ICONS, TRIGGER_ICONS, asksPankiAi, limitChips, lineTint, ruleTitle } from "../ruleKinds";
import { QuietIconButton } from "./AiRun";
import { AiSpark } from "./AiWaiting";
import { Ask } from "./Ask";
import { Button } from "./Button";
import { Fold } from "./Fold";
import { Icon } from "./Icon";
import { RuleEditor } from "./RuleEditor";
import { Toggle } from "./Toggle";

type Props = {
  /** The account's automations as on screen, a change that can't be kept held in its place. */
  rules: readonly Rule[];
  /** One being made, drawn under its trigger with a dashed line until Create; null for none. */
  draft: Rule | null;
  /** The automation whose editor is open in place (the draft's id while it's being made). */
  openId: string | null;
  book: AccountActions;
  /** How much each was used today (its runs), for its line's tint. */
  runsOf: (rule: Rule) => number;
  onOpen: (id: string | null) => void;
  onChange: (rule: Rule) => void;
  onDelete: (id: string) => void;
  onStartDraft: (when: RuleTriggerId) => void;
  onDraft: (rule: Rule) => void;
  onCreate: () => void;
  onCancelDraft: () => void;
};

/** A line as drawn: from its trigger's right edge to its automation's head, a curve between. */
type Drawn = { key: string; when: RuleTriggerId; d: string; x: number; y: number; tint: string | null; draft: boolean };

/**
 * The account's automations as a flow: the triggers that have one down the left, each a node with its port (a press
 * makes a new automation on it), each automation a node at the right with its icon, what it does and its limits as chips,
 * its On / Off, and the line that joins it to its trigger, tinted from the accent for the most used to grey for the
 * least (`lineTint`), plain and dashed while Off or unused; one being made dashed and moving. Pointing at a trigger with a
 * mouse lights its lines alone. A node pressed opens its editor in place under it (`Fold`), its foot Delete (asking
 * first), or Cancel and Create for one being made. Every node is the flow's own child, kept by its id: one whose When
 * changes stays the same node (nothing replayed), standing still where it stays and sliding to its new trigger where it
 * moves (`useSlide`), its line following it frame by frame. The lines are measured from the nodes as they stand and
 * drawn again whenever any of them changes size.
 */
export function RuleFlow({ rules, draft, openId, book, runsOf, onOpen, onChange, onDelete, onStartDraft, onDraft, onCreate, onCancelDraft }: Props) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [lines, setLines] = useState<readonly Drawn[]>([]);
  const [lit, setLit] = useState<RuleTriggerId | null>(null);
  const all = draft ? [...rules, draft] : [...rules];
  const most = Math.max(0, ...rules.map(runsOf));
  // Each trigger that has one, its row in the flow's one grid and its automations in the rows from there: every node
  // a child of the flow itself, by its id, so one whose When changes is the same node, slid to its new row (`useSlide`).
  const placed = RULE_TRIGGER_IDS.reduce<{ when: RuleTriggerId; row: number; members: Rule[] }[]>((out, when) => {
    const members = all.filter((rule) => rule.when === when);
    if (members.length === 0) return out;
    const last = out[out.length - 1];
    return [...out, { when, row: last ? last.row + last.members.length : 1, members }];
  }, []);
  const order = placed.map(({ when, members }) => `${when}:${members.map((rule) => rule.id).join(",")}`).join("|");
  useSlide(root, order);
  const tints = new Map(all.map((rule) => [rule.id, rule === draft ? null : lineTint(runsOf(rule), most, rule.on)]));
  const tintKey = all.map((rule) => `${rule.id}:${rule.when}:${tints.get(rule.id) ?? ""}`).join("|");
  const drawnOrder = useRef(order);

  useLayoutEffect(() => {
    if (!root) return;
    const draw = () => {
      const box = root.getBoundingClientRect();
      const next: Drawn[] = [];
      for (const node of root.querySelectorAll<HTMLElement>("[data-rule]")) {
        const when = node.dataset.when as RuleTriggerId | undefined;
        const id = node.dataset.rule;
        const from = when ? root.querySelector<HTMLElement>(`[data-trigger="${when}"]`) : null;
        const head = node.querySelector<HTMLElement>(".rule-node-head");
        if (!when || !id || !from || !head) continue;
        const a = from.getBoundingClientRect();
        const b = head.getBoundingClientRect();
        const x1 = a.right - box.left;
        const y1 = a.top + a.height / 2 - box.top;
        const x2 = node.getBoundingClientRect().left - box.left;
        const y2 = b.top + Math.min(b.height / 2, 18) - box.top;
        const dx = Math.max(16, (x2 - x1) * 0.55);
        next.push({ key: id, when, d: `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`, x: x2, y: y2, tint: tints.get(id) ?? null, draft: draft?.id === id });
      }
      setLines(next);
    };
    draw();
    const seen = new ResizeObserver(draw);
    seen.observe(root);
    for (const node of root.querySelectorAll("[data-rule], [data-trigger]")) seen.observe(node);
    // While nodes slide to a new order, the lines follow them frame by frame, as the slide's transforms move them.
    let frame = 0;
    if (drawnOrder.current !== order) {
      const until = performance.now() + SLIDE_MS + 40;
      const follow = (now: number) => {
        draw();
        if (now < until) frame = requestAnimationFrame(follow);
      };
      frame = requestAnimationFrame(follow);
    }
    drawnOrder.current = order;
    return () => {
      seen.disconnect();
      cancelAnimationFrame(frame);
    };
    // Drawn again as the nodes, their triggers or their tints change; their sizes are heard by the observer.
  }, [root, tintKey, openId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={setRoot} className="rule-flow">
      <svg className="rule-flow-lines" aria-hidden="true">
        {lines.map((line) => {
          const look = `${line.draft ? "is-draft" : line.tint === null ? "is-plain" : ""} ${lit !== null && lit !== line.when ? "is-dim" : ""}`.trim();
          const colour = line.tint ?? undefined;
          return (
            <g key={line.key} className={`rule-line ${look}`.trim()} style={colour ? { color: colour } : undefined}>
              <path d={line.d} />
              <circle cx={line.x} cy={line.y} r={3.5} />
            </g>
          );
        })}
      </svg>
      {placed.flatMap(({ when, row, members }, g) => [
        <div
          key={`trigger:${when}`}
          className={`rule-trigger ${g > 0 ? "is-later" : ""}`.trim()}
          style={{ gridRow: `${row} / span ${members.length}` }}
          data-trigger={when}
          onPointerEnter={(e) => (e.pointerType === "mouse" ? setLit(when) : undefined)}
          onPointerLeave={() => setLit(null)}
        >
          <span className="rule-trigger-icon">
            <Icon name={TRIGGER_ICONS[when]} />
          </span>
          <span className="rule-trigger-name">{capFirst(RULE_TRIGGERS[when].name)}</span>
          <QuietIconButton className="rule-port" icon="add" words={`New automation when ${RULE_TRIGGERS[when].name}`} open={false} disabled={draft !== null} onClick={() => onStartDraft(when)} />
        </div>,
        ...members.map((rule, i) => (
          <RuleNode
            key={rule.id}
            rule={rule}
            book={book}
            row={row + i}
            later={g > 0 && i === 0}
            draft={rule === draft}
            open={openId === rule.id}
            // One being made stays open until Create or Cancel.
            onOpen={() => (rule === draft ? undefined : onOpen(openId === rule.id ? null : rule.id))}
            onChange={rule === draft ? onDraft : onChange}
            onDelete={() => onDelete(rule.id)}
            onCreate={onCreate}
            onCancel={onCancelDraft}
          />
        )),
      ])}
    </div>
  );
}

const capFirst = (words: string) => `${words.charAt(0).toUpperCase()}${words.slice(1)}`;

/**
 * One automation as a node: its title (`ruleTitle`: "✦ Explain" with Panki AI's spark in its icon's place, "Start
 * transcribing" with its action's icon) with its limits as chips under it, its
 * On / Off at the right, why it can't be kept under them where it can't; pressed, its editor opens in place under it.
 */
function RuleNode({
  rule,
  book,
  row,
  later,
  draft,
  open,
  onOpen,
  onChange,
  onDelete,
  onCreate,
  onCancel,
}: {
  rule: Rule;
  book: AccountActions;
  /** Its row in the flow's grid. */
  row: number;
  /** The first of a trigger's after the first trigger's: set apart from the group above. */
  later: boolean;
  draft: boolean;
  open: boolean;
  onOpen: () => void;
  onChange: (rule: Rule) => void;
  onDelete: () => void;
  onCreate: () => void;
  onCancel: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const deleteAt = useRef<HTMLButtonElement>(null);
  const problem = ruleProblem(rule);
  const chips = limitChips(rule);
  const prefix = draft ? "rule-new" : `rule-${rule.id}`;
  return (
    <div
      className={`rule-node ${rule.on ? "" : "is-off"} ${open ? "is-open" : ""} ${draft ? "is-draft" : ""} ${later ? "is-later" : ""}`.replace(/\s+/g, " ").trim()}
      style={{ gridRow: row }}
      data-rule={rule.id}
      data-when={rule.when}
    >
      <div className="rule-node-head">
        <Button id={prefix} className="rule-node-open" aria-expanded={open} onClick={onOpen}>
          <span className={`rule-node-icon ${asksPankiAi(rule) ? "is-ai" : ""}`.trim()}>{asksPankiAi(rule) ? <AiSpark /> : <Icon name={ACTION_ICONS[rule.do]} />}</span>
          <span className="rule-node-body">
            <span className="rule-node-name">{ruleTitle(rule, book)}</span>
            {chips.length > 0 ? (
              <span className="rule-chips">
                {chips.map((chip) => (
                  <span key={chip} className="rule-chip">
                    {chip}
                  </span>
                ))}
              </span>
            ) : null}
          </span>
        </Button>
        {draft ? null : <Toggle id={`${prefix}-on`} says={{ on: "On", off: "Off" }} on={rule.on} onChange={(on) => onChange({ ...rule, on })} />}
      </div>
      {problem ? <p className="rule-node-line is-problem">{problem}</p> : null}
      <Fold open={open}>
        <RuleEditor idPrefix={prefix} rule={rule} book={book} onChange={onChange} />
        <div className="rule-node-foot">
          {draft ? (
            <>
              <Button id={`${prefix}-cancel`} onClick={onCancel}>
                Cancel
              </Button>
              <Button id={`${prefix}-create`} variant="primary" disabled={problem !== null} onClick={onCreate}>
                <Icon name="add" />
                Create
              </Button>
            </>
          ) : (
            <>
              <Button ref={deleteAt} id={`${prefix}-delete`} className="is-danger" aria-pressed={asking} aria-expanded={asking} onClick={() => setAsking(!asking)}>
                <Icon name="trash" />
                Delete
              </Button>
              {asking ? (
                <Ask
                  idPrefix={`${prefix}-delete`}
                  anchor={deleteAt}
                  question="Delete this automation?"
                  go={{ words: "Delete", busy: "Deleting…" }}
                  busy={false}
                  failure={null}
                  onKeep={() => setAsking(false)}
                  onGo={() => {
                    setAsking(false);
                    onDelete();
                  }}
                />
              ) : null}
            </>
          )}
        </div>
      </Fold>
    </div>
  );
}
