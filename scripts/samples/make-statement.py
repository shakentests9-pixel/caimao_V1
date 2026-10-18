"""
Generates a FICTIONAL sample bank statement (CSV + text PDF) for demos and tests.
Three months for a student in the UK: rent, groceries, eating out that rises in the last month,
subscriptions, transport, part-time pay and family support, plus one unusual purchase.
Run: python3 scripts/samples/make-statement.py
"""
import csv, os, random, datetime as dt
random.seed(7)
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
rows = []
def add(d, desc, amt, ref=""):
    rows.append((d, desc, round(amt, 2), ref))

for m, (y, mo) in enumerate([(2026, 7), (2026, 8), (2026, 9)]):
    D = lambda day: dt.date(y, mo, day)
    add(D(1), "STANDING ORDER NORTHGATE STUDENT LIVING RENT", -850.00, "SO-RENT")
    add(D(2), "FASTER PAYMENT FROM TAN FAMILY SUPPORT", 900.00)
    add(D(28), "EXAMPLE UNIVERSITY PAYROLL", 640.00 if m != 1 else 512.00)
    add(D(5), "DD SPOTIFY P1A2B3C4", -11.99)
    add(D(9), "NETFLIX.COM 866-579-7172", -10.99)
    add(D(12), "APPLE.COM/BILL ITUNES.COM", -2.99)
    add(D(15), "DD GIFFGAFF MOBILE PLAN", -10.00)
    add(D(20), "AMAZON PRIME*2K4L9", -8.99)
    add(D(3), "PUREGYM LTD MEMBERSHIP", -24.99)
    for wk in range(4):
        add(D(4 + 7 * wk), f"CARD PAYMENT TESCO STORES {2800 + wk}", -round(random.uniform(38, 58), 2))
        add(D(6 + 7 * wk), "CONTACTLESS STAGECOACH BUS", -round(random.uniform(9, 13), 2))
        add(D(7 + 7 * wk), "PRET A MANGER 4410 LONDON", -round(random.uniform(6, 11), 2))
    eat = 3 if m < 2 else 9  # eating out rises in the latest month
    for i in range(eat):
        add(D(min(27, 2 + i * 3)), random.choice(["DELIVEROO ORDER", "UBER EATS UK", "NANDOS MANCHESTER", "WAGAMAMA 221"]), -round(random.uniform(14, 29), 2))
    add(D(18), "TRAINLINE.COM TICKETS", -round(random.uniform(20, 45), 2))
    add(D(22), "BOOTS 1123", -round(random.uniform(6, 18), 2))
    add(D(24), "ODEON CINEMAS", -12.50)
    if m == 2:
        add(D(14), "CARD PAYMENT CURRYS PC WORLD 0291 LAPTOP", -649.00)
        add(D(16), "MONTHLY ACCOUNT FEE", -3.00)
    add(D(26), "TFR TO SAVINGS 40329981", -50.00)

rows.sort(key=lambda r: r[0])
bal = 1450.00
out = []
for d, desc, amt, ref in rows:
    bal = round(bal + amt, 2)
    out.append((d, desc, amt, ref, bal))

csv_path = os.path.join(ROOT, "public/samples/caimao-sample-statement.csv")
with open(csv_path, "w", newline="") as f:
    f.write("SAMPLE STATEMENT - FICTIONAL DATA FOR DEMONSTRATION\n")
    f.write("Account,UK Bank Student Current Account,Account number,12347730\n")
    f.write("Currency,GBP\n\n")
    w = csv.writer(f)
    w.writerow(["Date", "Description", "Paid out", "Paid in", "Balance"])
    for d, desc, amt, ref, b in out:
        w.writerow([d.strftime("%d/%m/%Y"), desc, f"{-amt:.2f}" if amt < 0 else "", f"{amt:.2f}" if amt > 0 else "", f"{b:.2f}"])

# A realistic layout (bank header, customer block, account summary, payment-type column,
# separate Paid out / Paid in columns) so the parser is exercised on what real statements
# look like. The bank, person, address and account numbers are all fictional.
def ptype(desc, amt):
    d = desc.upper()
    if d.startswith("STANDING ORDER"): return "SO"
    if d.startswith("DD "): return "DD"
    if d.startswith("FASTER PAYMENT") or d.endswith("PAYROLL"): return "CR"
    if d.startswith("TFR"): return "TFR"
    if d.startswith(("CARD PAYMENT", "CONTACTLESS")): return "VIS"
    if "FEE" in d: return "DR"
    return "BP" if amt < 0 else "CR"
def strip_code(desc):
    for p in ("STANDING ORDER ", "DD ", "CARD PAYMENT ", "CONTACTLESS ", "FASTER PAYMENT "):
        if desc.startswith(p): return desc[len(p):]
    return desc
