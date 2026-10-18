import type { TransactionCategory } from "../types";

/**
 * Rule-based transaction classifier. Deterministic and explainable, so the categories on
 * the Budget page and in statement analysis never depend on an LLM call when a rule fits.
 *
 * Two layers:
 *  1. MERCHANTS: known merchants → category + subcategory (high confidence).
 *  2. RULES: keyword patterns → category (medium confidence).
 * Anything else falls back on the amount's sign with low confidence and is flagged for review.
 */

export type ClassificationSource = "merchant" | "rule" | "fallback";

export interface Classification {
  category: TransactionCategory;
  subcategory: string | null;
  confidence: number;
  source: ClassificationSource;
  /** Canonical merchant name when a known merchant matched. */
  merchant: string | null;
}

/** Below this, a statement row is flagged for the user to review. */
export const REVIEW_THRESHOLD = 0.7;

type MerchantRule = { name: string; re: RegExp; category: TransactionCategory; sub?: string };

/** Known merchants. Extend freely: order matters only where names overlap (more specific first). */
export const MERCHANTS: MerchantRule[] = [
  // Food: groceries
  ...(
    [
      ["Tesco", /\btesco\b/i],
      ["Sainsbury's", /sainsbury/i],
      ["Asda", /\basda\b/i],
      ["Lidl", /\blidl\b/i],
      ["Aldi", /\baldi\b/i],
      ["Morrisons", /morrisons/i],
      ["Waitrose", /waitrose/i],
      ["Co-op", /\bco-?op\b/i],
      ["M&S Food", /\bm\s?&\s?s\b|marks\s?(and|&)\s?spencer/i],
      ["FairPrice", /fair\s?price|ntuc/i],
      ["Cold Storage", /cold storage/i],
      ["Sheng Siong", /sheng siong/i],
      ["Giant", /\bgiant\b/i],
      ["Walmart", /walmart|wal-mart/i],
      ["Trader Joe's", /trader joe/i],
      ["Whole Foods", /whole ?foods/i],
      ["Costco", /costco/i],
      ["7-Eleven", /7-?eleven|seven-?eleven|セブン/i],
      ["Lawson", /\blawson\b|ローソン/i],
      ["FamilyMart", /family ?mart|ファミリーマート|全家/i],
      ["Hema", /hema|盒马/i],
    ] as const
  ).map(([name, re]) => ({ name, re, category: "Food" as const, sub: "Groceries" })),
  // Food: eating out and delivery
  ...(
    [
      ["Deliveroo", /deliveroo/i],
      ["Uber Eats", /uber\s?eats/i],
      ["Just Eat", /just\s?eat/i],
      ["Foodpanda", /foodpanda/i],
      ["GrabFood", /grab\s?food/i],
      ["Meituan", /meituan|美团/i],
      ["Ele.me", /ele\.me|饿了么/i],
      ["DoorDash", /doordash/i],
      ["Grubhub", /grubhub/i],
      ["Pret A Manger", /\bpret\b/i],
      ["Starbucks", /starbucks|星巴克|スターバックス/i],
      ["Costa Coffee", /costa coffee|\bcosta\b/i],
      ["McDonald's", /mcdonald|麦当劳|マクドナルド/i],
      ["KFC", /\bkfc\b|肯德基/i],
      ["Nando's", /nando/i],
      ["Greggs", /greggs/i],
      ["Subway", /\bsubway\b/i],
      ["Luckin Coffee", /luckin|瑞幸/i],
      ["Wagamama", /wagamama/i],
      ["Itsu", /\bitsu\b/i],
      ["Leon", /\bleon restaurants?\b/i],
      ["Ya Kun", /ya kun/i],
      ["Toast Box", /toast box/i],
    ] as const
  ).map(([name, re]) => ({ name, re, category: "Food" as const, sub: "Eating out" })),
  // Subscriptions
  ...(
    [
      ["Netflix", /netflix/i],
      ["Spotify", /spotify/i],
      ["Disney+", /disney\s?\+|disney plus/i],
      ["Amazon Prime", /prime video|amazon prime|amzn prime/i],
      ["Apple", /apple\.com\/bill|itunes|icloud|apple services/i],
      ["YouTube Premium", /youtube premium|google \*youtube/i],
      ["Google One", /google one|google storage/i],
      ["Microsoft 365", /microsoft 365|msft \*|office 365/i],
      ["Adobe", /\badobe\b/i],
      ["OpenAI", /openai|chatgpt/i],
      ["Notion", /\bnotion\b/i],
      ["Gym membership", /\bpuregym|the gym group|anytime fitness|\bgym\b/i],
    ] as const
  ).map(([name, re]) => ({ name, re, category: "Subscriptions" as const, sub: "Digital services" })),
  // Phone & broadband (recurring essential, counted under Subscriptions in the existing budget model)
  ...(
    [
      ["giffgaff", /giffgaff/i],
      ["Vodafone", /vodafone/i],
      ["EE", /\bee limited\b|\bee mobile\b|^ee\b/i],
      ["O2", /\bo2\b/i],
      ["Three", /\bthree\.co|three mobile|\bh3g\b/i],
      ["Singtel", /singtel/i],
      ["StarHub", /starhub/i],
      ["M1", /\bm1 limited\b|\bm1 mobile\b/i],
      ["Verizon", /verizon/i],
      ["AT&T", /\bat&t\b|\batt\b/i],
      ["T-Mobile", /t-?mobile/i],
      ["NTT Docomo", /docomo|ドコモ/i],
      ["SoftBank", /softbank|ソフトバンク/i],
      ["China Mobile", /china mobile|中国移动/i],
    ] as const
  ).map(([name, re]) => ({ name, re, category: "Subscriptions" as const, sub: "Phone" })),
  // Transport
  ...(
    [
      ["TfL", /\btfl\b|transport for london/i],
      ["Trainline", /trainline/i],
      ["National Rail", /national rail|\blner\b|avanti|gwr\b/i],
      ["Stagecoach", /stagecoach/i],
      ["Uber", /\buber\b(?!\s?eats)/i],
      ["Bolt", /\bbolt\b/i],
      ["Lyft", /\blyft\b/i],
      ["Grab", /\bgrab\b(?!\s?food)/i],
      ["Gojek", /gojek/i],
      ["SimplyGo", /simplygo|ez-?link|transitlink/i],
      ["MTA", /\bmta\b|omny/i],
      ["Suica / PASMO", /suica|pasmo|ＪＲ|jr east/i],
      ["DiDi", /\bdidi\b|滴滴/i],
    ] as const
  ).map(([name, re]) => ({ name, re, category: "Transportation" as const, sub: "Travel around" })),
  // Shopping
  ...(
    [
      ["Amazon", /amazon|amzn/i],
      ["eBay", /\bebay\b/i],
      ["Argos", /\bargos\b/i],
      ["IKEA", /\bikea\b/i],
      ["Uniqlo", /uniqlo|ユニクロ/i],
      ["Primark", /primark/i],
      ["Shopee", /shopee/i],
      ["Lazada", /lazada/i],
      ["Taobao", /taobao|淘宝/i],
      ["JD.com", /\bjd\.com\b|京东/i],
      ["Muji", /\bmuji\b|無印/i],
      ["Daiso", /daiso|ダイソー/i],
      ["Don Quijote", /don quijote|ドン・キホーテ/i],
      ["Currys", /\bcurrys\b/i],
      ["John Lewis", /john lewis/i],
      ["H&M", /\bh&m\b|\bh & m\b/i],
      ["Zara", /\bzara\b/i],
      ["Apple Store", /apple store/i],
      ["Best Buy", /best buy/i],
      ["Walmart", /walmart/i],
      ["Bic Camera", /bic ?camera|ビックカメラ/i],
      ["Yodobashi", /yodobashi|ヨドバシ/i],
    ] as const
  ).map(([name, re]) => ({ name, re, category: "Shopping" as const })),
  // Healthcare
  ...(
    [
      ["Boots", /\bboots\b/i],
      ["Superdrug", /superdrug/i],
      ["Guardian", /\bguardian\b(?! news)/i],
      ["Watsons", /watsons/i],
      ["CVS Pharmacy", /\bcvs\b/i],
      ["Walgreens", /walgreens/i],
      ["NHS", /\bnhs\b/i],
    ] as const
  ).map(([name, re]) => ({ name, re, category: "Healthcare" as const })),
  // Travel
  ...(
    [
      ["easyJet", /easyjet/i],
      ["Ryanair", /ryanair/i],
      ["British Airways", /british airways|\bba\.com\b/i],
      ["Singapore Airlines", /singapore airlines|\bsia\b/i],
      ["Scoot", /\bscoot\b/i],
      ["Airbnb", /airbnb/i],
      ["Booking.com", /booking\.com/i],
      ["Agoda", /agoda/i],
      ["Trip.com", /trip\.com|ctrip|携程/i],
    ] as const
  ).map(([name, re]) => ({ name, re, category: "Travel" as const })),
  // Entertainment
  ...(
    [
      ["Odeon", /odeon/i],
      ["Vue Cinemas", /\bvue\b/i],
      ["Cineworld", /cineworld/i],
      ["Ticketmaster", /ticketmaster/i],
      ["Steam", /\bsteam\b|steampowered/i],
      ["PlayStation", /playstation|\bpsn\b/i],
      ["Nintendo", /nintendo/i],
    ] as const
  ).map(([name, re]) => ({ name, re, category: "Entertainment" as const })),
  // Transfers between own accounts / money apps
  ...(
    [
      ["Wise", /\bwise\b|transferwise/i],
      ["Revolut", /revolut/i],
      ["PayNow", /paynow/i],
      ["Zelle", /zelle/i],
      ["Venmo", /venmo/i],
    ] as const
  ).map(([name, re]) => ({ name, re, category: "Transfers" as const })),
];

