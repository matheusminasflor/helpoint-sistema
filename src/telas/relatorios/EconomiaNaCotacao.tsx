// Economia na cotação (etapa 5; `rel_economia_na_cotacao`): quanto se economizou escolhendo entre os orçamentos — o
// escolhido contra o mais caro. Só as compras aprovadas com dois orçamentos ou mais. Para Compras e a Diretoria.
import { PiggyBank } from 'lucide-react';
import { ModeloDeRelatorio, type ColunaDoRelatorio } from '@/components/relatorios/ModeloDeRelatorio';
import { usePeriodoDoRelatorio } from '@/hooks/usePeriodoDoRelatorio';
import { useRelatorioNosDoisPeriodos, type EconomiaNaCotacao as Linha } from '@/hooks/useRelatorios';
import { soma } from '@/lib/relatorio-contas';
import { rotuloDoSetor } from '@/lib/setores';
import { formatBRL } from '@/types/financeiro';

const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const percentual = (ls: Linha[]) => {
  const caro = soma(ls.map((l) => l.mais_caro));
  return caro > 0 ? (soma(ls.map((l) => l.economia)) / caro) * 100 : null;
};

export default function EconomiaNaCotacao() {
  const periodo = usePeriodoDoRelatorio();
  const { linhas, antes, carregando, erro } = useRelatorioNosDoisPeriodos<Linha>('rel_economia_na_cotacao', periodo.atual, periodo.anterior);
  const colunas: ColunaDoRelatorio<Linha>[] = [
    { chave: 'numero', rotulo: '#', valor: (l) => l.numero },
    { chave: 'produto', rotulo: 'Compra', valor: (l) => l.produto },
    { chave: 'setor', rotulo: 'Setor', valor: (l) => rotuloDoSetor(l.setor) },
    { chave: 'fornecedor', rotulo: 'Fornecedor escolhido', valor: (l) => l.fornecedor },
    { chave: 'orcamentos', rotulo: 'Orçamentos', valor: (l) => l.orcamentos, direita: true },
    { chave: 'escolhido', rotulo: 'Escolhido', valor: (l) => Number(l.escolhido), mostrar: (l) => formatBRL(Number(l.escolhido)), direita: true },
    { chave: 'barato', rotulo: 'Mais barato', valor: (l) => Number(l.mais_barato), mostrar: (l) => formatBRL(Number(l.mais_barato)), direita: true },
    { chave: 'caro', rotulo: 'Mais caro', valor: (l) => Number(l.mais_caro), mostrar: (l) => formatBRL(Number(l.mais_caro)), direita: true },
    { chave: 'economia', rotulo: 'Economia', valor: (l) => Number(l.economia), mostrar: (l) => <b>{formatBRL(Number(l.economia))}</b>, direita: true },
  ];
  const naoFoiOMaisBarato = linhas.filter((l) => Number(l.escolhido) > Number(l.mais_barato)).length;
  return (
    <ModeloDeRelatorio titulo="Economia na cotação" icone={PiggyBank} arquivo="economia-na-cotacao"
      descricao="Quanto se economizou escolhendo entre os orçamentos: o escolhido contra o mais caro."
      periodo={periodo} linhas={linhas} colunas={colunas} chave={(l) => l.id} carregando={carregando} erro={erro}
      vazio="Nenhuma compra aprovada com dois orçamentos ou mais no período."
      resumo={[
        { rotulo: 'Economia', valor: soma(linhas.map((l) => l.economia)), anterior: soma(antes.map((l) => l.economia)), formatar: formatBRL, melhorQuando: 'mais' },
        { rotulo: 'Sobre o mais caro', valor: percentual(linhas), anterior: percentual(antes), formatar: pct, melhorQuando: 'mais' },
        { rotulo: 'Compras com cotação', valor: linhas.length, anterior: antes.length, formatar: String, melhorQuando: 'neutro',
          nota: naoFoiOMaisBarato ? `${naoFoiOMaisBarato} não ficaram com o mais barato` : undefined },
      ]} />
  );
}
