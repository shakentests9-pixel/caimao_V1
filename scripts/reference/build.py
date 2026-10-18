"""
Builds lib/reference/{rules,banks,account-requirements,credit-systems}.ts from the researched
JSON in data/reference-research/*.json plus the modelling decisions in overrides.py.
Run:  python3 scripts/reference/build.py
"""
import json, glob, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from overrides import OVERRIDES

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CURRENCIES = {"USD", "GBP", "SGD", "CNY", "HKD", "VND", "JPY"}
ENFORCEMENTS = {"block_above", "documents_above", "documents_always", "report_above", "info"}

def risk(enf, channel):
    if channel == "cash": return "LOW"
    return {"block_above": "HIGH", "documents_above": "MEDIUM", "documents_always": "MEDIUM", "report_above": "MEDIUM"}.get(enf, "LOW")

def applies_to(r, o):
    if o.get("applies_to"): return o["applies_to"]
    parts = [r.get("nationality_condition"), r.get("residency_condition"), r.get("visa_condition")]
    parts = [p for p in parts if p]
    return "; ".join(parts) or None

def expand(country, r):
    """'* → *' and 'both' rules apply to the country in either direction: split into two rows."""
    src, dst, d = r["source_country"], r["destination_country"], r["direction"]
    if src == "*" and dst == "*":
        if d == "outbound": return [(country, "*", "outbound", "")]
        if d == "inbound": return [("*", country, "inbound", "")]
        return [(country, "*", "outbound", "-out"), ("*", country, "inbound", "-in")]
    if src == dst: return [(src, dst, d, "")]
    return [(src, dst, d, "")]

rules, banks, reqs, credit, skipped = [], [], [], [], []
for f in sorted(glob.glob(os.path.join(ROOT, "data/reference-research/*.json"))):
    d = json.load(open(f))
    c, verified_on = d["country"], d["researched_on"]
    for r in d["transfer_rules"]:
        o = OVERRIDES.get(r["id"], {})
        if o.get("skip"):
            skipped.append((r["id"], o["skip"])); continue
        enf = o.get("enforcement", r["enforcement"])
        assert enf in ENFORCEMENTS, (r["id"], enf)
        channel = o.get("channel", "bank_transfer")
        cur = r.get("currency") if r.get("currency") in CURRENCIES else None
        limit = o.get("limit", r.get("maximum_amount") if r.get("maximum_amount") is not None else r.get("minimum_amount"))
        if enf in ("block_above", "documents_above", "report_above") and limit is None:
            enf = "info"  # a threshold rule without a stated threshold can only be shown, not evaluated
        docs = o.get("docs", r.get("documents_required") or [])
        for src, dst, direction, suffix in expand(c, {**r, "direction": o.get("direction", r["direction"])}):
            rules.append({
                "id": r["id"] + suffix,
                "source_country": src,
                "destination_country": dst,
                "transaction_type": r["transaction_purpose"],
                "rule_name": r["rule_name"],
                "rule_description": r["rule_summary"],
                "currency": cur,
                "limit_amount": limit,
                "enforcement": enf,
                "documentation_required": docs if enf.startswith("documents") else [],
                "official_source": r["regulator"],
                "official_source_url": r["official_source_url"],
                "effective_date": r.get("effective_date"),
                "last_verified": verified_on,
                "risk_level": risk(enf, channel),
                "is_demo": False,
                "status": "verified" if r["confidence"] == "verified" else "needs_verification",
                "rule_category": r["rule_category"],
                "direction": direction,
                "channel": channel,
                "nationality_condition": o.get("nationality"),
                "residency_condition": o.get("residency"),
                "visa_condition": o.get("visa"),
                "applies_to": applies_to(r, o),
                "minimum_amount": r.get("minimum_amount"),
                "maximum_amount": r.get("maximum_amount"),
                "restrictions": r.get("restrictions"),
                "exceptions": r.get("exceptions"),
                "regulator": r["regulator"],
                "evidence_quote": r.get("evidence_quote"),
                "source_documents": r.get("documents_required") or [],
            })
    for i, b in enumerate(d["banks"]):
        slug = "".join(ch if ch.isalnum() else "-" for ch in b["bank_name"].lower()).strip("-")
        while "--" in slug: slug = slug.replace("--", "-")
        banks.append({
            "id": f"{c.lower()}-{slug}",
            "country": c,
            **{k: b.get(k) for k in ["bank_name", "account_type", "student_account_available", "international_student_eligible", "resident_required", "minimum_age", "visa_requirements", "minimum_balance", "monthly_fee", "international_transfer_support", "credit_card_available", "official_url", "evidence_quote", "notes"]},
            "documents": b.get("documents") or [],
            "last_verified": verified_on,
            "status": "verified" if b["confidence"] == "verified" else "needs_verification",
        })
    ao = d["account_opening"]
    reqs.append({"country": c, "summary": ao["summary"], "typical_documents": ao.get("typical_documents") or [], "eligibility_factors": ao.get("eligibility_factors") or [], "sources": ao.get("sources") or [], "last_verified": verified_on})
    cs = d["credit_system"]
    credit.append({"country": c, **{k: cs.get(k) for k in ["has_formal_bureau", "foreigner_notes"]}, **{k: cs.get(k) or [] for k in ["bureaus", "what_contributes", "why_it_matters", "responsible_behaviours", "risks", "sources"]}, "last_verified": verified_on})

# Optional translations produced separately (data/reference-research/i18n.json): { id: { "zh-CN": {name, summary}, "ja": {...} } }
i18n_path = os.path.join(ROOT, "data/reference-research/i18n.json")
if os.path.exists(i18n_path):
    tr = json.load(open(i18n_path))
    for r in rules:
        base = r["id"].removesuffix("-out").removesuffix("-in")
        if base in tr.get("rules", {}): r["i18n"] = tr["rules"][base]
    for q in reqs:
        if q["country"] in tr.get("requirements", {}): q["i18n"] = tr["requirements"][q["country"]]

def emit(name, typ, const, rows, note):
    body = json.dumps(rows, ensure_ascii=False, indent=2)
    open(os.path.join(ROOT, f"lib/reference/{name}.ts"), "w").write(
        f'// GENERATED by scripts/reference/build.py from data/reference-research/*.json. Do not edit by hand.\n// {note}\nimport type {{ {typ} }} from "../types";\n\nexport const {const}: {typ}[] = {body} as {typ}[];\n'
    )

for r in rules: r.pop("source_documents", None)
emit("rules", "CountryRule", "VERIFIED_RULES", rules, "Researched cross-border rules. status=verified means confirmed on the official page cited.")
emit("banks", "BankProduct", "BANKS", banks, "Bank offers as stated on each bank's own website. null = not confirmed.")
emit("account-requirements", "AccountRequirements", "ACCOUNT_REQUIREMENTS", reqs, "Country-level account-opening guidance.")
emit("credit-systems", "CreditSystemInfo", "CREDIT_SYSTEMS", credit, "Credit reporting systems.")
print(f"rules {len(rules)} (verified {sum(r['status']=='verified' for r in rules)}), banks {len(banks)}, requirements {len(reqs)}, credit {len(credit)}")
for s in skipped: print("skipped", *s)
missing = [r["id"] for r in rules if r["id"].split("-out")[0].split("-in")[0] not in OVERRIDES]
