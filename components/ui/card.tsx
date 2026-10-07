import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "white" | "gold" | "brand" | "peach" | "cream" | "insight";

const TONES: Record<Tone, string> = {
  white: "bg-white",
  gold: "bg-gold-soft",
  brand: "bg-brand-soft",
  peach: "bg-peach-soft",
  cream: "bg-cream",
  insight: "cm-insight",
};

/** Bento card: rounded, soft shadow, no border. Tone picks one of the brand's soft surfaces. */
export function Card({ className, tone = "white", lift, ...props }: React.HTMLAttributes<HTMLElement> & { tone?: Tone; lift?: boolean }) {
  return <section className={cn("rounded-[24px] shadow-card", TONES[tone], lift && "cm-lift", className)} {...props} />;
}

export function CardHeader({ title, description, action, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <header className={cn("flex items-start justify-between gap-4 px-6 pt-5", className)}>
      <div className="min-w-0">
        <h2 className="font-display text-[19px] font-extrabold leading-7 tracking-[-0.03em] text-cocoa">{title}</h2>
        {description ? <p className="mt-0.5 text-[14px] leading-5 text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 py-5", className)} {...props} />;
}
