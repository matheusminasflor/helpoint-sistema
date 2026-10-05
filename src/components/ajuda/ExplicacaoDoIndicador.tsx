// A explicação de um indicador ao passar o mouse (decisão do dono, 2026-10-04: "em cada indicador
// você passe o cursor do mouse e tenha um tutorial de como funciona"). Os textos moram em
// `src/config/explicacoes-dos-indicadores.ts`.
//
// Duas formas:
//   * `<ExplicacaoDoIndicador id="…" />` — o ícone (i) ao lado de um título de seção ou gráfico;
//   * `<ExplicacaoDoIndicador id="…">{cartão}</ExplicacaoDoIndicador>` — o cartão inteiro vira a
//     área do mouse (cartões de KPI).
// HoverCard e não Tooltip: o texto tem três partes e precisa de espaço para ser lido.
import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { EXPLICACOES, type IdDaExplicacao } from '@/config/explicacoes-dos-indicadores';
import { cn } from '@/lib/utils';

interface Props {
  id: IdDaExplicacao;
  children?: ReactNode;
  className?: string;
}

export function ExplicacaoDoIndicador({ id, children, className }: Props) {
  const e = EXPLICACOES[id];
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        {children ? (
          <div className={cn('cursor-help', className)}>{children}</div>
        ) : (
          <button
            type="button"
            className={cn('inline-flex items-center text-muted-foreground hover:text-foreground cursor-help align-middle', className)}
            aria-label={`Como funciona: ${e.titulo}`}
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </HoverCardTrigger>
      <HoverCardContent className="w-80 text-[12px] space-y-2 normal-case tracking-normal font-normal" side="top">
        <p className="text-[13px] font-semibold text-foreground">{e.titulo}</p>
        <div>
          <p className="font-semibold text-foreground">O que é</p>
          <p className="text-muted-foreground">{e.oQueE}</p>
        </div>
        <div>
          <p className="font-semibold text-foreground">De onde vem</p>
          <p className="text-muted-foreground">{e.deOndeVem}</p>
        </div>
        <div>
          <p className="font-semibold text-foreground">Como é calculado</p>
          <p className="text-muted-foreground">{e.comoCalcula}</p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
