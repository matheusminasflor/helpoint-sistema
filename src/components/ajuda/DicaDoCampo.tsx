// A explicação de um campo de formulário ao passar o mouse (dono, 2026-10-09: "cada campo deveria ter um
// tutorial para saber o que o campo significa — 'Depende de' não explica o que seria"). Mesmo desenho de
// `ExplicacaoDoIndicador`, com um texto só.
import { Info } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';

export function DicaDoCampo({ campo, texto }: { campo: string; texto: string }) {
  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button type="button" className="inline-flex items-center text-muted-foreground hover:text-foreground cursor-help align-middle"
          aria-label={`O que é: ${campo}`}>
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-72 text-[13px] space-y-1" side="top">
        <p className="font-semibold text-foreground">{campo}</p>
        <p className="text-muted-foreground">{texto}</p>
      </HoverCardContent>
    </HoverCard>
  );
}
