"use client";
import { useEffect, useState } from "react";

/** Time-of-day greeting in the viewer's own timezone. */
export function Greeting({ firstName }: { firstName: string }) {
  const [part, setPart] = useState("Hello");
  useEffect(() => {
    const h = new Date().getHours();
    setPart(h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
  }, []);
  return (
    <h1 className="font-display text-[30px] font-extrabold leading-[1.08] tracking-[-0.05em] text-cocoa sm:text-[40px]">
      {part}, {firstName}
    </h1>
  );
}