money = lambda v: f"{v:,.2f}"
paid_in = sum(a for _, _, a, _, _ in out if a > 0)
paid_out = -sum(a for _, _, a, _, _ in out if a < 0)
CSS = """
*{box-sizing:border-box} body{margin:0;font-family:Georgia,'Times New Roman',serif;color:#1f2933;font-size:10.5px}
.page{padding:28px 34px;position:relative}
.wm{position:absolute;top:300px;left:60px;font:700 64px Helvetica,Arial;color:rgba(168,74,26,.07);transform:rotate(-24deg);letter-spacing:6px}
.top{display:flex;justify-content:space-between;align-items:flex-start}
.brand{display:flex;align-items:center;gap:10px;font:700 26px Helvetica,Arial;color:#243b53;letter-spacing:-.5px}
.mark{width:34px;height:34px;border-radius:8px;background:linear-gradient(135deg,#2f6f73,#1f4e5a);display:flex;align-items:center;justify-content:center;color:#fff;font:800 15px Helvetica,Arial}
.contact{text-align:right;font-size:9.5px;line-height:1.5;color:#52606d}
.title{color:#b23a2a;font-size:17px;margin-top:6px}
.mid{display:flex;justify-content:space-between;margin-top:22px;gap:24px}
.addr{font-weight:700;font-size:12px;line-height:1.45}
.sample{display:inline-block;margin-top:10px;font:700 9px Helvetica,Arial;letter-spacing:1.2px;color:#8a5300;background:#fdebcb;border-radius:4px;padding:3px 7px}
.summary{width:270px;border-collapse:collapse;background:#eef1f4}
.summary th{text-align:left;font-size:12px;padding:5px 8px;border-bottom:1px solid #9aa5b1}
.summary td{padding:3px 8px;border-bottom:1px solid #d9e2ec}.summary td.n{text-align:right}
.meta{display:flex;justify-content:space-between;margin-top:18px;gap:24px}
.meta b{display:block;font-size:11.5px}.meta span{font-size:11px}
.acct{display:grid;grid-template-columns:auto auto auto;gap:2px 18px;font-size:10.5px}.acct b{font-size:10.5px}
table.tx{width:100%;border-collapse:collapse;margin-top:16px}
table.tx thead th{background:#d9e2ec;text-align:left;font:italic 700 9.5px Georgia;padding:5px 6px;border-top:2px solid #52606d}
table.tx td{padding:3.4px 6px;border-bottom:1px solid #eef1f4;vertical-align:top}
table.tx td.n,table.tx th.n{text-align:right;white-space:nowrap} td.t{color:#52606d;width:34px}
tr.bf td{font-weight:700;font-size:11.5px;border-bottom:1px solid #9aa5b1}
.foot{margin-top:14px;font-size:9px;color:#7b8794}
"""
html = [f"<!doctype html><html><head><meta charset='utf-8'><style>{CSS}</style></head><body><div class='page'><div class='wm'>SAMPLE</div>",
        "<div class='top'><div><div class='brand'><span class='mark'>UK</span>UK Bank</div>"
        "<div class='sample'>SAMPLE STATEMENT &middot; FICTIONAL DATA FOR DEMONSTRATION</div></div>"
        "<div class='contact'>Contact us via the UK Bank app<br>or call 0300 000 0000 (example)<br>www.example.com<div class='title'>Your Statement</div></div></div>",
        "<div class='mid'><div class='addr'>Alex Tan<br>Flat 4<br>12 Example Road<br>London<br>E1 0AA</div>"
        f"<table class='summary'><tr><th colspan=2>Account Summary</th></tr><tr><td>Opening Balance</td><td class='n'>{money(1450)}</td></tr>"
        f"<tr><td>Payments In</td><td class='n'><b>{money(paid_in)}</b></td></tr><tr><td>Payments Out</td><td class='n'>{money(paid_out)}</td></tr>"
        f"<tr><td>Closing Balance</td><td class='n'>{money(bal)}</td></tr><tr><td>Arranged Overdraft Limit</td><td class='n'>0.00</td></tr></table></div>",
        "<div class='meta'><div><b>1 July to 30 September 2026</b><br><b>Account name</b><span>Alex Tan &middot; Student Current Account &middot; GBP</span></div>"
        "<div class='acct'><b>Sort code</b><b>Account number</b><b>Sheet</b><span>00-00-00</span><span>12347730</span><span>7</span></div></div>",
        "<table class='tx'><thead><tr><th>Date</th><th>Type</th><th>Payment details</th><th class='n'>Paid out</th><th class='n'>Paid in</th><th class='n'>Balance</th></tr></thead><tbody>",
        f"<tr class='bf'><td>01 Jul 26</td><td></td><td>BALANCE BROUGHT FORWARD</td><td></td><td></td><td class='n'>{money(1450)}</td></tr>"]
for d, desc, amt, ref, b in out:
    html.append(f"<tr><td>{d.strftime('%d %b %y')}</td><td class='t'>{ptype(desc, amt)}</td><td>{strip_code(desc)}</td>"
                f"<td class='n'>{money(-amt) if amt < 0 else ''}</td><td class='n'>{money(amt) if amt > 0 else ''}</td><td class='n'>{money(b)}</td></tr>")
html.append(f"<tr class='bf'><td></td><td></td><td>BALANCE CARRIED FORWARD</td><td></td><td></td><td class='n'>{money(bal)}</td></tr>")
html.append("</tbody></table><div class='foot'>UK Bank is a fictional bank used for CaiMao demonstrations. This document is not a real bank statement.</div></div></body></html>")
html_path = "/tmp/caimao-sample-statement.html"
open(html_path, "w").write("".join(html))
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(); pg.goto("file://" + html_path)
    pg.pdf(path=os.path.join(ROOT, "public/samples/caimao-sample-statement.pdf"), format="A4", margin={"top": "8mm", "bottom": "10mm", "left": "6mm", "right": "6mm"})
    # Preview image for the upload screen: the top of page 1 at 2x for sharp text.
    pg2 = b.new_page(viewport={"width": 794, "height": 1000}, device_scale_factor=2)
    pg2.goto("file://" + html_path)
    png = os.path.join(ROOT, "public/samples/caimao-sample-statement-preview.png")
    pg2.screenshot(path=png, clip={"x": 0, "y": 0, "width": 794, "height": 860})
    # Ship a compact WebP for the app; the PNG is only an intermediate.
    from PIL import Image
    im = Image.open(png).convert("RGB")
    im.thumbnail((1200, 1400))
    im.save(os.path.join(ROOT, "public/samples/caimao-sample-statement-preview.webp"), "WEBP", quality=82, method=6)
    os.remove(png)
    b.close()
print(len(out), "rows; closing balance", bal)
