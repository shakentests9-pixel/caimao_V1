import { Fragment } from "react";

/** Minimal renderer for the agent's replies: paragraphs, "- " lists and **bold**. No HTML is ever injected. */
const MASK = "\u0000MASK\u0000";

function inline(raw: string) {
  // Masked account numbers ("****4821") contain asterisks; protect them from the bold parser.
  const text = raw.replace(/\*{4}(?=\d{4})/g, MASK);
  const unmask = (s: string) => s.split(MASK).join("****");
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-extrabold text-cocoa">{unmask(part.slice(2, -2))}</strong>
    ) : (
      <Fragment key={i}>{unmask(part)}</Fragment>
    ),
  );
}

export function Markdown({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="space-y-3 text-[16px] leading-[1.65] text-cocoa-2">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*[-•]\s/.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1.5 pl-5 marker:text-gold">
              {lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-•]\s/, ""))}</li>)}
            </ul>
          );
        }
        return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}</p>;
      })}
    </div>
  );
}
