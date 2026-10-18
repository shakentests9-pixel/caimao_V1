import { Check, X } from "lucide-react";
import { useDateLocale } from "@/lib/i18n/date";
import type { AuditLog } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

type AuditTranslator = ReturnType<typeof useTranslations<"AuditActions">>;

/** Plain-language names for the audit actions shown in the timeline (namespace "AuditActions", keyed by action). Unknown actions fall back to the raw action. */
export function friendlyAction(l: AuditLog, firstName: string, t: AuditTranslator): string {
  const key = l.action === "TRANSFER_RULE_CHECK" && l.result === "BLOCKED" ? "TRANSFER_RULE_CHECK_BLOCKED" : l.action;
  return t.has(key) ? t(key, { name: firstName }) : l.action;
}

const time = (iso: string, locale = "en-GB") => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(iso));

/** Vertical, plain-language timeline of one workflow run. The raw log stays available in the technical view. */
export function ActivityTimeline({ logs, firstName }: { logs: AuditLog[]; firstName: string }) {
  const t = useTranslations("ActivityTimeline");
  const ta = useTranslations("AuditActions");
  const dl = useDateLocale();
  if (logs.length === 0) return <p className="mt-3 text-[15px] text-muted">{t("empty")}</p>;
  return (
    <ol className="mt-5">
      {logs.map((l, i) => {
        const ok = l.result === "SUCCESS" && l.action !== "USER_DECLINED";
        const approval = l.action === "USER_APPROVAL";
        return (
          <li key={l.id} className="relative flex gap-4 pb-5 last:pb-0">
            {i < logs.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-24px)] w-[2px] rounded-full bg-sand" aria-hidden />}
            <span className={cn("relative flex size-8 shrink-0 items-center justify-center rounded-full", !ok ? "bg-error-soft text-error-ink" : approval ? "bg-brand text-white" : "bg-success-soft text-success-ink")}>
              {ok ? <Check className="size-4" strokeWidth={3} aria-label={t("done")} /> : <X className="size-4" strokeWidth={3} aria-label={t("stopped")} />}
            </span>
            <div className="min-w-0 pt-0.5">
              <div className="num font-mono text-[12.5px] text-muted">{time(l.timestamp, dl)}</div>
              <div className={cn("text-[15.5px] font-bold", ok ? "text-cocoa" : "text-error-ink")}>{friendlyAction(l, firstName, ta)}</div>
              <div className="mt-0.5 text-[13px] text-muted">
                {l.actor === "user" ? t("you") : "CaiMao"} · {approval ? t("yourApproval") : t("permissionLevel", { level: l.permission_level })}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