/** Keyword rules, checked after merchants. */
const RULES: { category: TransactionCategory; sub?: string; patterns: RegExp[] }[] = [
  { category: "Transfers", patterns: [/remittance/i, /top-up|top up/i, /\b(transfer|tfr|trf|xfer)\s+(to|from)\s+(own|my|savings)\b/i, /\bsavings (pot|account|transfer)\b/i] },
  { category: "Income", patterns: [/payroll/i, /salary/i, /wages/i, /allowance/i, /family support/i, /stipend/i, /scholarship/i, /bursary/i, /工资|給与|給料/] },
  { category: "Fees", patterns: [/\bfee\b|fees\b/i, /\bcharge\b|charges\b/i, /overdraft/i, /\binterest charged\b/i, /\batm\b.*\bfee\b/i, /手续费|手数料/] },
  { category: "Accommodation", patterns: [/\brent\b/i, /student living/i, /accommodation/i, /\bhalls?\b/i, /letting|lettings/i, /unite students|iq student/i, /房租|家賃/] },
  { category: "Healthcare", patterns: [/pharmacy|chemist/i, /clinic|hospital|dental|dentist|medical|doctor|optician/i, /医院|病院|薬局/] },
  { category: "Food", sub: "Eating out", patterns: [/restaurant|cafe|café|coffee|bistro|bakery|takeaway|pizza|sushi|ramen|noodle|kitchen\b/i, /餐|饭|食堂|レストラン/] },
  { category: "Food", sub: "Groceries", patterns: [/groceries|grocery|supermarket|market\b/i, /超市|スーパー/] },
  { category: "Transportation", patterns: [/\bbus\b|\brail\b|\btrain\b|\bmetro\b|\bsubway station\b|\btaxi\b|\bparking\b|\bfuel\b|\bpetrol\b/i, /地铁|電車|タクシー/] },
  { category: "Education", patterns: [/bookshop|textbook/i, /university(?!.*payroll)/i, /tuition/i, /\bcourse\b|coursera|udemy/i, /学费|授業料/] },
  { category: "Entertainment", patterns: [/cinema|theatre|theater|concert|museum|bowling|karaoke/i] },
  { category: "Travel", patterns: [/airline|airways|flight|hotel|hostel|airport/i] },
  { category: "Subscriptions", sub: "Digital services", patterns: [/subscription|membership|monthly plan/i] },
  { category: "Subscriptions", sub: "Phone", patterns: [/mobile plan|broadband|internet|phone bill/i] },
  { category: "Shopping", patterns: [/\bstore\b|\bshop\b|clothing|fashion|electronics/i] },
];

