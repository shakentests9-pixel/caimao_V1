import type { AccountRequirements, BankProduct, CountryRule, CreditSystemInfo } from "../types";
import { VERIFIED_RULES } from "./rules";
import { BANKS } from "./banks";
import { ACCOUNT_REQUIREMENTS } from "./account-requirements";
import { CREDIT_SYSTEMS } from "./credit-systems";

/**
 * Researched reference data for the regulatory assistant and Banking Abroad.
 * Every entry carries its official source URL and the date it was checked.
 * Entries that could not be confirmed on an official page are status "needs_verification"
 * and are presented that way; nothing here is generated at runtime.
 */
export const REFERENCE: {
  rules: CountryRule[];
  banks: BankProduct[];
  accountRequirements: AccountRequirements[];
  creditSystems: CreditSystemInfo[];
} = {
  rules: VERIFIED_RULES,
  banks: BANKS,
  accountRequirements: ACCOUNT_REQUIREMENTS,
  creditSystems: CREDIT_SYSTEMS,
};
