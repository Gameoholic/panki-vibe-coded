import { createElement, type CSSProperties, type ReactNode } from "react";
import { z } from "zod";

/**
 * What a dictionary says a word means, drawn and read out as text. A definition is a list of items: plain text, or a
 * formatted one (the format's "structured content": a tree of lists, tables, readings over kanji, bold and so on).
 * A dictionary is a stranger's file, so nothing in it is ever handed to the page as markup: the tree is rebuilt from a
 * short list of allowed pieces, each drawn by React, with a few harmless looks kept (bold, italic, size, lines) and
 * everything else dropped. A link becomes its words; a picture is left out (it would be another file of the zip).
 */

const BLOCK = new Set(["div", "ol", "ul", "li", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "details", "summary"]);
const INLINE = new Set(["span", "ruby", "rt", "rp"]);
/** How deep and how big a tree is drawn: no real definition comes near either. */
const DEPTH_MAX = 30;
const NODES_MAX = 3000;

const Style = z
  .object({
    fontWeight: z.enum(["bold", "normal"]).optional().catch(undefined),
    fontStyle: z.enum(["italic", "normal"]).optional().catch(undefined),
    fontSize: z
      .string()
      .regex(/^(small|smaller|medium|large|larger|\d{1,3}(\.\d+)?%|\d(\.\d+)?em)$/)
      .optional()
      .catch(undefined),
    textDecorationLine: z
      .string()
      .regex(/^(underline|line-through|overline)( (underline|line-through|overline))*$/)
      .optional()
      .catch(undefined),
    verticalAlign: z.enum(["baseline", "sub", "super", "middle", "top", "bottom", "text-top", "text-bottom"]).optional().catch(undefined),
    textAlign: z.enum(["left", "right", "center", "start", "end"]).optional().catch(undefined),
  })
  .partial();

const Element = z.object({
  tag: z.string(),
  content: z.unknown().optional(),
  style: Style.optional().catch(undefined),
  lang: z
    .string()
    .regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})?$/)
    .optional()
    .catch(undefined),
  colSpan: z.number().int().min(1).max(20).optional().catch(undefined),
  rowSpan: z.number().int().min(1).max(20).optional().catch(undefined),
});

const TextItem = z.object({ type: z.literal("text"), text: z.string() });
const Structured = z.object({ type: z.literal("structured-content"), content: z.unknown() });

/** The count of pieces drawn so far, so a huge tree stops being drawn rather than taking the page with it. */
type Budget = { left: number };

function draw(node: unknown, depth: number, budget: Budget, key: number): ReactNode {
  if (budget.left-- <= 0 || depth > DEPTH_MAX) return null;
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map((child, i) => draw(child, depth + 1, budget, i));
  const element = Element.safeParse(node);
  if (!element.success) return null;
  const { tag, content, style, lang } = element.data;
  const children = content === undefined ? null : draw(content, depth + 1, budget, 0);
  const css: CSSProperties | undefined = style && Object.keys(style).length > 0 ? style : undefined;
  if (tag === "br") return <br key={key} />;
  if (tag === "a") return <span key={key} className="gloss-link">{children}</span>;
  if (!BLOCK.has(tag) && !INLINE.has(tag)) return null;
  // Only a tag on the lists above gets this far, with only the looks and spans read above.
  const cell = tag === "td" || tag === "th" ? { colSpan: element.data.colSpan, rowSpan: element.data.rowSpan } : {};
  return createElement(tag, { key, style: css, lang, ...cell }, children);
}

/** One definition item, drawn. */
function Item({ item }: { item: unknown }) {
  if (typeof item === "string") return <>{item}</>;
  const text = TextItem.safeParse(item);
  if (text.success) return <>{text.data.text}</>;
  const structured = Structured.safeParse(item);
  if (structured.success) return <div className="gloss-structured">{draw(structured.data.content, 0, { left: NODES_MAX }, 0)}</div>;
  return null;
}

/** A definition as the dictionary wrote it: plain items one after another, a formatted one as its own block. */
export function Glossary({ items }: { items: readonly unknown[] }) {
  const plain = items.every((item) => typeof item === "string" || TextItem.safeParse(item).success);
  if (plain) return <span className="gloss">{items.map((item) => (typeof item === "string" ? item : TextItem.safeParse(item).data?.text ?? "")).join("; ")}</span>;
  return (
    <div className="gloss">
      {items.map((item, i) => (
        <Item key={i} item={item} />
      ))}
    </div>
  );
}

/** A formatted definition's words, a line for each block; readings over kanji are left out. */
function linesOf(node: unknown, depth: number, budget: Budget, lines: string[]): void {
  if (budget.left-- <= 0 || depth > DEPTH_MAX) return;
  if (typeof node === "string") {
    lines[lines.length - 1] += node;
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) linesOf(child, depth + 1, budget, lines);
    return;
  }
  const element = Element.safeParse(node);
  if (!element.success || element.data.tag === "rt" || element.data.tag === "rp") return;
  const block = BLOCK.has(element.data.tag) || element.data.tag === "br";
  if (block) lines.push("");
  if (element.data.content !== undefined) linesOf(element.data.content, depth + 1, budget, lines);
  if (block) lines.push("");
}

/** A definition as plain text, for a card's Meaning: its parts joined with "; ". */
export function glossaryText(items: readonly unknown[]): string {
  const parts: string[] = [];
  for (const item of items) {
    if (typeof item === "string") parts.push(item);
    else {
      const text = TextItem.safeParse(item);
      if (text.success) parts.push(text.data.text);
      const structured = Structured.safeParse(item);
      if (structured.success) {
        const lines = [""];
        linesOf(structured.data.content, 0, { left: NODES_MAX }, lines);
        parts.push(...lines);
      }
    }
  }
  return parts
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part !== "")
    .join("; ");
}
