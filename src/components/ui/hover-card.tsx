import * as React from "react";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";

import { cn } from "@/lib/utils";

// Toque no lugar do mouse (rodada 3, correção 8 do desenho aprovado). O HoverCard do Radix ignora o dedo de propósito
// (só abre com o mouse ou o foco), e as listas por trás dos números dos Indicadores, as explicações (i) e as dicas dos
// campos ficavam mortas no celular. Aqui, um toque no gatilho abre e outro fecha; tocar fora fecha (o Radix já faz).
// Com o mouse nada muda. Quem controla o `open` por conta própria cuida do toque sozinho.
type Toque = { aberto: boolean; mudar: (v: boolean) => void } | null;
const ToqueContext = React.createContext<Toque>(null);

function HoverCard({ open, defaultOpen, onOpenChange, ...props }: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
  const [aberto, setAberto] = React.useState(defaultOpen ?? false);
  const controlado = open !== undefined;
  const mudar = (v: boolean) => {
    setAberto(v);
    onOpenChange?.(v);
  };
  return (
    <ToqueContext.Provider value={controlado ? null : { aberto, mudar }}>
      <HoverCardPrimitive.Root open={controlado ? open : aberto} onOpenChange={controlado ? onOpenChange : mudar} {...props} />
    </ToqueContext.Provider>
  );
}

const HoverCardTrigger = React.forwardRef<
  React.ElementRef<typeof HoverCardPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Trigger>
>(({ onPointerDown, onClick, ...props }, ref) => {
  const toque = React.useContext(ToqueContext);
  // O estado é lido no toque, não no clique: o foco do toque pode abrir antes (openDelay) e o clique fecharia.
  const doToque = React.useRef<{ dedo: boolean; estavaAberto: boolean }>({ dedo: false, estavaAberto: false });
  return (
    <HoverCardPrimitive.Trigger
      ref={ref}
      onPointerDown={(e) => {
        doToque.current = { dedo: e.pointerType === "touch" || e.pointerType === "pen", estavaAberto: !!toque?.aberto };
        onPointerDown?.(e);
      }}
      onClick={(e) => {
        onClick?.(e);
        if (toque && doToque.current.dedo) toque.mudar(!doToque.current.estavaAberto);
      }}
      {...props}
    />
  );
});
HoverCardTrigger.displayName = HoverCardPrimitive.Trigger.displayName;

const HoverCardContent = React.forwardRef<
  React.ElementRef<typeof HoverCardPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <HoverCardPrimitive.Content
    ref={ref}
    align={align}
    sideOffset={sideOffset}
    className={cn(
      "z-50 w-64 max-w-[calc(100vw-24px)] rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className,
    )}
    collisionPadding={12}
    {...props}
  />
));
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName;

export { HoverCard, HoverCardTrigger, HoverCardContent };
