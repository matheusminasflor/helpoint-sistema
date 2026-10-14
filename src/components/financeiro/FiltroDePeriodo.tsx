// O período dos relatórios do Financeiro: Esta semana, Este mês ou Personalizado (dono, 2026-10-14).
import { cn } from '@/lib/utils';
import type { Intervalo, TipoDePeriodo } from '@/lib/periodo-do-relatorio';

const OPCOES: { tipo: TipoDePeriodo; rotulo: string }[] = [
  { tipo: 'semana', rotulo: 'Esta semana' },
  { tipo: 'mes', rotulo: 'Este mês' },
  { tipo: 'personalizado', rotulo: 'Personalizado' },
];

export function FiltroDePeriodo({ tipo, onTipo, personalizado, onPersonalizado }: {
  tipo: TipoDePeriodo; onTipo: (t: TipoDePeriodo) => void;
  personalizado: Partial<Intervalo>; onPersonalizado: (i: Partial<Intervalo>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {OPCOES.map((o) => (
        <button key={o.tipo} type="button" onClick={() => onTipo(o.tipo)}
          className={cn('px-3 py-1 text-xs font-medium rounded-full transition-colors',
            tipo === o.tipo ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
          {o.rotulo}
        </button>
      ))}
      {tipo === 'personalizado' && (
        <span className="inline-flex items-center gap-1.5 text-xs">
          <input type="date" aria-label="De" value={personalizado.de ?? ''} onChange={(e) => onPersonalizado({ ...personalizado, de: e.target.value })}
            className="h-7 rounded-md border border-border bg-background px-2" />
          até
          <input type="date" aria-label="Até" value={personalizado.ate ?? ''} onChange={(e) => onPersonalizado({ ...personalizado, ate: e.target.value })}
            className="h-7 rounded-md border border-border bg-background px-2" />
        </span>
      )}
    </div>
  );
}
