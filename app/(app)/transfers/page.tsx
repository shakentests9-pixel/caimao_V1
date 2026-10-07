import { getRepository } from "@/lib/session";
import { buildQuoteSet, getFxService, listRulesForCorridor } from "@/lib/finance";
import { compareQuotes } from "@/lib/remittance/engine";
import { loadTuitionInsight } from "@/lib/views";
import { COUNTRY_NAMES, CURRENCIES, type CountryCode, type Currency } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { RulesTable } from "@/components/compliance-panel";
import { TransferHistory } from "@/components/transfer-history";
import { StatusBadge } from "@/components/status-badge";
import { RoutePair } from "@/components/country-chip";
import { TransferCalculator } from "@/components/caimao/transfer-calculator";
import { MascotInsightCard } from "@/components/caimao/mascot-insight-card";
import { formatMoney } from "@/lib/fx/service";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Transfers" };

const COUNTRIES = Object.keys(COUNTRY_NAMES) as CountryCode[];

export default async function TransfersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const repo = await getRepository();
  const sp = await searchParams;
  const [profile, obligations, requests, providers, accounts, fx] = await Promise.all([
    repo.getProfile(),
    repo.listObligations(),
    repo.listTransferRequests(),
    repo.listProviders(),
    repo.listAccounts(),
    getFxService(repo),
  ]);
  const insight = await loadTuitionInsight(repo, profile, accounts, obligations, fx);

  const from = (CURRENCIES.includes(sp.from as Currency) ? sp.from : profile.home_currency) as Currency;
  const to = (CURRENCIES.includes(sp.to as Currency) ? sp.to : profile.study_currency) as Currency;
  const amount = Number(sp.amount) > 0 ? Math.min(Number(sp.amount), 10_000_000) : 1000;
  const set = await buildQuoteSet(repo, { source_currency: from, destination_currency: to === from ? profile.study_currency : to, source_amount: amount });
  const cmp = compareQuotes(set.quotes);

  const src = (COUNTRIES.includes(sp.src as CountryCode) ? sp.src : profile.home_country) as CountryCode;
  const dst = (COUNTRIES.includes(sp.dst as CountryCode) ? sp.dst : profile.study_country) as CountryCode;
  const rules = await listRulesForCorridor(repo, src, dst);

  const history = requests.map((r) => {
    const a = accounts.find((x) => x.id === r.source_account_id);
    return {
      request: r,
      provider_name: providers.find((p) => p.id === r.provider_id)?.name ?? r.provider_id,
      account_label: a ? `${a.name} ****${a.account_last4}` : "Account",
      obligation_title: obligations.find((o) => o.id === r.obligation_id)?.title ?? null,
    };
  });

  return (
    <div className="space-y-10">
      <PageHeader title="Send money" description="Transparent routes for your money, before you approve. CaiMao compares providers on what your recipient actually gets." />

      <TransferCalculator
        from={from}
        to={to}
        amount={amount}
        initial={{
          quotes: cmp.quotes,
          delivery_quotes: [],
          best_provider_id: cmp.best?.provider_id ?? null,
          lowest_fee_provider_id: cmp.lowest_advertised_fee?.provider_id ?? null,
          compare_amount: set.compare_amount,
          destination_amount: null,
          explanation: cmp.explanation,
          advantage_vs: cmp.advantage_vs,
          fx_as_of: set.fx_as_of,
          fx_source: set.fx_source,
        }}
        aside={
          insight.state === "due" ? (
            <MascotInsightCard
              headline="Paying tuition? I'll take it from here."
              body={`${formatMoney(insight.obligation.amount, insight.obligation.currency)} to ${insight.obligation.payee.replace(" Treasury", "")}, due in ${insight.days} days. I'll check the rules, pick the best route and get it ready for your approval.`}
              actions={[{ href: "/copilot?q=Pay%20my%20tuition", label: "Pay tuition", primary: true }]}
            />
          ) : insight.state === "paid" ? (
            <MascotInsightCard headline="Tuition paid." body={insight.execution ? `Transaction ${insight.execution.transaction_id} via ${insight.execution.provider}.` : undefined} actions={[{ href: "/evidence", label: "View receipt", primary: true }]} />
          ) : null
        }
      />

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <h2 className="font-display text-[22px] font-extrabold tracking-[-0.04em] text-cocoa">Transfer requirements</h2>
            <p className="text-[14.5px] text-muted">From CaiMao&apos;s rules database. CaiMao can only cite rules listed here.</p>
          </div>
          <StatusBadge status="DEMO_DATA" label="Simulated rules" />
        </div>
        <div className="rounded-[24px] bg-white p-5 shadow-card sm:p-6">
          <form className="mb-5 flex flex-wrap items-end gap-3 text-[14px]" action="/transfers">
            <RoutePair from={src} to={dst} size={36} />
            <label className="flex flex-col gap-1">
              <span className="text-muted">From</span>
              <select name="src" defaultValue={src} className="h-11 rounded-[14px] bg-cream px-4 font-semibold text-cocoa">{COUNTRIES.map((c) => <option key={c} value={c}>{COUNTRY_NAMES[c]}</option>)}</select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted">To</span>
              <select name="dst" defaultValue={dst} className="h-11 rounded-[14px] bg-cream px-4 font-semibold text-cocoa">{COUNTRIES.map((c) => <option key={c} value={c}>{COUNTRY_NAMES[c]}</option>)}</select>
            </label>
            <Button type="submit" variant="ink">Show rules</Button>
          </form>
          <RulesTable rules={rules} />
          <p className="mt-4 text-[13px] leading-5 text-muted">These rules are simulated for the demo and aren&apos;t legal advice. Each one links to the official source to check.</p>
        </div>
      </section>

      <section>
        <h2 className="mb-4 px-1 font-display text-[22px] font-extrabold tracking-[-0.04em] text-cocoa">Your transfers</h2>
        <TransferHistory rows={history} />
      </section>
    </div>
  );
}
