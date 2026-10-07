import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface QuickActionItem {
  href: string;
  label: string;
  icon: LucideIcon;
  tone?: "brand" | "gold" | "peach" | "cocoa";
}

const TONES = {
  brand: "bg-brand-soft text-brand",
  gold: "bg-gold-soft text-gold-ink",
  peach: "bg-peach-soft text-peach-ink",
  cocoa: "bg-cocoa text-white",
};

/** Four app-style actions: tile icon, short label. Two columns on small phones. */
export function QuickActionGrid({ items, className }: { items: QuickActionItem[]; className?: string }) {
  return (
    <nav aria-label="Quick actions" className={cn("grid grid-cols-4 gap-2.5 sm:gap-4", className)}>
      {items.map(({ href, label, icon: Icon, tone = "brand" }) => (
        <Link
          key={label}
          href={href}
          className="cm-lift cm-press group flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-[20px] bg-white px-1.5 py-3 text-center shadow-card sm:min-h-[104px] sm:flex-row sm:justify-start sm:gap-3.5 sm:px-5 sm:text-left"
        >
          <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-[15px] transition-transform group-hover:scale-105", TONES[tone])}>
            <Icon className="size-[21px]" />
          </span>
          <span className="text-[12.5px] font-extrabold leading-tight text-cocoa sm:text-[15px]">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
