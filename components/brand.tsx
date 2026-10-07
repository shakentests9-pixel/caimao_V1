import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * CaiMao brand primitives. All artwork comes from the supplied logo, recoloured so
 * its background is exactly the brand orange (#A84A1A) and sits flush on orange tiles.
 *  - MascotTile: the cat's head on a rounded orange tile (nav, assistant, insights).
 *  - Wordmark: tile + "CaiMao" in the display face.
 *  - CaiMaoMark: cat, book and coin route without the wordmark (intro, login).
 *  - CaiMaoLockup: the full logo with wordmark (splash).
 */

export function MascotTile({ size = 44, className, priority }: { size?: number; className?: string; priority?: boolean }) {
  return (
    <span
      className={cn("relative inline-flex shrink-0 overflow-hidden bg-brand shadow-[0_8px_15px_rgba(168,74,26,0.22)]", className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.36) }}
      aria-hidden
    >
      <Image src="/brand/caimao-head.png" alt="" width={size} height={size} sizes={`${size}px`} priority={priority} className="size-full object-cover" />
    </span>
  );
}

export function Wordmark({ className, size = 40, light }: { className?: string; size?: number; light?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <MascotTile size={size} priority />
      <span className={cn("font-display text-[22px] font-extrabold tracking-[-0.06em]", light ? "text-white" : "text-cocoa")}>CaiMao</span>
    </span>
  );
}

export function CaiMaoMark({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/caimao-mark.png"
      alt="CaiMao cat with glasses reading a book, with coins flowing between currencies"
      width={1100}
      height={655}
      sizes="(max-width: 640px) 90vw, 560px"
      priority={priority}
      className={cn("h-auto w-full", className)}
    />
  );
}

export function CaiMaoLockup({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/caimao-lockup.png"
      alt="CaiMao: a white scholarly cat with glasses and an open book, coins flowing between dollar, rouble, euro and yuan, above the CaiMao wordmark"
      width={1000}
      height={1000}
      sizes="(max-width: 640px) 86vw, 560px"
      priority
      className={cn("h-auto w-full", className)}
    />
  );
}

/** Initials avatar in soft peach, as in the Canva profile chip. */
export function Avatar({ name, size = 44, className }: { name: string; size?: number; className?: string }) {
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center bg-peach font-display font-extrabold text-cocoa", className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.36), fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
