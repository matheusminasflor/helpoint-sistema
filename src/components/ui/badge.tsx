import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-sm border px-2.5 py-0.5 text-[13px] font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-ring",
  {
    variants: {
      variant: {
        default: "bg-primary/10 text-primary border-primary/20",
        secondary: "bg-surface-2 text-foreground border-border",
        destructive: "bg-destructive/10 text-destructive border-destructive/20",
        outline: "text-foreground",
        // Fundo e letra vêm da classe semântica do chamador (`badge-success`…); aqui só a borda.
        semantica: "border-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

// A cor semântica (`badge-success`, `badge-danger`, `priority-*`…) mora em `@layer components`, e o `bg-primary/10` do
// padrão é utilitário — que vence a camada de componentes. Com as duas, todo selo saía azul (visto em 2026-10-19 no
// Estoque: "Sem estoque" e "Ok" iguais). Com cor semântica e sem variante, a variante `semantica` não pinta nada.
const COR_SEMANTICA = /(^|\s)(badge|priority)-/;

function Badge({ className, variant, ...props }: BadgeProps) {
  const v = variant ?? (className && COR_SEMANTICA.test(className) ? "semantica" : "default");
  return <div className={cn(badgeVariants({ variant: v }), className)} {...props} />;
}

export { Badge, badgeVariants };