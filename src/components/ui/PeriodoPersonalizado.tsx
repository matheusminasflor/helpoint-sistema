// Os dois campos de data do período "Personalizado" — o MESMO componente em
// todas as telas de indicadores (pedido do dono, 2026-10-03). `<input
// type="date">` nativo: o navegador já dá o calendário, sem biblioteca.
//
// Quem chama só recebe intervalo VÁLIDO (`erroDoIntervalo` em `@/lib/period`).
// Enquanto a pessoa digita, ou se ela inverte as datas, o rascunho fica aqui,
// a tela continua no intervalo anterior, e a frase diz isso.
import { useEffect, useId, useState } from 'react';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { fromLocalISODate } from '@/lib/dates';
import { erroDoIntervalo, type IntervaloDeDias } from '@/lib/period';
import { cn } from '@/lib/utils';

interface PeriodoPersonalizadoProps {
  /** O intervalo em vigor (já válido), `aaaa-mm-dd`. */
  de: string;
  ate: string;
  onChange: (intervalo: IntervaloDeDias) => void;
  className?: string;
}

const dataCurta = (iso: string) => format(fromLocalISODate(iso), 'dd/MM/yyyy');

export function PeriodoPersonalizado({ de, ate, onChange, className }: PeriodoPersonalizadoProps) {
  const id = useId();
  const [rascunho, setRascunho] = useState<IntervaloDeDias>({ de, ate });
  // O intervalo em vigor mudou por fora (outro preset, voltar no navegador): o rascunho acompanha.
  useEffect(() => { setRascunho({ de, ate }); }, [de, ate]);

  const erro = erroDoIntervalo(rascunho.de, rascunho.ate);

  const mudar = (campo: keyof IntervaloDeDias, valor: string) => {
    const novo = { ...rascunho, [campo]: valor };
    setRascunho(novo);
    if (!erroDoIntervalo(novo.de, novo.ate) && (novo.de !== de || novo.ate !== ate)) onChange(novo);
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <label htmlFor={`${id}-de`} className="text-xs text-muted-foreground">De</label>
      <Input
        id={`${id}-de`} type="date" className="h-8 w-[150px]"
        value={rascunho.de} max={rascunho.ate || undefined}
        onChange={(e) => mudar('de', e.target.value)}
        aria-invalid={!!erro}
      />
      <label htmlFor={`${id}-ate`} className="text-xs text-muted-foreground">até</label>
      <Input
        id={`${id}-ate`} type="date" className="h-8 w-[150px]"
        value={rascunho.ate} min={rascunho.de || undefined}
        onChange={(e) => mudar('ate', e.target.value)}
        aria-invalid={!!erro}
      />
      {erro && (
        <p role="alert" className="text-xs text-destructive basis-full">
          {erro} Os números continuam de {dataCurta(de)} a {dataCurta(ate)}.
        </p>
      )}
    </div>
  );
}
