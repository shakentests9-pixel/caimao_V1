"use client";
import { useTranslations } from "next-intl";
import { ArrowRight, CalendarDays, Coins, Download, EyeOff, FileText, Scale, Store, UserX } from "lucide-react";

const PDF = "/samples/caimao-sample-statement.pdf";
const CSV = "/samples/caimao-sample-statement.csv";
const IMAGE = "/samples/caimao-sample-statement-preview.webp";

/**
 * An example of what a bank statement looks like and what CaiMao takes from it.
 * The statement is CaiMao's own fictional sample (the same file "Try the sample statement" uses).
 */
export function SampleStatementPreview() {
  const t = useTranslations("StatementPage.sample");
  const reads = [
    { Icon: CalendarDays, text: t("reads.date") },
    { Icon: Store, text: t("reads.details") },
    { Icon: Coins, text: t("reads.amounts") },
    { Icon: Scale, text: t("reads.balance") },
  ];
  const leaves = [
    { Icon: UserX, text: t("leaves.name") },
    { Icon: EyeOff, text: t("leaves.numbers") },
  ];

  return (
    <section aria-labelledby="sample-title" className="rounded-[28px] bg-white p-5 shadow-card sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="sample-title" className="font-display text-[22px] font-extrabold tracking-[-0.03em] text-cocoa">{t("title")}</h2>
          <p className="mt-1 max-w-[60ch] text-[15px] text-muted">{t("body")}</p>
        </div>
        <span className="rounded-full bg-gold-soft px-3 py-1 text-[12.5px] font-bold text-gold-ink">{t("badge")}</span>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
        {/* The statement itself: a sheet of paper, cut off with a fade; tap to open the full PDF. */}
        <a
          href={PDF}
          target="_blank"
          rel="noopener"
          className="group relative block overflow-hidden rounded-[18px] border border-line bg-[#f3efe9] p-2.5 sm:p-3.5"
          aria-label={t("openPdf")}
        >
          <div className="relative max-h-[340px] overflow-hidden rounded-[6px] bg-white shadow-[0_10px_28px_rgba(58,33,23,.14)] sm:max-h-[420px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={IMAGE} alt={t("imageAlt")} width={1200} height={1300} loading="lazy" decoding="async" className="block h-auto w-full" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white to-transparent" aria-hidden />
          </div>
          <span className="absolute bottom-5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-cocoa px-4 py-2 text-[13px] font-bold text-white shadow-card transition-transform group-hover:-translate-y-0.5">
            <FileText className="size-4" aria-hidden /> {t("openPdf")}
          </span>
        </a>

        <div className="space-y-4">
          <div>
            <h3 className="text-[15px] font-extrabold text-cocoa">{t("readsTitle")}</h3>
            <ul className="mt-2 space-y-2">
              {reads.map(({ Icon, text }) => (
                <li key={text} className="flex items-start gap-3 rounded-[14px] bg-cream px-3.5 py-2.5 text-[14px] leading-5 text-cocoa-2">
                  <Icon className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-[15px] font-extrabold text-cocoa">{t("leavesTitle")}</h3>
            <ul className="mt-2 space-y-2">
              {leaves.map(({ Icon, text }) => (
                <li key={text} className="flex items-start gap-3 rounded-[14px] border border-line px-3.5 py-2.5 text-[14px] leading-5 text-cocoa-2">
                  <Icon className="mt-0.5 size-4 shrink-0 text-success-ink" aria-hidden />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[13.5px] leading-5 text-muted">{t("formatsNote")}</p>
          <div className="flex flex-wrap gap-2">
            <a href={PDF} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-1.5 rounded-[14px] bg-cream px-4 text-[14px] font-bold text-cocoa hover:bg-sand">
              {t("openPdf")} <ArrowRight className="size-4" aria-hidden />
            </a>
            <a href={CSV} download className="inline-flex min-h-11 items-center gap-1.5 rounded-[14px] px-4 text-[14px] font-bold text-brand hover:bg-brand-soft">
              <Download className="size-4" aria-hidden /> {t("downloadCsv")}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
