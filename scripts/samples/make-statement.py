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

html = ["<html><head><meta charset='utf-8'><style>body{font-family:Helvetica,Arial;font-size:10px}table{border-collapse:collapse;width:100%}td,th{padding:3px 6px;border-bottom:1px solid #ddd;text-align:left}td.n{text-align:right}</style></head><body>",
        "<h2>UK Bank - Statement of account</h2><p>SAMPLE STATEMENT - FICTIONAL DATA FOR DEMONSTRATION</p><p>Account number 12347730 &nbsp; Currency GBP &nbsp; Period 01 Jul 2026 to 30 Sep 2026</p>",
        "<table><tr><th>Date</th><th>Description</th><th>Amount</th><th>Balance</th></tr>",
        "<tr><td>01 Jul 2026</td><td>Opening balance</td><td></td><td class='n'>1,450.00</td></tr>"]
for d, desc, amt, ref, b in out:
    html.append(f"<tr><td>{d.strftime('%d %b %Y')}</td><td>{desc}</td><td class='n'>{abs(amt):,.2f}</td><td class='n'>{b:,.2f}</td></tr>")
html.append("</table></body></html>")
html_path = "/tmp/caimao-sample-statement.html"
open(html_path, "w").write("".join(html))
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(); pg.goto("file://" + html_path)
    pg.pdf(path=os.path.join(ROOT, "public/samples/caimao-sample-statement.pdf"), format="A4", margin={"top": "12mm", "bottom": "12mm", "left": "10mm", "right": "10mm"})
    b.close()
print(len(out), "rows; closing balance", bal)
