// Gasto por fornecedor e por setor (etapa 5; `rel_gasto_por_fornecedor`): com quem e em que a empresa gasta, mês a
// mês — as contas a pagar pela competência, sem as canceladas. Para o Financeiro e a Diretoria.
import { Store } from 'lucide-react';
import { ModeloDeRelatorio, type ColunaDoRelatorio } from '@/components/relatorios/ModeloDeRelatorio';
import { usePeriodoDoRelatorio } from '@/hooks/usePeriodoDoRelatorio';
import { useQueryState } from '@/hooks/useQueryState';
import { useRelatorioNosDoisPeriodos, type GastoPorFornecedor as Linha } from '@/hooks/useRelatorios';
import { agrupar } from '@/lib/relatorios-novos';
import { soma } from '@/lib/relatorio-contas';
import { rotuloDoSetor } from '@/lib/setores';
import { formatBRL } from '@/types/financeiro';
import { cn } from '@/lib/utils';

type Por = 'fornecedor' | 'setor' | 'categoria';
const ROTULO: Record<Por, string> = { fornecedor: 'Fornecedor', setor: 'Setor', categoria: 'Categoria' };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mes = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;
const nome = (por: Por, l: Linha) => (por === 'setor' && !l.setor.startsWith('(') ? rotuloDoSetor(l.setor) : l[por]);

interface Agrupada { chave: string; grupo: string; mes: string; total: number; contas: number }

export default function GastoPorFornecedor() {
  const periodo = usePeriodoDoRelatorio();
  const [por, setPor] = useQueryState<Por>('por', 'fornecedor');
  const { linhas, antes, carregando, erro } = useRelatorioNosDoisPeriodos<Linha>('rel_gasto_por_fornecedor', periodo.atual, periodo.anterior);
  // Uma linha por grupo e mês (o "mês a mês"); a ordem pela coluna junta o que for preciso.
  const agrupadas: Agrupada[] = agrupar(linhas, (l) => `${nome(por, l)}|${l.mes}`, (l) => Number(l.valor)).map((g) => {
    const [grupo, m] = g.grupo.split('|');
    return { chave: g.grupo, grupo, mes: m, total: g.total, contas: linhas.filter((l) => `${nome(por, l)}|${l.mes}` === g.grupo).reduce((s, l) => s + l.contas, 0) };
  });
  const total = soma(linhas.map((l) => l.valor));
  const maior = agrupar(linhas, (l) => nome(por, l), (l) => Number(l.valor))[0];
  const colunas: ColunaDoRelatorio<Agrupada>[] = [
    { chave: 'grupo', rotulo: ROTULO[por], valor: (l) => l.grupo },
    { chave: 'mes', rotulo: 'Mês', valor: (l) => l.mes, mostrar: (l) => mes(l.mes) },
    { chave: 'total', rotulo: 'Gasto', valor: (l) => l.total, mostrar: (l) => formatBRL(l.total), direita: true },
    { chave: 'parte', rotulo: 'Do total', valor: (l) => (total ? Math.round((l.total / total) * 1000) / 10 : null), mostrar: (l) => (total ? `${((l.total / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—'), direita: true },
    { chave: 'contas', rotulo: 'Contas', valor: (l) => l.contas, direita: true },
  ];
  return (
    <ModeloDeRelatorio titulo="Gasto por fornecedor e por setor" icone={Store} arquivo={`gasto-por-${por}`}
      descricao="Com quem e em que a empresa gasta, mês a mês: as contas a pagar pela competência, sem as canceladas."
      periodo={periodo} linhas={agrupadas} colunas={colunas} chave={(l) => l.chave} carregando={carregando} erro={erro}
      vazio="Nenhuma conta a pagar no período."
      controles={(
        <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Agrupar por">
          {(Object.keys(ROTULO) as Por[]).map((p) => (
            <button key={p} type="button" onClick={() => setPor(p)} aria-pressed={por === p}
              className={cn('px-3 min-h-9 rounded text-[13px]', por === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
              Por {ROTULO[p].toLowerCase()}
            </button>
          ))}
        </div>
      )}
      resumo={[
        { rotulo: 'Gasto no período', valor: total, anterior: soma(antes.map((l) => l.valor)), formatar: formatBRL, melhorQuando: 'menos' },
        { rotulo: `${ROTULO[por]} que mais pesa`, valor: maior?.total ?? null, formatar: formatBRL, nota: maior?.grupo },
        { rotulo: 'Contas', valor: soma(linhas.map((l) => l.contas)), anterior: soma(antes.map((l) => l.contas)), formatar: String },
      ]} />
  );
}
