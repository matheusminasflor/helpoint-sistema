// O período dos relatórios do Financeiro: Esta semana, Este mês ou Personalizado (dono, 2026-10-14).
import { AbasSegmentadas } from '@/components/ui/abas-segmentadas';
import type { Intervalo, TipoDePeriodo } from '@/lib/periodo-do-relatorio';

const OPCOES: { valor: TipoDePeriodo; rotulo: string }[] = [
  { valor: 'semana', rotulo: 'Esta semana' },
  { valor: 'mes', rotulo: 'Este mês' },
  { valor: 'personalizado', rotulo: 'Personalizado' },
];

export function FiltroDePeriodo({ tipo, onTipo, personalizado, onPersonalizado }: {
  tipo: TipoDePeriodo; onTipo: (t: TipoDePeriodo) => void;
  personalizado: Partial<Intervalo>; onPersonalizado: (i: Partial<Intervalo>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AbasSegmentadas opcoes={OPCOES} valor={tipo} onValor={onTipo} rotulo="Período" />
      {tipo === 'personalizado' && (
        <span className="inline-flex items-center gap-1.5 text-[14px]">
          <input type="date" aria-label="De" value={personalizado.de ?? ''} onChange={(e) => onPersonalizado({ ...personalizado, de: e.target.value })}
            className="h-9 rounded-md border border-input bg-card px-2" />
          até
          <input type="date" aria-label="Até" value={personalizado.ate ?? ''} onChange={(e) => onPersonalizado({ ...personalizado, ate: e.target.value })}
            className="h-9 rounded-md border border-input bg-card px-2" />
        </span>
      )}
    </div>
  );
}
