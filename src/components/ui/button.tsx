import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-[14px] font-bold transition-all duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground rounded-md hover:bg-primary/90 active:bg-primary/80",
        destructive: "bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 active:bg-destructive/80",
        outline: "border border-input bg-card text-foreground rounded-md hover:bg-muted active:bg-muted/80",
        secondary: "bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 active:bg-secondary/70",
        ghost: "text-foreground rounded-md hover:bg-muted active:bg-muted/80 shadow-none",
        link: "text-primary underline-offset-4 hover:underline shadow-none",
        industrial: "bg-surface-2 text-foreground border border-border rounded-md hover:bg-surface-3 hover:border-primary active:bg-surface-1",
        // DashStack: o botão principal é azul cheio; os outros, contornados em cinza.
        success: "border border-input bg-card text-foreground rounded-md hover:bg-muted active:bg-muted/80",
        warning: "border border-input bg-card text-foreground rounded-md hover:bg-muted active:bg-muted/80",
        danger: "bg-status-danger text-white rounded-md hover:bg-status-danger/90 active:bg-status-danger/80",
        focus: "bg-primary text-primary-foreground rounded-md hover:bg-primary/90 active:bg-primary/80",
      },
      size: {
        default: "h-9 px-4 py-1.5",
        sm: "h-8 px-3 text-[13px]",
        lg: "h-11 px-6 text-[15px]",
        xl: "h-12 px-8 text-[16px]",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8",
        "icon-lg": "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };