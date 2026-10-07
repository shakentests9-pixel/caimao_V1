import { cn } from "@/lib/utils";

/** A titled group of settings on a white rounded card. */
export function SettingsSection({ id, title, description, children, className }: { id: string; title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={cn("scroll-mt-24 rounded-[24px] bg-white p-5 shadow-card sm:p-7", className)}>
      <h2 id={`${id}-h`} className="font-display text-[20px] font-extrabold tracking-[-0.03em] text-cocoa">{title}</h2>
      {description ? <p className="mt-1 text-[14.5px] text-muted">{description}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}
