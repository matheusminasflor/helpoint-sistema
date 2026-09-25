// O botão "Simplificado | Analítico" da regra da casa — ver
// `src/lib/visao-relatorio.ts` para o porquê e para onde a escolha é
// guardada. Um componente só, para que a décima tela a ganhar as duas
// visões não invente a décima aparência do mesmo botão.
//
// Mesmo desenho do grupo de faixas que a ficha já usa em "Nunca comprou":
// botões grudados dentro de uma borda, o ativo em `default` e o outro em
// `ghost`. Não é uma aparência nova — é a que já existe nesta tela.
// O gancho que guarda a escolha mora em `@/hooks/useVisaoRelatorio` — este
// arquivo exporta SÓ componente, para não perder o Fast Refresh.
import { BarChart3, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VisaoRelatorio } from '@/lib/visao-relatorio';

const OPCOES = [
  { valor: 'simplificado' as const, rotulo: 'Simplificado', Icone: BarChart3 },
  { valor: 'analitico' as const, rotulo: 'Analítico', Icone: Table2 },
];

export function SeletorVisao({ visao, onChange }: { visao: VisaoRelatorio; onChange: (v: VisaoRelatorio) => void }) {
  return (
    <div className="flex rounded-md border border-border overflow-hidden" role="group" aria-label="Visão do relatório">
      {OPCOES.map(({ valor, rotulo, Icone }) => (
        <Button
          key={valor}
          type="button"
          variant={visao === valor ? 'default' : 'ghost'}
          size="sm"
          className="rounded-none h-7 px-2.5 text-[11px]"
          aria-pressed={visao === valor}
          onClick={() => onChange(valor)}
        >
          <Icone className="w-3 h-3 mr-1" aria-hidden="true" />
          {rotulo}
        </Button>
      ))}
    </div>
  );
}
