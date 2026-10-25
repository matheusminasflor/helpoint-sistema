// Venda por família e por região (etapa 5; `rel_venda_por_familia_e_regiao`): que linha cresce, que cidade compra,
// onde há espaço. Do faturado do Forteplus, pela data de emissão. Para o Comercial e a Diretoria — a vendedora com
// "só a minha carteira" vê só a dela (a função lê com a permissão de quem pede).
import { MapPinned } from 'lucide-react';
import { ModeloDeRelatorio, type ColunaDoRelatorio } from '@/components/relatorios/ModeloDeRelatorio';
import { usePeriodoDoRelatorio } from '@/hooks/usePeriodoDoRelatorio';
import { useQueryState } from '@/hooks/useQueryState';
import { useRelatorioNosDoisPeriodos, type VendaPorFamilia as Linha } from '@/hooks/useRelatorios';
import { agrupar } from '@/lib/relatorios-novos';
import { soma } from '@/lib/relatorio-contas';
import { formatBRL } from '@/types/financeiro';
import { cn } from '@/lib/utils';

type Por = 'familia' | 'estado' | 'cidade';
const ROTULO: Record<Por, string> = { familia: 'Família', estado: 'Estado', cidade: 'Cidade' };
interface Agrupada { grupo: string; venda: number; devolucao: number; liquido: number; anterior: number | null }

const grupoDe = (por: Por, l: Linha) => (por === 'cidade' ? `${l.cidade} (${l.estado})` : l[por]);

export default function VendaPorFamilia() {
  const periodo = usePeriodoDoRelatorio();
  const [por, setPor] = useQueryState<Por>('por', 'familia');
  const [filial, setFilial] = useQueryState<string>('filial', '');
  const { linhas, antes, carregando, erro } = useRelatorioNosDoisPeriodos<Linha>('rel_venda_por_familia_e_regiao',
    periodo.atual, periodo.anterior, { p_filial: filial || null });
  const liquidoDe = (ls: Linha[]) => soma(ls.map((l) => Number(l.venda) - Number(l.devolucao)));
  const antesPorGrupo = new Map(agrupar(antes, (l) => grupoDe(por, l), (l) => Number(l.venda) - Number(l.devolucao)).map((g) => [g.grupo, g.total]));
  const agrupadas: Agrupada[] = agrupar(linhas, (l) => grupoDe(por, l), (l) => Number(l.venda) - Number(l.devolucao)).map((g) => {
    const doGrupo = linhas.filter((l) => grupoDe(por, l) === g.grupo);
    return { grupo: g.grupo, venda: soma(doGrupo.map((l) => l.venda)), devolucao: soma(doGrupo.map((l) => l.devolucao)), liquido: g.total, anterior: antesPorGrupo.get(g.grupo) ?? null };
  });
  const total = liquidoDe(linhas);
  // Que linha cresce: a de maior alta em reais contra o período anterior — só se alguma cresceu de fato.
  const maiorAlta = agrupadas.filter((g) => g.anterior != null).sort((a, b) => (b.liquido - (b.anterior ?? 0)) - (a.liquido - (a.anterior ?? 0)))[0];
  const cresce = maiorAlta && maiorAlta.liquido > (maiorAlta.anterior ?? 0) ? maiorAlta : null;
  const colunas: ColunaDoRelatorio<Agrupada>[] = [
    { chave: 'grupo', rotulo: ROTULO[por], valor: (l) => l.grupo },
    { chave: 'liquido', rotulo: 'Venda líquida', valor: (l) => l.liquido, mostrar: (l) => formatBRL(l.liquido), direita: true },
    { chave: 'anterior', rotulo: 'No período anterior', valor: (l) => l.anterior, mostrar: (l) => (l.anterior == null ? '—' : formatBRL(l.anterior)), direita: true },
    { chave: 'variacao', rotulo: 'Variação', valor: (l) => (l.anterior ? Math.round(((l.liquido / l.anterior) - 1) * 1000) / 10 : null),
      mostrar: (l) => (l.anterior ? <span className={l.liquido < l.anterior ? 'text-status-danger' : undefined}>{`${l.liquido >= l.anterior ? '+' : ''}${(((l.liquido / l.anterior) - 1) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}</span> : 'novo'), direita: true },
    { chave: 'parte', rotulo: 'Do total', valor: (l) => (total ? Math.round((l.liquido / total) * 1000) / 10 : null),
      mostrar: (l) => (total ? `${((l.liquido / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—'), direita: true },
    { chave: 'devolucao', rotulo: 'Devolução', valor: (l) => l.devolucao, mostrar: (l) => formatBRL(l.devolucao), direita: true },
  ];
  const botoes = (opcoes: { valor: string; rotulo: string }[], atual: string, mudar: (v: string) => void, nome: string) => (
    <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label={nome}>
      {opcoes.map((o) => (
        <button key={o.valor} type="button" onClick={() => mudar(o.valor)} aria-pressed={atual === o.valor}
          className={cn('px-3 min-h-9 rounded text-[13px]', atual === o.valor ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>{o.rotulo}</button>
      ))}
    </div>
  );
  return (
    <ModeloDeRelatorio titulo="Venda por família e por região" icone={MapPinned} arquivo={`venda-por-${por}`}
      descricao="Que linha cresce, que cidade compra, onde há espaço. Do faturado (Forteplus), venda menos devolução."
      periodo={periodo} linhas={agrupadas} colunas={colunas} chave={(l) => l.grupo} carregando={carregando} erro={erro}
      vazio="Nenhuma venda importada no período."
      controles={<>
        {botoes((Object.keys(ROTULO) as Por[]).map((p) => ({ valor: p, rotulo: `Por ${ROTULO[p].toLowerCase()}` })), por, (v) => setPor(v as Por), 'Agrupar por')}
        {botoes([{ valor: '', rotulo: 'INBRAS e MF' }, { valor: 'INBRAS', rotulo: 'INBRAS' }, { valor: 'MF', rotulo: 'MF' }], filial, setFilial, 'Filial')}
      </>}
      resumo={[
        { rotulo: 'Venda líquida', valor: total, anterior: liquidoDe(antes), formatar: formatBRL, melhorQuando: 'mais' },
        { rotulo: 'Clientes que compraram', valor: soma(linhas.map((l) => l.clientes)), anterior: soma(antes.map((l) => l.clientes)), formatar: String, melhorQuando: 'mais',
          nota: 'somados por grupo: um cliente em duas famílias conta duas vezes' },
        { rotulo: `${ROTULO[por]} que mais cresce`, valor: cresce ? cresce.liquido - (cresce.anterior ?? 0) : null, formatar: formatBRL, nota: cresce ? cresce.grupo : agrupadas.length ? 'nenhuma cresceu no período' : undefined },
      ]} />
  );
}
