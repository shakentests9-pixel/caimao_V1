import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "cm-press inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[16px] font-extrabold transition-[background,box-shadow,color,opacity] duration-200 disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-[18px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "cm-cta",
        ink: "bg-cocoa text-white hover:bg-cocoa-2",
        soft: "bg-cream text-cocoa hover:bg-sand",
        outline: "bg-white text-cocoa ring-1 ring-inset ring-sand hover:bg-cream",
        ghost: "text-cocoa hover:bg-cocoa/5",
        danger: "bg-white text-error-ink ring-1 ring-inset ring-error/40 hover:bg-error-soft",
        link: "h-auto rounded-md px-0 font-bold text-brand underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-10 rounded-[12px] px-4 text-[14px]",
        md: "h-11 px-5 text-[15px]",
        lg: "h-[54px] px-6 text-[16px]",
        icon: "size-11 p-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = "Button";
