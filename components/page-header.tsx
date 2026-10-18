import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

export function PageHeader({ title, description, action, eyebrow }: { title: string; description?: React.ReactNode; action?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 lg:mb-8">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-2 text-[12px] font-extrabold uppercase tracking-[0.12em] text-muted">{eyebrow}</div> : null}
        <h1 className="font-display text-[30px] font-extrabold leading-[1.08] tracking-[-0.05em] text-cocoa sm:text-[38px]">{title}</h1>
        {description ? <p className="mt-2 max-w-[60ch] text-[15.5px] leading-6 text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  const t = useTranslations("PageHeader");
  return (
    <div className="mb-3 flex items-center justify-between px-1">
      <h2 className="font-display text-[20px] font-extrabold tracking-[-0.03em] text-cocoa">{title}</h2>
      {href ? (
        <Link href={href} className="inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-[14px] font-bold text-brand hover:underline">
          {linkLabel ?? t("seeAll")} <ChevronRight className="size-4" />
        </Link>
      ) : null}
    </div>
  );
}
