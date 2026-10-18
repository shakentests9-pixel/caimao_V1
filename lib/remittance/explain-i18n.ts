import type { ExplanationPart } from "./engine";

type T = (key: string, values?: Record<string, string | number>) => string;

/** Renders the structured provider explanation with a translator scoped to "Explain". */
export function renderExplanation(parts: ExplanationPart[] | undefined, t: T, fallback = ""): string {
  if (!parts?.length) return fallback;
  return parts.map((p) => (p.code === "all_in" ? t(p.params.other ? "all_in_other" : "all_in", p.params) : t(p.code, p.params as Record<string, string>))).join(" ");
}
