import * as React from "react";

import { cn } from "@/lib/utils";

// Campo de número seleciona o valor ao receber o foco (dono, 2026-11-10: no estoque, digitar 1 sobre o "0" virava "01",
// e 2 sobre o "1" virava "21"). Assim o que se digita substitui o valor, em todo o sistema.
const NUMERICO = new Set(["number", "decimal", "numeric"]);

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onFocus, onMouseUp, ...props }, ref) => {
    const numerico = NUMERICO.has(type ?? "") || NUMERICO.has(props.inputMode ?? "");
    // O clique do mouse desfaz a seleção no mouseup; só o primeiro mouseup depois do foco é segurado.
    const acabouDeFocar = React.useRef(false);
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-sm border border-input bg-background dark:bg-muted px-3 py-1 text-[14px] ring-offset-background file:border-0 file:bg-transparent file:text-[14px] file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        onFocus={numerico ? (e) => { e.currentTarget.select(); acabouDeFocar.current = true; onFocus?.(e); } : onFocus}
        onMouseUp={numerico ? (e) => { if (acabouDeFocar.current) e.preventDefault(); acabouDeFocar.current = false; onMouseUp?.(e); } : onMouseUp}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
