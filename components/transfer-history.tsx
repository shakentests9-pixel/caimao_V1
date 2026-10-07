"use client";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type { TransferRequest } from "@/lib/types";
import { Money } from "./money";
import { StatusBadge } from "./status-badge";
import { Button } from "./ui/button";
import { CurrencyChip } from "./country-chip";
import { ConfirmTransferDialog, type ConfirmTarget } from "./confirm-transfer";
import { EmptyState } from "./caimao/empty-state";
import { formatDateTime } from "@/lib/utils";

export function TransferHistory({ rows }: { rows: { request: TransferRequest; provider_name: string; account_label: string; obligation_title: string | null }[] }) {
  const [target, setTarget] = useState<ConfirmTarget | null>(null);
  if (!rows.length) return <EmptyState title="No transfers yet" body="When CaiMao prepares a transfer for you, it shows up here." />;
  return (
    <>
      <ul className="space-y-3">
        {rows.map(({ request: r, ...rest }) => {
          const expired = r.status === "PENDING_APPROVAL" && new Date(r.expires_at).getTime() < Date.now();
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-4 rounded-[22px] bg-white p-4 shadow-card sm:p-5">
              <span className="flex -space-x-2" aria-hidden>
                <CurrencyChip currency={r.source_currency} size={38} ring />
                <CurrencyChip currency={r.destination_currency} size={38} ring />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15.5px] font-extrabold text-cocoa">{rest.obligation_title ?? r.purpose}</div>
                <div className="truncate text-[13px] text-muted">
                  {rest.provider_name} · {formatDateTime(r.created_at)}
                </div>
              </div>
              <div className="flex items-center gap-2 text-[14.5px]">
                <Money amount={r.source_amount} currency={r.source_currency} className="text-cocoa-2" />
                <ArrowRight className="size-4 text-faint" aria-hidden />
                <Money amount={r.destination_amount} currency={r.destination_currency} className="font-extrabold text-brand" />
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={expired ? "CANCELLED" : r.status} label={expired ? "Expired" : undefined} size="sm" />
                {r.status === "PENDING_APPROVAL" && !expired ? (
                  <Button size="sm" onClick={() => setTarget({ request: r, ...rest })}>Review</Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <ConfirmTransferDialog target={target} open={Boolean(target)} onOpenChange={(o) => !o && setTarget(null)} />
    </>
  );
}
