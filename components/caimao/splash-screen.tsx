import { CaiMaoLockup } from "../brand";
import { cn } from "@/lib/utils";

/** Full-bleed launch screen: brand orange, the CaiMao lockup centred, no actions. */
export function SplashScreen({ leaving, className }: { leaving?: boolean; className?: string }) {
  return (
    <section
      aria-label="CaiMao"
      className={cn("fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-brand transition-opacity duration-500", leaving && "pointer-events-none opacity-0", className)}
    >
      <div className="relative w-[min(86vw,560px)] animate-arrive">
        <div className="pointer-events-none absolute inset-[18%_8%] rounded-full bg-[radial-gradient(circle,rgba(245,177,76,0.24),transparent_64%)] blur-[18px]" aria-hidden />
        <div className="relative animate-breathe">
          <CaiMaoLockup />
        </div>
      </div>
    </section>
  );
}
