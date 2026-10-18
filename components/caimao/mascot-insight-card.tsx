import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { MascotTile } from "../brand";
import { cn } from "@/lib/utils";

/**
 * CaiMao speaking as a guide: the mascot, one clear message and a next step.
 * Used where the assistant has something specific to say, never as decoration.
 */
export function MascotInsightCard({
  headline,
  body,
  note,
  actions,
  className,
  layout = "stack",
}: {
  headline: React.ReactNode;
  body?: React.ReactNode;
  note?: React.ReactNode;
  actions?: { href: string; label: string; primary?: boolean }[];
  className?: string;
  layout?: "stack" | "inline";
}) {
  const t = useTranslations("MascotInsightCard");
  return (
    <section className={cn("cm-insight relative flex flex-col rounded-[24px] p-5 sm:p-6", className)} aria-label={t("insight")}>
      <div className="flex gap-3.5">
        <MascotTile size={52} />
        <div className="min-w-0 flex-1">
          <MascotLabel />
          <p className="mt-1 font-display text-[19px] font-extrabold leading-[1.25] tracking-[-0.03em] text-cocoa sm:text-[21px]">{headline}</p>
          {body ? <div className="mt-1.5 text-[15px] leading-6 text-muted">{body}</div> : null}
        </div>
      </div>
      {actions?.length ? (
        <div className={cn("mt-auto flex gap-2 pt-5", layout === "stack" ? "flex-col sm:flex-row" : "flex-wrap")}>
          {actions.map((a) =>
            a.primary ? (
              <Link
                key={a.href + a.label}
                href={a.href}
                className="cm-press cm-cta inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-[16px] px-5 text-[15px] font-extrabold"
              >
                {a.label} <ArrowRight className="size-[18px]" />
              </Link>
            ) : (
              <Link
                key={a.href + a.label}
                href={a.href}
                className="cm-press inline-flex h-12 flex-1 items-center justify-center rounded-[16px] bg-white px-5 text-[15px] font-bold text-cocoa hover:bg-cream"
              >
                {a.label}
              </Link>
            ),
          )}
        </div>
      ) : null}
      {note ? <p className="mt-3 text-[12.5px] leading-5 text-muted">{note}</p> : null}
    </section>
  );
}

/** "CaiMao" label used above assistant messages and insights. */
export function MascotLabel({ className, working }: { className?: string; working?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-[0.1em] text-brand", className)}>
      <span className={cn("size-1.5 rounded-full bg-gold", working && "animate-pulse-soft")} aria-hidden />
      CaiMao
    </span>
  );
}
