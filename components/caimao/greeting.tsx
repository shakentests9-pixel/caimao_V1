"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

/** Time-of-day greeting in the viewer's own timezone. */
export function Greeting({ firstName }: { firstName: string }) {
  const t = useTranslations("Greeting");
  const [part, setPart] = useState<"hello" | "morning" | "afternoon" | "evening">("hello");
  useEffect(() => {
    const h = new Date().getHours();
    setPart(h < 5 ? "evening" : h < 12 ? "morning" : h < 18 ? "afternoon" : "evening");
  }, []);
  return (
    <h1 className="font-display text-[30px] font-extrabold leading-[1.08] tracking-[-0.05em] text-cocoa sm:text-[40px]">
      {t(part, { name: firstName })}
    </h1>
  );
}
