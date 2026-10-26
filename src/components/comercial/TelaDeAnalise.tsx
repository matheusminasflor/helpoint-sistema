// A moldura das análises do Comercial (2026-10-14): com o fim do balde "Insights", cada análise é uma tela própria e
// ganha título, a frase do que mede e a etiqueta de onde vem o número. A lista é `@/config/comercial-insights`.
import type { ReactNode } from 'react';
import { BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { FonteDoNumero, type Fonte } from '@/components/comercial/FonteDoNumero';
import { VISOES, type Visao } from '@/config/comercial-insights';
import { ExportarATela } from '@/components/comercial/ExportarATela';

const FONTE: Partial<Record<Visao, Fonte>> = {
  vendas: 'faturado', clientes: 'faturado', bonificacao: 'faturado', cashback: 'faturado', diretrizes: 'faturado',
};

export function TelaDeAnalise({ visao, children }: { visao: Visao; children: ReactNode }) {
  const v = VISOES.find((x) => x.valor === visao)!;
  const fonte = FONTE[visao];
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title={v.rotulo} description={v.descricao} icon={BarChart3} status={fonte && <FonteDoNumero fonte={fonte} />}
        actions={<ExportarATela arquivo={`comercial-${visao}`} />} />
      {children}
    </div>
  );
}
