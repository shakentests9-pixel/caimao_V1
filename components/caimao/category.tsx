import { BookOpen, Bus, Coffee, Film, GraduationCap, Home, Plane, Repeat, ShoppingBasket, Smartphone, Wallet, ArrowLeftRight, type LucideIcon } from "lucide-react";
import type { TransactionCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

/** One colour and icon per spending category, shared by charts, rows and budget cards. */
export const CATEGORY: Record<TransactionCategory, { color: string; soft: string; ink: string; Icon: LucideIcon; label: string }> = {
  Income: { color: "#3FAF6C", soft: "#E1F4E8", ink: "#23794A", Icon: Wallet, label: "Income" },
  Accommodation: { color: "#A84A1A", soft: "#FFF1E4", ink: "#A84A1A", Icon: Home, label: "Accommodation" },
  Food: { color: "#F5B14C", soft: "#FDEBCB", ink: "#8A5300", Icon: ShoppingBasket, label: "Food" },
  Transportation: { color: "#F2C7A6", soft: "#FBE6D6", ink: "#9A4318", Icon: Bus, label: "Transport" },
  Education: { color: "#3A2117", soft: "#EFE3D9", ink: "#3A2117", Icon: GraduationCap, label: "Education" },
  Entertainment: { color: "#C9874F", soft: "#F7E7D6", ink: "#8A4E1E", Icon: Film, label: "Entertainment" },
  Travel: { color: "#8C5A3C", soft: "#F1E4DA", ink: "#6E4329", Icon: Plane, label: "Travel" },
  Subscriptions: { color: "#E9D8C8", soft: "#F6EADF", ink: "#5C3B2C", Icon: Repeat, label: "Subscriptions" },
  Transfers: { color: "#D7C6B8", soft: "#F6EADF", ink: "#5C3B2C", Icon: ArrowLeftRight, label: "Transfers" },
};

const MERCHANT_ICON: [RegExp, LucideIcon][] = [
  [/pret|deliveroo|cafe|coffee/i, Coffee],
  [/bookshop|textbook/i, BookOpen],
  [/giffgaff|mobile/i, Smartphone],
];

export function CategoryIcon({ category, merchant, size = 44, className }: { category: TransactionCategory; merchant?: string; size?: number; className?: string }) {
  const c = CATEGORY[category];
  const Icon = (merchant && MERCHANT_ICON.find(([re]) => re.test(merchant))?.[1]) || c.Icon;
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-[14px]", className)} style={{ width: size, height: size, background: c.soft, color: c.ink }} aria-hidden>
      <Icon style={{ width: size * 0.45, height: size * 0.45 }} />
    </span>
  );
}
