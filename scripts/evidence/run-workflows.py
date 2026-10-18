"""
Runs CaiMao's four main workflows against a running app (local demo mode) as the demo student,
then saves the JSON evidence export and a short run log.

  npm run dev                      # in another terminal (demo mode, no Supabase)
  python3 scripts/evidence/run-workflows.py docs/execution-evidence [http://localhost:3000]

Requires: pip install requests
"""
import json, os, sys, requests
out = sys.argv[1]; base = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:3000"
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
s = requests.Session()
H = {"origin": base}
def post(path, **kw):
    r = s.post(base + path, headers=H, **kw); r.raise_for_status(); return r
def agent(msgs):
    r = s.post(base + "/api/agent", headers=H, json={"messages": msgs}, stream=True); r.raise_for_status()
    ev = [json.loads(l) for l in r.iter_lines() if l]
    text = "".join(e["text"] for e in ev if e["type"] == "text")
    return ev, text
log = []
post("/api/auth/demo"); post("/api/demo/reset", json={"scenario": "standard"}); post("/api/locale", json={"locale": "en"})

# 1. Statement: upload (with consent) -> preview -> confirm -> analysis
with open(os.path.join(ROOT, "public/samples/caimao-sample-statement.csv"), "rb") as f:
    up = post("/api/statements", files={"file": ("caimao-sample-statement.csv", f, "text/csv")}, data={"consent": "true"}).json()
sid = up["upload"]["id"]
conf = post(f"/api/statements/{sid}/confirm", json={}).json()
an = conf.get("analysis") or {}
log.append(("statement", sid, an.get("totals"), an.get("opportunity"), [i["code"] for i in an.get("insights", [])]))
ev, text = agent([{"role": "user", "content": "Review my statement analysis"}])
log.append(("statement_agent", [e["tool"] for e in ev if e["type"] == "tool_end"], text[:300]))

# 2. Banking: Chinese student -> Singapore: eligibility, banks, plan
ev, text = agent([{"role": "user", "content": "I'm a Chinese student moving to Singapore. How do I set up my finances?"}])
log.append(("banking_agent", [e["tool"] for e in ev if e["type"] == "tool_end"], text[:300]))
g = post("/api/banking/guidance", json={"country": "SG"}).json()
plan = post("/api/setup", json={"country": "SG"}).json()
log.append(("setup_plan", plan["journey"]["completed"], [st["key"] for st in plan["journey"]["steps"]]))

# 3. Rules: China -> Singapore tuition, and an unsupported corridor
r1 = post("/api/regulation/check", json={"source_country": "CN", "destination_country": "SG", "purpose": "education", "amount": 30000, "currency": "USD", "nationality": "CN", "residency_status": "resident", "visa_type": "student"}).json()
r2 = post("/api/regulation/check", json={"source_country": "VN", "destination_country": "JP", "purpose": "education"}).json()
res = lambda r: (r.get("result") or r)
log.append(("rules_cn_sg", res(r1)["status"], [(x.get("regulator"), x.get("url"), x.get("last_verified")) for x in res(r1).get("sources", [])][:3]))
log.append(("rules_vn_jp", res(r2)["status"], res(r2).get("unverified_message") or res(r2).get("notes") or sorted(res(r2).keys())))

# 4. Tuition: compare -> check rules -> prepare -> approve -> execute -> verify
m = [{"role": "user", "content": "Pay my tuition"}]
ev, text = agent(m)
m += [{"role": "assistant", "content": text}, {"role": "user", "content": "Prepare the payment"}]
ev2, text2 = agent(m)
req = next(e["card"]["request"] for e in ev2 if e["type"] == "card" and e["card"]["kind"] == "instruction")
cid = next(e["correlation_id"] for e in ev2 if e["type"] == "meta")
done = post(f"/api/transfers/{req['id']}/confirm", json={"acknowledged": True, "correlation_id": cid}).json()
log.append(("tuition", [e["tool"] for e in ev + ev2 if e["type"] == "tool_end"], req["id"], req["status"], json.dumps(done)[:300]))

exp = s.get(base + "/api/evidence"); exp.raise_for_status()
open(out + "/caimao-evidence-export.json", "w").write(exp.text)
open(out + "/run-log.json", "w").write(json.dumps(log, indent=1, ensure_ascii=False))
d = exp.json()
print("audit events:", len(d["audit_logs"]), "executions:", len(d["executions"]), "statements:", len(d["statements"]))
print(sorted({a["action"] for a in d["audit_logs"]}))
for l in log: print(json.dumps(l, ensure_ascii=False)[:400])
