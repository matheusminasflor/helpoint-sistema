// As etapas como QUEM PEDIU vê (rodada 3, decisão 4): Recebido → Com o setor → Concluído, e a pílula do estado
// ("Esperando você" quando falta algo dele). O que passou fica verde, o de agora azul (Gradiente de meta: a pessoa vê
// quanto falta). A aprovação do gestor não aparece — mora dentro de "Com o setor".
import { cn } from '@/lib/utils';
import { ETAPAS_PARA_QUEM_PEDIU, type EstadoParaQuemPediu } from '@/lib/estado-para-quem-pediu';

export function EtapasParaQuemPediu({ estado, className }: { estado: EstadoParaQuemPediu; className?: string }) {
  const rotulos = ETAPAS_PARA_QUEM_PEDIU.map((r, i) => (i === 1 && estado.etapa >= 1 && estado.familia === 'setor' ? estado.rotulo : r));
  return (
    <div className={cn('space-y-2', className)}>
      <span className={cn('estado', `estado-${estado.familia}`)}>{estado.rotulo}</span>
      <ol className="grid grid-cols-3 gap-1.5" aria-label="Andamento">
        {rotulos.map((r, i) => {
          const feito = i < estado.etapa || (i === 2 && estado.etapa === 2);
          const agora = i === estado.etapa && estado.etapa < 2;
          return (
            <li key={i} className="min-w-0" aria-current={agora ? 'step' : undefined}>
              <span className={cn('block h-1.5 rounded-full',
                feito ? 'bg-[hsl(var(--estado-concluido-ponto))]' : agora ? 'bg-[hsl(var(--estado-setor-ponto))]' : 'bg-secondary')} />
              <span className={cn('block text-[12px] mt-1 truncate',
                feito ? 'text-[hsl(var(--estado-concluido-fg))]' : agora ? 'text-[hsl(var(--estado-setor-fg))] font-semibold' : 'text-muted-foreground')}>
                {r}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
