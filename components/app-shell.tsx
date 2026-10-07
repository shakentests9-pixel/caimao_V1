"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, CalendarDays, Cat, CreditCard, Home, PieChart, Settings, ShieldCheck, User, type LucideIcon } from "lucide-react";
import { Avatar, MascotTile, Wordmark } from "./brand";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  name: string;
  icon?: LucideIcon;
  mascot?: boolean;
}

/** Desktop rail: short labels; `name` is the full name for screen readers. */
const RAIL: NavItem[] = [
  { href: "/", label: "Home", name: "Home", icon: Home },
  { href: "/copilot", label: "CaiMao", name: "CaiMao assistant", mascot: true },
  { href: "/transfers", label: "Send", name: "Transfers", icon: ArrowLeftRight },
  { href: "/budget", label: "Budget", name: "Budget", icon: PieChart },
  { href: "/obligations", label: "Bills", name: "Bills and obligations", icon: CalendarDays },
  { href: "/banking", label: "Credit", name: "Banking and credit", icon: CreditCard },
];
const RAIL_SECONDARY: NavItem[] = [
  { href: "/settings", label: "Settings", name: "Settings", icon: Settings },
  { href: "/evidence", label: "Activity", name: "Activity and security", icon: ShieldCheck },
];
const BOTTOM: NavItem[] = [
  { href: "/", label: "Home", name: "Home", icon: Home },
  { href: "/transfers", label: "Transfers", name: "Transfers", icon: ArrowLeftRight },
  { href: "/copilot", label: "CaiMao", name: "CaiMao assistant", mascot: true },
  { href: "/budget", label: "Budget", name: "Budget", icon: PieChart },
  { href: "/profile", label: "Profile", name: "Profile", icon: User },
];

const PROFILE_SECTIONS = ["/profile", "/settings", "/evidence", "/banking", "/obligations"];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** The signed-in frame: slim rail on desktop, top bar + docked bottom bar on phones. */
export function AppShell({ name, dueCount, children }: { name: string; dueCount: number; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <NavRail name={name} dueCount={dueCount} />
      <MobileTopBar />
      <div className="lg:pl-[136px]">
        <main className="mx-auto max-w-[1200px] px-4 pb-36 pt-3 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}

export function NavRail({ name, dueCount }: { name: string; dueCount: number }) {
  const pathname = usePathname();
  const item = (n: NavItem, small?: boolean) => {
    const active = isActive(pathname, n.href);
    const Icon = n.icon;
    return (
      <Link
        key={n.href}
        href={n.href}
        aria-label={n.name}
        aria-current={active ? "page" : undefined}
        className={cn("group relative flex w-full flex-col items-center gap-1.5 rounded-[18px] py-2 transition-colors", !n.mascot && (active ? "text-brand" : "text-muted hover:text-cocoa"))}
      >
        {n.mascot ? (
          <span className={cn("cm-press flex size-[52px] items-center justify-center rounded-[19px] bg-brand text-white shadow-glow transition-shadow", active && "ring-[3px] ring-gold ring-offset-2")}>
            <Cat className="size-6" />
          </span>
        ) : (
          <span className={cn("relative flex items-center justify-center rounded-[15px] transition-colors", small ? "size-10" : "size-11", active ? "bg-brand-soft" : "group-hover:bg-cream")}>
            {Icon ? <Icon className={small ? "size-[19px]" : "size-[21px]"} /> : null}
            {n.href === "/obligations" && dueCount > 0 ? (
              <span className="num absolute -right-1 -top-1 flex size-[18px] items-center justify-center rounded-full bg-gold text-[10.5px] font-extrabold text-cocoa ring-2 ring-white" aria-hidden>
                {dueCount}
              </span>
            ) : null}
          </span>
        )}
        <span className={cn("text-[11.5px] font-extrabold", n.mascot ? (active ? "text-brand" : "text-cocoa") : "")}>{n.label}</span>
        {n.href === "/obligations" && dueCount > 0 ? <span className="sr-only">{dueCount} due</span> : null}
      </Link>
    );
  };

  return (
    <aside className="fixed inset-y-6 left-6 z-30 hidden w-[96px] flex-col items-center rounded-[30px] bg-white py-5 shadow-card lg:flex" aria-label="Main navigation">
      <Link href="/" aria-label="CaiMao home" className="cm-press mb-5 flex flex-col items-center gap-1">
        <MascotTile size={48} priority />
        <span className="font-display text-[12.5px] font-extrabold tracking-[-0.04em] text-cocoa">CaiMao</span>
      </Link>
      <nav className="flex w-full flex-1 flex-col items-center gap-1 px-2.5">
        {RAIL.map((n) => item(n))}
        <span className="my-2 h-px w-10 bg-line" aria-hidden />
        {RAIL_SECONDARY.map((n) => item(n, true))}
      </nav>
      <Link href="/profile" aria-label={`Profile: ${name}`} aria-current={pathname.startsWith("/profile") ? "page" : undefined} className={cn("cm-press mt-2 rounded-[18px] p-0.5", pathname.startsWith("/profile") && "ring-[3px] ring-gold")}>
        <Avatar name={name} size={46} />
      </Link>
    </aside>
  );
}

export function MobileTopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between bg-ivory/90 px-4 backdrop-blur-md lg:hidden">
      <Link href="/" aria-label="CaiMao home">
        <Wordmark size={36} />
      </Link>
      <span className="flex items-center gap-1.5 rounded-full bg-gold-soft px-3 py-1.5 text-[12px] font-extrabold text-gold-ink">
        <span className="size-1.5 rounded-full bg-gold" aria-hidden /> Sandbox
      </span>
    </header>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-end justify-around border-t border-line bg-white/95 px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden"
      aria-label="Main navigation"
    >
      {BOTTOM.map((n) => {
        const active = isActive(pathname, n.href) || (n.href === "/profile" && PROFILE_SECTIONS.some((p) => pathname.startsWith(p)));
        if (n.mascot) {
          return (
            <Link key={n.href} href={n.href} aria-label={n.name} aria-current={active ? "page" : undefined} className="cm-press -mt-7 flex flex-col items-center gap-1">
              <span className={cn("flex size-[58px] items-center justify-center rounded-[22px] bg-brand text-white shadow-glow ring-4 ring-white", active && "ring-gold")}>
                <Cat className="size-[26px]" />
              </span>
              <span className={cn("text-[11px] font-extrabold", active ? "text-brand" : "text-cocoa")}>{n.label}</span>
            </Link>
          );
        }
        const Icon = n.icon!;
        return (
          <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={cn("flex min-h-12 min-w-14 flex-col items-center justify-center gap-1 rounded-2xl", active ? "text-brand" : "text-muted")}>
            <Icon className="size-[22px]" />
            <span className="text-[11px] font-extrabold">{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
