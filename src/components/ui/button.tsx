import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-[13px] font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shadow-xs",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground rounded-md hover:bg-primary/90 active:bg-primary/80",
        destructive: "bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 active:bg-destructive/80",
        outline: "border border-border bg-card text-foreground rounded-md hover:bg-surface-2 active:bg-surface-3 shadow-xs",
        secondary: "bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 active:bg-secondary/70",
        ghost: "text-foreground rounded-md hover:bg-surface-2 active:bg-surface-3 shadow-none",
        link: "text-primary underline-offset-4 hover:underline shadow-none",
        industrial: "bg-surface-2 text-foreground border border-border rounded-md hover:bg-surface-3 hover:border-primary active:bg-surface-1",
        success: "bg-status-success text-white rounded-md hover:bg-status-success/90 active:bg-status-success/80",
        warning: "bg-status-warning text-white rounded-md hover:bg-status-warning/90 active:bg-status-warning/80",
        danger: "bg-status-danger text-white rounded-md hover:bg-status-danger/90 active:bg-status-danger/80",
        focus: "bg-primary text-primary-foreground rounded-md hover:bg-primary/90 active:bg-primary/80",
      },
      size: {
        default: "h-8 px-3.5 py-1.5",
        sm: "h-7 px-3 text-[12px]",
        lg: "h-10 px-6 text-[14px]",
        xl: "h-12 px-8 text-[15px]",
        icon: "h-8 w-8",
        "icon-sm": "h-7 w-7",
        "icon-lg": "h-10 w-10",
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