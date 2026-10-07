import Link from "next/link";
import { MascotTile } from "../brand";
import { cn } from "@/lib/utils";

/** An empty screen as an invitation to act, with CaiMao as a quiet guide. */
export function EmptyState({ title, body, action, className }: { title: string; body?: React.ReactNode; action?: { href: string; label: string }; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center rounded-[24px] bg-white px-6 py-10 text-center shadow-card", className)}>
      <MascotTile size={56} />
      <p className="mt-4 font-display text-[19px] font-extrabold tracking-[-0.02em] text-cocoa">{title}</p>
      {body ? <p className="mt-1.5 max-w-[42ch] text-[14.5px] leading-6 text-muted">{body}</p> : null}
      {action ? (
        <Link href={action.href} className="cm-press cm-cta mt-5 inline-flex h-11 items-center rounded-[14px] px-5 text-[14.5px] font-extrabold">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
