"use client";
import { Children, useState } from "react";
import { ChevronDown } from "lucide-react";

/** Renders the first `initial` children of a list, with a button to reveal the rest. */
export function ShowMore({ children, initial, label }: { children: React.ReactNode; initial: number; label: string }) {
  const [all, setAll] = useState(false);
  const items = Children.toArray(children);
  return (
    <>
      <ul>{all ? items : items.slice(0, initial)}</ul>
      {items.length > initial && (
        <button onClick={() => setAll((v) => !v)} className="mt-1 inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-[16px] text-[14.5px] font-medium text-brand hover:bg-cream">
          {all ? "Show less" : label}
          <ChevronDown className={`size-4 transition-transform ${all ? "rotate-180" : ""}`} />
        </button>
      )}
    </>
  );
}
