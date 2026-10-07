"use client";
import { useEffect, useState } from "react";
import { SplashScreen } from "@/components/caimao/splash-screen";
import { IntroScreen } from "@/components/caimao/intro-screen";

/** Launch: splash for a moment, then the first-time intro. Shorter when motion is reduced. */
export function WelcomeFlow({ mode }: { mode: "memory" | "supabase" }) {
  const [stage, setStage] = useState<"splash" | "leaving" | "intro">("splash");
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const hold = reduce ? 600 : 1500;
    const t1 = setTimeout(() => setStage("leaving"), hold);
    const t2 = setTimeout(() => setStage("intro"), hold + 450);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
  return (
    <>
      {stage !== "splash" && <IntroScreen mode={mode} />}
      {stage !== "intro" && <SplashScreen leaving={stage === "leaving"} />}
    </>
  );
}
