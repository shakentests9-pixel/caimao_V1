"use client";
import { useState } from "react";
import { CheckCircle2, ChevronDown, CircleAlert, CircleX, ExternalLink, FileCheck2, FileWarning, Info } from "lucide-react";
import * as Collapsible from "@radix-ui/react-collapsible";
import type { ComplianceResult, CountryRule } from "@/lib/types";
import { COUNTRY_NAMES } from "@/lib/types";
import { ComplianceBadge, StatusBadge } from "./status-badge";
import { RoutePair } from "./country-chip";
import { cn, formatDate } from "@/lib/utils";

const OUTCOME = {
  PASS: { Icon: CheckCircle2, cls: "text-success-ink", label: "Passed" },
  DOCUMENTS: { Icon: CircleAlert, cls: "text-warning-ink", label: "Documents needed" },
  BLOCK: { Icon: CircleX, cls: "text-error-ink", label: "Blocked" },
  INFO: { Icon: Info, cls: "text-muted", label: "For information" },
};

function SourceLine({ rule }: { rule: CountryRule }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
      <span>
        Source:{" "}
        <a href={rule.official_source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-bold text-cocoa-2 underline decoration-sand underline-offset-2 hover:text-brand">
          {rule.official_source}
          <ExternalLink className="size-3" />
        </a>
      </span>
      <span>Last verified {formatDate(rule.last_verified)}</span>
      {rule.is_demo && <StatusBadge status="DEMO_DATA" label="Simulated rule" size="sm" />}
    </div>
  );
}

/** Rule-by-rule detail, used inside the expandable section. */
export function CompliancePanel({ result }: { result: ComplianceResult }) {
  return (
    <div>
      {result.coverage === "no_rules" && (
        <p className="mb-2 rounded-[14px] bg-warning-soft px-3 py-2 text-[13.5px] text-warning-ink">No rules are on record for this corridor, so CaiMao can't clear it.</p>
      )}
      <ul className="space-y-2">
        {result.evaluations.map((e) => {
          const o = OUTCOME[e.outcome];
          return (
            <li key={e.rule.id} className="flex gap-3 rounded-[16px] bg-cream px-4 py-3">
              <o.Icon className={cn("mt-0.5 size-[18px] shrink-0", o.cls)} aria-label={o.label} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className={cn("text-[14.5px] font-bold", e.outcome === "BLOCK" ? "text-error-ink" : "text-cocoa")}>{e.rule.rule_name}</span>
                  <span className="text-[12px] text-muted">{e.rule.risk_level.toLowerCase()} risk</span>
                </div>
                <p className="text-[13.5px] leading-5 text-cocoa-2">{e.message}</p>
                <SourceLine rule={e.rule} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function DocumentList({ docs }: { docs: { name: string; on_file: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {docs.map((d) => (
        <li key={d.name} className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px]", d.on_file ? "bg-success-soft text-success-ink" : "bg-warning-soft text-warning-ink")}>
          {d.on_file ? <FileCheck2 className="size-3.5" /> : <FileWarning className="size-3.5" />}
          {d.name}
          <span className="sr-only">{d.on_file ? "(on file)" : "(missing)"}</span>
        </li>
      ))}
    </ul>
  );
}

/** Friendly summary of a compliance check, with the rules one tap away. */
export function ComplianceCard({ result, defaultOpen = false }: { result: ComplianceResult; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const passed = result.evaluations.filter((e) => e.outcome === "PASS" || e.outcome === "INFO").length;
  const missing = result.required_documents.filter((d) => !d.on_file);
  const title =
    result.status === "COMPLIANT" ? "Transfer requirements checked" : result.status === "BLOCKED" ? "This transfer can't go ahead" : "A few things are needed first";
  return (
    <div className={cn("rounded-[22px] p-5", result.status === "COMPLIANT" ? "bg-white shadow-card" : result.status === "BLOCKED" ? "bg-error-soft" : "bg-warning-soft")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RoutePair from={result.source_country} to={result.destination_country} />
        <ComplianceBadge status={result.status} />
      </div>
      <p className="mt-4 font-display text-[18px] font-extrabold text-cocoa">{title}</p>
      <ul className="mt-2 space-y-1 text-[14px] text-cocoa-2">
        <li className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-success-ink" aria-hidden /> {passed} of {result.evaluations.length} rules passed for {COUNTRY_NAMES[result.source_country]} → {COUNTRY_NAMES[result.destination_country]}
        </li>
        {result.required_documents.length > 0 && (
          <li className="flex items-center gap-2">
            {missing.length ? <FileWarning className="size-4 text-warning-ink" aria-hidden /> : <FileCheck2 className="size-4 text-success-ink" aria-hidden />}
            {missing.length ? `Missing: ${missing.map((m) => m.name).join(", ")}` : `Documents complete (${result.required_documents.length})`}
          </li>
        )}
      </ul>
      <Collapsible.Root open={open} onOpenChange={setOpen} className="mt-3">
        <Collapsible.Trigger className="inline-flex min-h-11 items-center gap-1.5 rounded-full text-[14px] font-medium text-brand hover:underline">
          {open ? "Hide the rules" : "Show the rules checked"}
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </Collapsible.Trigger>
        <Collapsible.Content className="mt-1 space-y-3 data-[state=open]:animate-rise">
          <CompliancePanel result={result} />
          {result.required_documents.length > 0 && <DocumentList docs={result.required_documents} />}
        </Collapsible.Content>
      </Collapsible.Root>
    </div>
  );
}

export function RulesTable({ rules }: { rules: CountryRule[] }) {
  if (!rules.length) return <p className="text-[14px] text-muted">No rules on record for this corridor.</p>;
  return (
    <ul className="space-y-2">
      {rules.map((r) => (
        <li key={r.id} className="rounded-[18px] bg-cream px-4 py-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-[15px] font-bold text-cocoa">{r.rule_name}</span>
            <span className="text-[12.5px] text-muted">
              {r.source_country === "*" ? "Any" : r.source_country} → {r.destination_country === "*" ? "Any" : r.destination_country} · {r.transaction_type} · {r.risk_level.toLowerCase()} risk
            </span>
          </div>
          <p className="mt-1 text-[14px] leading-6 text-cocoa-2">{r.rule_description}</p>
          {r.documentation_required.length > 0 && <p className="mt-1 text-[13px] text-muted">Documents: {r.documentation_required.join(", ")}</p>}
          <SourceLine rule={r} />
        </li>
      ))}
    </ul>
  );
}
