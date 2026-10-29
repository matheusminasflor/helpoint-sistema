// Reembolsos e adiantamentos (rodada 2, R6; `rel_reembolsos_e_adiantamentos`): cada pedido do período, quem pediu,
// quanto, em que etapa está e quando foi pago; no adiantamento, o gasto e a sobra a devolver. Para o Financeiro e a
// Diretoria.
import { HandCoins } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ModeloDeRelatorio, type ColunaDoRelatorio } from '@/components/relatorios/ModeloDeRelatorio';
import { usePeriodoDoRelatorio } from '@/hooks/usePeriodoDoRelatorio';
import { useQueryState } from '@/hooks/useQueryState';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useRelatorioNosDoisPeriodos, type ReembolsoOuAdiantamento as Linha } from '@/hooks/useRelatorios';
import { ROTULO_DA_ETAPA } from '@/config/solicitacoes';
import { soma } from '@/lib/relatorio-contas';
import { formatBRL, formatDateBR } from '@/types/financeiro';
import { AbasSegmentadas } from '@/components/ui/abas-segmentadas';

type Tipo = 'todos' | 'reembolso' | 'adiantamento';
const ROTULO: Record<Tipo, string> = { todos: 'Todos', reembolso: 'Reembolsos', adiantamento: 'Adiantamentos' };
const brl = (n: number | null) => (n == null ? '—' : formatBRL(Number(n)));

export default function ReembolsosEAdiantamentos() {
  const periodo = usePeriodoDoRelatorio();
  const tenantPath = useTenantPath();
  const [tipo, setTipo] = useQueryState<Tipo>('tipo', 'todos');
  const r = useRelatorioNosDoisPeriodos<Linha>('rel_reembolsos_e_adiantamentos', periodo.atual, periodo.anterior);
  const doTipo = (ls: Linha[]) => ls.filter((l) => tipo === 'todos' || l.tipo === tipo);
  const linhas = doTipo(r.linhas);
  const antes = doTipo(r.antes);
  const aDevolver = soma(linhas.filter((l) => l.tipo === 'adiantamento').map((l) => l.sobra ?? 0));
  const colunas: ColunaDoRelatorio<Linha>[] = [
    { chave: 'numero', rotulo: 'Pedido', valor: (l) => l.numero, mostrar: (l) => <Link to={tenantPath(`/solicitacoes/${l.id}`)} className="text-primary underline">#{l.numero}</Link> },
    { chave: 'pedido_em', rotulo: 'Pedido em', valor: (l) => l.pedido_em, mostrar: (l) => formatDateBR(l.pedido_em) },
    { chave: 'tipo', rotulo: 'Tipo', valor: (l) => (l.tipo === 'reembolso' ? 'Reembolso' : 'Adiantamento') },
    { chave: 'pessoa', rotulo: 'Quem pediu', valor: (l) => l.pessoa },
    { chave: 'titulo', rotulo: 'Para quê', valor: (l) => l.titulo },
    { chave: 'valor', rotulo: 'Valor', valor: (l) => l.valor, mostrar: (l) => brl(l.valor), direita: true },
    { chave: 'gasto', rotulo: 'Gasto', valor: (l) => l.gasto, mostrar: (l) => brl(l.gasto), direita: true },
    { chave: 'sobra', rotulo: 'A devolver', valor: (l) => l.sobra, mostrar: (l) => brl(l.sobra), direita: true },
    { chave: 'etapa', rotulo: 'Etapa', valor: (l) => ROTULO_DA_ETAPA[l.etapa as keyof typeof ROTULO_DA_ETAPA] ?? l.etapa },
    { chave: 'pago_em', rotulo: 'Pago em', valor: (l) => l.pago_em, mostrar: (l) => (l.pago_em ? formatDateBR(l.pago_em) : '—') },
  ];
  return (
    <ModeloDeRelatorio titulo="Reembolsos e adiantamentos" icone={HandCoins} arquivo="reembolsos-e-adiantamentos"
      descricao="Cada pedido de reembolso ou adiantamento feito no período: quem pediu, quanto, em que etapa está e quando foi pago."
      periodo={periodo} linhas={linhas} colunas={colunas} chave={(l) => l.id} carregando={r.carregando} erro={r.erro}
      vazio="Nenhum reembolso ou adiantamento pedido no período."
      controles={(
        <AbasSegmentadas rotulo="Tipo de pedido" valor={tipo} onValor={setTipo}
          opcoes={(Object.keys(ROTULO) as Tipo[]).map((t) => ({ valor: t, rotulo: ROTULO[t] }))} />
      )}
      resumo={[
        { rotulo: 'Pedido no período', valor: soma(linhas.map((l) => l.valor ?? 0)), anterior: soma(antes.map((l) => l.valor ?? 0)), formatar: formatBRL, melhorQuando: 'menos' },
        { rotulo: 'Pedidos', valor: linhas.length, anterior: antes.length, formatar: String },
        { rotulo: 'Já pago', valor: soma(linhas.filter((l) => l.pago_em).map((l) => l.valor ?? 0)), formatar: formatBRL },
        { rotulo: 'Sobra a devolver (adiantamentos)', valor: aDevolver, formatar: formatBRL, ruim: aDevolver > 0 },
      ]} />
  );
}
