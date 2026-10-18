"""
Hand-modelled overrides applied when converting researched JSON into lib/reference/*.ts.

Why overrides exist: the researchers recorded what each official page says. Turning that into
machine-evaluable rules needs a few modelling decisions, made here explicitly and reviewably:
  - enforcement: what the engine does with the rule (block / documents / report / info)
  - channel: border cash rules are guidance, never a check on a bank transfer
  - conditions: nationality / residency / visa codes the engine can match
  - docs: canonical names so they can be matched against the user's documents on file
  - skip: rules that are bank-specific or not about cross-border money
No override changes what a rule SAYS; summaries, sources and quotes are the researchers'.
"""

FOREIGN_TO_CN = ["SG", "GB", "VN", "HK", "US", "JP"]
NON = lambda c: [x for x in ["SG", "GB", "CN", "VN", "HK", "US", "JP"] if x != c]

# Canonical document names (shared with Settings → Documents and the payment review screen).
PASSPORT = "Passport or national ID"
INVOICE = "University invoice"
ADMISSION = "Admission letter"
CAS = "Confirmation of enrolment (CAS)"
SOF = "Source-of-funds declaration"
PURPOSE = "Proof of payment purpose"
INCOME = "Proof of income (tax records)"
RESIDENCE_CARD = "Residence card or local ID"
MY_NUMBER = "Individual Number (My Number)"
VISA = "Student visa or pass"
ADDRESS = "Proof of address"

OVERRIDES = {
    # ── Singapore ──
    "sg-fx-no-exchange-control": {"enforcement": "info"},
    "sg-aml-bank-wire-outbound-small": {"enforcement": "info", "docs": []},
    "sg-aml-bank-wire-outbound-large": {"enforcement": "info", "docs": []},
    "sg-aml-bank-wire-inbound": {"enforcement": "info", "docs": []},
    "sg-aml-psp-wire-thresholds": {"enforcement": "info", "docs": []},
    "sg-aml-psp-cdd-walkin": {"enforcement": "documents_always", "docs": [PASSPORT]},
    "sg-reporting-cash-cbni": {"channel": "cash"},
    "sg-tax-foreign-sourced-income": {"enforcement": "info", "residency": "resident"},
    # ── Japan ──
    "jp-fefta-payment-report-30m": {"enforcement": "report_above", "limit": 30000000, "residency": "resident"},
    "jp-fefta-bank-legality-check": {"enforcement": "info", "docs": []},
    "jp-sanctions-asset-freeze": {"enforcement": "info"},
    "jp-customs-means-of-payment-1m": {"channel": "cash", "enforcement": "report_above", "limit": 1000000},
    "jp-mynumber-overseas-remittance": {"enforcement": "documents_always", "docs": [MY_NUMBER]},
    "jp-bank-identity-verification-remittance": {"enforcement": "documents_always", "docs": [RESIDENCE_CARD]},
    "jp-tuition-remittance-purpose-docs": {"enforcement": "documents_always", "docs": [INVOICE]},
    "jp-fefta-foreigner-residency-6-months": {"enforcement": "info", "nationality": NON("JP")},
    # A single bank's product limit, not a national rule: shown as a consideration only.
    "jp-yucho-intl-remittance-limits": {"enforcement": "info", "applies_to": "Japan Post Bank customers only"},
    "jp-account-sale-prohibited": {"enforcement": "info"},
    "jp-residence-period-update-and-closure": {"enforcement": "info", "nationality": NON("JP")},
    # ── China ──
    "cn-fx-annual-convenience-quota": {"direction": "outbound", "enforcement": "documents_above", "limit": 50000, "nationality": ["CN"], "docs": [PURPOSE]},
    "cn-fx-quota-not-a-cap": {"direction": "outbound", "enforcement": "info", "nationality": ["CN"]},
    "cn-edu-study-abroad-quota-choice": {"enforcement": "info", "nationality": ["CN"]},
    "cn-edu-tuition-above-quota-docs": {"enforcement": "documents_above", "limit": 50000, "nationality": ["CN"], "docs": [PASSPORT, INVOICE]},
    "cn-edu-boc-self-funded-study-docs": {"enforcement": "info", "nationality": ["CN"], "applies_to": "Bank of China's checklist; other banks may ask for similar documents"},
    "cn-fx-prohibited-uses": {"enforcement": "info", "nationality": ["CN"]},
    "cn-fx-purchase-purpose-categories": {"enforcement": "info", "nationality": ["CN"]},
    "cn-aml-structuring-watch-list": {"enforcement": "info"},
    "cn-outward-remittance-domestic-daily": {"enforcement": "documents_above", "limit": 50000, "nationality": ["CN"], "docs": [PURPOSE]},
    "cn-fx-account-domestic-transfer": {"skip": "domestic only, not a cross-border rule"},
    "cn-inbound-receipt-and-settlement": {"enforcement": "documents_above", "limit": 50000, "nationality": ["CN"], "docs": [SOF]},
    "cn-foreigner-no-purchase-quota": {"enforcement": "documents_always", "nationality": FOREIGN_TO_CN, "docs": [PASSPORT, INCOME]},
    "cn-foreigner-fx-account-remit-out": {"enforcement": "info", "nationality": FOREIGN_TO_CN},
    "cn-foreigner-salary-purchase": {"enforcement": "documents_always", "nationality": FOREIGN_TO_CN, "docs": [PASSPORT, INCOME]},
    "cn-foreigner-unused-rmb-reconvert": {"enforcement": "info", "nationality": FOREIGN_TO_CN},
    "cn-foreign-student-settle-for-tuition": {"enforcement": "documents_above", "limit": 50000, "nationality": FOREIGN_TO_CN, "docs": [PASSPORT, INVOICE]},
    "cn-fx-cash-withdrawal-report": {"channel": "cash"},
    "cn-cash-export-foreign-currency": {"channel": "cash", "enforcement": "documents_above", "limit": 5000},
    "cn-cash-import-declaration": {"channel": "cash"},
    "cn-rmb-cash-limit": {"channel": "cash", "enforcement": "info"},
    "cn-aml-large-value-report": {"enforcement": "report_above", "limit": 10000},
    "cn-foreigner-mobile-payment-limits": {"enforcement": "info", "applies_to": "Overseas visitors paying through mobile payment apps"},
}