export function classifyDetailed(merchant: string, description: string, amount: number): Classification {
  const text = `${merchant} ${description}`;
  for (const m of MERCHANTS) {
    if (m.re.test(text)) {
      // A refund from a shop is still that shop's category; income-only categories never apply to debits.
      return { category: m.category, subcategory: m.sub ?? null, confidence: 0.95, source: "merchant", merchant: m.name };
    }
  }
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      if (rule.category === "Income" && amount < 0) continue;
      return { category: rule.category, subcategory: rule.sub ?? null, confidence: 0.85, source: "rule", merchant: null };
    }
  }
  return amount > 0
    ? { category: "Income", subcategory: null, confidence: 0.5, source: "fallback", merchant: null }
    : { category: "Other", subcategory: null, confidence: 0.4, source: "fallback", merchant: null };
}

/**
 * Original single-label API used by the seeded budget data. Unknown outflows stay "Transfers"
 * here so the existing Budget page keeps its behaviour.
 */
export function classifyTransaction(merchant: string, description: string, amount: number): TransactionCategory {
  const c = classifyDetailed(merchant, description, amount);
  if (c.source === "fallback") return amount > 0 ? "Income" : "Transfers";
  return c.category;
}

export const SPENDING_CATEGORIES: Exclude<TransactionCategory, "Income">[] = [
  "Accommodation",
  "Food",
  "Transportation",
  "Education",
  "Entertainment",
  "Travel",
  "Subscriptions",
  "Shopping",
  "Healthcare",
  "Fees",
  "Other",
  "Transfers",
];

/** Needs-based split used by statement analysis. Everything else counts as discretionary. */
export const ESSENTIAL_CATEGORIES: TransactionCategory[] = ["Accommodation", "Transportation", "Education", "Healthcare", "Fees"];
/** Food is split by subcategory: groceries are essential, eating out is discretionary. */
export function isEssential(category: TransactionCategory, subcategory: string | null): boolean {
  if (category === "Food") return subcategory !== "Eating out";
  if (category === "Subscriptions") return subcategory === "Phone";
  return ESSENTIAL_CATEGORIES.includes(category);
}
