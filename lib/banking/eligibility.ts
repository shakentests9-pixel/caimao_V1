import type { BankProduct, CountryCode, Profile, ResidencyStatus, StudentStatus, SupportedCountry, VisaType } from "../types";
import { SUPPORTED_COUNTRIES } from "../types";

/**
 * Bank eligibility guidance. Deliberately conservative:
 *  - it only uses what each bank states on its own site (fields in the banks table);
 *  - it never says "eligible", only "likely eligible", "check with the bank" or "not available";
 *  - if the details eligibility depends on are missing, it asks for them instead of guessing.
 * Banks make the final decision, and requirements can vary by branch and by customer.
 */

export interface BankingProfile {
  nationality: CountryCode | null;
  current_country: CountryCode | null;
  destination: SupportedCountry | null;
  age: number | null;
  student_status: StudentStatus | null;
  visa_type: VisaType | null;
  residency_status: ResidencyStatus | null;
  tax_residency: CountryCode | null;
}

export type ProfileField = "nationality" | "destination" | "age" | "student_status" | "visa_type" | "residency_status";

/** Without these, CaiMao asks before giving any eligibility guidance. */
export const REQUIRED_FIELDS: ProfileField[] = ["nationality", "destination", "age", "student_status", "visa_type", "residency_status"];

export type EligibilityVerdict = "likely_eligible" | "check_with_bank" | "not_available" | "need_info";
export type ReasonCode =
  | "student_account_for_international"
  | "accepts_international_students"
  | "not_for_international_students"
  | "under_minimum_age"
  | "resident_required"
  | "local_citizen"
  | "visa_requirement"
  | "unconfirmed"
  | "varies_by_branch"
  | "missing_details";

export interface BankEligibility {
  bank: BankProduct;
  verdict: EligibilityVerdict;
  reasons: { code: ReasonCode; params?: Record<string, string | number> }[];
}

export interface EligibilityResult {
  destination: SupportedCountry | null;
  missing: ProfileField[];
  banks: BankEligibility[];
  /** Always shown with results. */
  disclaimer: "bank_decides";
}

export function bankingProfileFrom(profile: Profile, override: Partial<BankingProfile> = {}): BankingProfile {
  const study = profile.study_country;
  return {
    nationality: profile.nationality,
    current_country: profile.home_country,
    destination: (SUPPORTED_COUNTRIES as readonly string[]).includes(study) ? (study as SupportedCountry) : null,
    age: profile.age,
    student_status: profile.student_status,
    visa_type: profile.visa_type,
    residency_status: profile.residency_status,
    tax_residency: profile.tax_residency,
    ...override,
  };
}

export function missingFields(p: BankingProfile): ProfileField[] {
  return REQUIRED_FIELDS.filter((f) => p[f] == null);
}

export function checkEligibility(banks: BankProduct[], p: BankingProfile): EligibilityResult {
  const missing = missingFields(p);
  const list = p.destination ? banks.filter((b) => b.country === p.destination) : [];
  if (missing.length) {
    return {
      destination: p.destination,
      missing,
      banks: list.map((bank) => ({ bank, verdict: "need_info", reasons: [{ code: "missing_details", params: { fields: missing.join(",") } }] })),
      disclaimer: "bank_decides",
    };
  }

  const isLocal = p.nationality === p.destination || p.visa_type === "citizen";
  const isStudent = p.student_status !== "not_student";
  const out: BankEligibility[] = list.map((bank) => {
    const reasons: BankEligibility["reasons"] = [];
    if (bank.minimum_age != null && p.age! < bank.minimum_age) {
      return { bank, verdict: "not_available", reasons: [{ code: "under_minimum_age", params: { age: bank.minimum_age } }] };
    }
    if (bank.resident_required === true && p.residency_status === "non_resident") {
      return { bank, verdict: "not_available", reasons: [{ code: "resident_required" }] };
    }
    if (isLocal) {
      reasons.push({ code: "local_citizen" });
      return { bank, verdict: bank.status === "verified" ? "likely_eligible" : "check_with_bank", reasons: bank.status === "verified" ? reasons : [...reasons, { code: "unconfirmed" }] };
    }
    if (bank.international_student_eligible === false) {
      return { bank, verdict: "not_available", reasons: [{ code: "not_for_international_students" }] };
    }
    if (bank.visa_requirements) reasons.push({ code: "visa_requirement" });
    if (bank.status !== "verified" || bank.international_student_eligible == null) {
      reasons.push({ code: "unconfirmed" });
      return { bank, verdict: "check_with_bank", reasons };
    }
    if (!isStudent || p.visa_type !== "student") {
      reasons.push({ code: "varies_by_branch" });
      return { bank, verdict: "check_with_bank", reasons };
    }
    reasons.unshift({ code: bank.student_account_available ? "student_account_for_international" : "accepts_international_students" });
    reasons.push({ code: "varies_by_branch" });
    return { bank, verdict: "likely_eligible", reasons };
  });

  const order: Record<EligibilityVerdict, number> = { likely_eligible: 0, check_with_bank: 1, need_info: 2, not_available: 3 };
  out.sort((a, b) => order[a.verdict] - order[b.verdict] || a.bank.bank_name.localeCompare(b.bank.bank_name));
  return { destination: p.destination, missing: [], banks: out, disclaimer: "bank_decides" };
}
