"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

/** Centred sheet on desktop, bottom sheet on mobile. */
export function DialogContent({ className, children, hideClose, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { hideClose?: boolean }) {
  const t = useTranslations("Dialog");
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-cocoa/45 backdrop-blur-[3px] data-[state=open]:animate-[rise_200ms_ease-out]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 max-h-[94dvh] w-full overflow-y-auto bg-white shadow-float outline-none",
          "inset-x-0 bottom-0 rounded-t-[28px] pb-[env(safe-area-inset-bottom)]",
          "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100vw-32px)] sm:max-w-[520px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px] sm:pb-0",
          "data-[state=open]:animate-rise",
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full bg-cream text-muted transition-colors hover:bg-line hover:text-cocoa" aria-label={t("close")}>
            <X className="size-[18px]" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
