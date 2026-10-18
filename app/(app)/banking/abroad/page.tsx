import { getTranslations } from "next-intl/server";
import { getRepository } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { BankingAbroad } from "@/components/banking/banking-abroad";
import { bankingProfileFrom, missingFields } from "@/lib/banking/eligibility";
import { isSupported } from "@/lib/banking/journey";
import type { SupportedCountry } from "@/lib/types";
import { localizeBank, localizeCredit, localizeRequirements } from "@/lib/reference/localize";

export async function generateMetadata() {
  const t = await getTranslations("BankingAbroad");
  return { title: t("metaTitle") };
}

export default async function BankingAbroadPage({ searchParams }: { searchParams: Promise<{ country?: string }> }) {
  const repo = await getRepository();
  const t = await getTranslations("BankingAbroad");
  const sp = await searchParams;
  const [profile, allBanks, allRequirements, allCredit, progress] = await Promise.all([
    repo.getProfile(),
    repo.listBanks(),
    repo.listAccountRequirements(),
    repo.listCreditSystems(),
    repo.listSetupProgress(),
  ]);
  const lang = profile.language;
  const banks = allBanks.map((b) => localizeBank(b, lang));
  const requirements = allRequirements.map((r) => localizeRequirements(r, lang));
  const credit = allCredit.map((c) => localizeCredit(c, lang));
  const country: SupportedCountry = sp.country && isSupported(sp.country) ? sp.country : isSupported(profile.study_country) ? profile.study_country : "GB";
  const missing = missingFields(bankingProfileFrom(profile, { destination: country }));
  const chosen = progress.find((p) => p.country === country && p.step_key.startsWith("bank:") && p.completed)?.step_key.slice(5) ?? null;

  return (
    <div>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />
      <BankingAbroad
        country={country}
        profile={{
          nationality: profile.nationality,
          home_country: profile.home_country,
          study_country: profile.study_country,
          age: profile.age,
          student_status: profile.student_status,
          visa_type: profile.visa_type,
          residency_status: profile.residency_status,
          tax_residency: profile.tax_residency,
        }}
        missing={missing}
        banks={banks.filter((b) => b.country === country)}
        requirements={requirements.find((r) => r.country === country) ?? null}
        credit={credit.find((c) => c.country === country) ?? null}
        chosenBankId={chosen}
      />
    </div>
  );
}
