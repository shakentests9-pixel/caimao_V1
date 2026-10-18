import { Eye, Lock, Sparkles, MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { PermissionLevel } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Friendly names for the permission levels. Level 3 is never a standing permission.
 * English copy kept for existing importers; PermissionChip renders the translated name
 * from PermissionChip.levels.L<level>.name.
 */
export const PERMISSION_COPY: Record<PermissionLevel, { name: string; short: string; text: string; Icon: typeof Eye }> = {
  [PermissionLevel.Information]: { name: "Explain only", short: "L0", text: "CaiMao can explain and answer questions, but can't see your accounts.", Icon: MessageCircle },
  [PermissionLevel.Read]: { name: "View", short: "L1", text: "CaiMao can analyse your finances: balances, spending and bills.", Icon: Eye },
  [PermissionLevel.Prepare]: { name: "Assist", short: "L2", text: "CaiMao can compare options and prepare payments for you to review.", Icon: Sparkles },
  [PermissionLevel.Execute]: { name: "Your approval", short: "L3", text: "Money only moves after you confirm each payment.", Icon: Lock },
};

export function PermissionChip({ level, className, compact }: { level: PermissionLevel; className?: string; compact?: boolean }) {
  const t = useTranslations("PermissionChip");
  const c = PERMISSION_COPY[level];
  const name = t(`levels.L${level}.name`);
  const tone =
    level === PermissionLevel.Execute
      ? "bg-cocoa text-white"
      : level === PermissionLevel.Prepare
        ? "bg-brand-soft text-brand"
        : "bg-cream text-cocoa-2";
  return (
    <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-bold", tone, className)} title={t("title", { level, name })}>
      <c.Icon className="size-3.5" aria-hidden />
      {compact ? <span className="font-mono text-[11.5px]">{c.short}</span> : name}
    </span>
  );
}
