// Consumo do estoque de suprimentos (rodada 2, R6; `rel_consumo_do_estoque`): o que saiu no período, por produto ou
// por quem retirou. Entrada (compra, Caixinha, ajuste) não é consumo. Para Compras, quem cuida do estoque e a Diretoria.
import { PackageMinus } from 'lucide-react';
import { ModeloDeRelatorio, type ColunaDoRelatorio } from '@/components/relatorios/ModeloDeRelatorio';
import { usePeriodoDoRelatorio } from '@/hooks/usePeriodoDoRelatorio';
import { useQueryState } from '@/hooks/useQueryState';
import { useRelatorioNosDoisPeriodos, type ConsumoDoEstoque as Linha } from '@/hooks/useRelatorios';
import { soma } from '@/lib/relatorio-contas';
import { formatDateBR } from '@/types/financeiro';
import { AbasSegmentadas } from '@/components/ui/abas-segmentadas';

type Por = 'produto' | 'pessoa';
interface Agrupada { chave: string; grupo: string; detalhe: string; quantidade: number; retiradas: number; ultima: string }
const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/** Junta as linhas (produto × pessoa) pelo produto ou pela pessoa; o "detalhe" diz quem/o quê mais pesou. */
function agrupar(linhas: Linha[], por: Por): Agrupada[] {
  const m = new Map<string, Agrupada & { maior: number }>();
  for (const l of linhas) {
    const chave = por === 'produto' ? l.produto_id : l.pessoa;
    const g = m.get(chave) ?? { chave, grupo: por === 'produto' ? `${l.produto} (${l.unidade})` : l.pessoa, detalhe: '', quantidade: 0, retiradas: 0, ultima: l.ultima, maior: -1 };
    g.quantidade += Number(l.quantidade);
    g.retiradas += l.retiradas;
    if (l.ultima > g.ultima) g.ultima = l.ultima;
    if (Number(l.quantidade) > g.maior) { g.maior = Number(l.quantidade); g.detalhe = por === 'produto' ? l.pessoa : `${l.produto} (${l.unidade})`; }
    m.set(chave, g);
  }
  return [...m.values()].sort((a, b) => b.quantidade - a.quantidade);
}

export default function ConsumoDoEstoque() {
  const periodo = usePeriodoDoRelatorio();
  const [por, setPor] = useQueryState<Por>('por', 'produto');
  const r = useRelatorioNosDoisPeriodos<Linha>('rel_consumo_do_estoque', periodo.atual, periodo.anterior);
  const linhas = agrupar(r.linhas, por);
  const colunas: ColunaDoRelatorio<Agrupada>[] = [
    { chave: 'grupo', rotulo: por === 'produto' ? 'Produto' : 'Quem retirou', valor: (l) => l.grupo },
    { chave: 'quantidade', rotulo: 'Quantidade', valor: (l) => l.quantidade, mostrar: (l) => num(l.quantidade), direita: true },
    { chave: 'retiradas', rotulo: 'Retiradas', valor: (l) => l.retiradas, direita: true },
    { chave: 'detalhe', rotulo: por === 'produto' ? 'Quem mais retirou' : 'O que mais retirou', valor: (l) => l.detalhe },
    { chave: 'ultima', rotulo: 'Última', valor: (l) => l.ultima, mostrar: (l) => formatDateBR(l.ultima) },
  ];
  return (
    <ModeloDeRelatorio titulo="Consumo do estoque de suprimentos" icone={PackageMinus} arquivo={`consumo-do-estoque-por-${por}`}
      descricao="O que saiu do estoque de suprimentos no período, por produto ou por quem retirou. Compra e reposição não entram."
      periodo={periodo} linhas={linhas} colunas={colunas} chave={(l) => l.chave} carregando={r.carregando} erro={r.erro}
      vazio="Nenhuma retirada do estoque no período."
      controles={(
        <AbasSegmentadas rotulo="Agrupar por" valor={por} onValor={setPor}
          opcoes={[{ valor: 'produto', rotulo: 'Por produto' }, { valor: 'pessoa', rotulo: 'Por pessoa' }]} />
      )}
      resumo={[
        { rotulo: 'Retiradas no período', valor: soma(r.linhas.map((l) => l.retiradas)), anterior: soma(r.antes.map((l) => l.retiradas)), formatar: String, melhorQuando: 'menos' },
        { rotulo: 'Produtos diferentes', valor: new Set(r.linhas.map((l) => l.produto_id)).size, formatar: String },
        { rotulo: 'Pessoas que retiraram', valor: new Set(r.linhas.map((l) => l.pessoa)).size, formatar: String },
      ]} />
  );
}
