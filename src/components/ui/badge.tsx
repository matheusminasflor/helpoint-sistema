import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  // Situação em palavras (etapa 2, 2ª parte, 2026-10-25): sem fundo, sem borda, sem pílula — só a palavra.
  "inline-flex items-center gap-1 text-[13px] font-medium focus:outline-none focus:ring-1 focus:ring-ring",
  {
    variants: {
      variant: {
        default: "text-foreground",
        secondary: "text-muted-foreground",
        destructive: "text-status-danger",
        outline: "text-muted-foreground",
        // A cor vem da classe semântica do chamador (`badge-danger`…); a variante não pinta nada.
        semantica: "",
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