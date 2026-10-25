// Ciclo da compra (etapa 5; `rel_ciclo_da_compra`): quantos dias de pedido até a nota, em que etapa trava e qual
// aprovador demora. Para Compras e a Diretoria.
import { Timer } from 'lucide-react';
import { ModeloDeRelatorio, type ColunaDoRelatorio } from '@/components/relatorios/ModeloDeRelatorio';
import { usePeriodoDoRelatorio } from '@/hooks/usePeriodoDoRelatorio';
import { useRelatorioNosDoisPeriodos, type CicloDaCompra as Linha } from '@/hooks/useRelatorios';
import { media } from '@/lib/relatorio-contas';
import { maisLentoPorGrupo } from '@/lib/relatorios-novos';
import { rotuloDoSetor } from '@/lib/setores';

const dias = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} d`;
const dia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export default function CicloDaCompra() {
  const periodo = usePeriodoDoRelatorio();
  const { linhas, antes, carregando, erro } = useRelatorioNosDoisPeriodos<Linha>('rel_ciclo_da_compra', periodo.atual, periodo.anterior);
  const paradas = linhas.filter((l) => l.parada_ha != null && l.parada_ha > 3);
  const lento = maisLentoPorGrupo(linhas, (l) => l.aprovador, (l) => l.dias_ate_aprovar);
  const colunas: ColunaDoRelatorio<Linha>[] = [
    { chave: 'numero', rotulo: '#', valor: (l) => l.numero },
    { chave: 'produto', rotulo: 'Compra', valor: (l) => l.produto },
    { chave: 'setor', rotulo: 'Setor', valor: (l) => rotuloDoSetor(l.setor) },
    { chave: 'pedida', rotulo: 'Pedida', valor: (l) => l.pedida_em, mostrar: (l) => dia(l.pedida_em) },
    { chave: 'aprovador', rotulo: 'Quem aprovou', valor: (l) => l.aprovador },
    { chave: 'aprovar', rotulo: 'Até aprovar', valor: (l) => l.dias_ate_aprovar, mostrar: (l) => (l.dias_ate_aprovar == null ? '—' : dias(l.dias_ate_aprovar)), direita: true },
    { chave: 'pagar', rotulo: 'Até pagar', valor: (l) => l.dias_ate_pagar, mostrar: (l) => (l.dias_ate_pagar == null ? '—' : dias(l.dias_ate_pagar)), direita: true },
    { chave: 'nota', rotulo: 'Até a nota', valor: (l) => l.dias_ate_nota, mostrar: (l) => (l.dias_ate_nota == null ? '—' : dias(l.dias_ate_nota)), direita: true },
    { chave: 'etapa', rotulo: 'Agora', valor: (l) => l.etapa,
      mostrar: (l) => <span className={l.parada_ha != null && l.parada_ha > 3 ? 'text-status-danger' : undefined}>{l.etapa}{l.parada_ha != null ? ` · há ${dias(l.parada_ha)}` : ''}</span> },
  ];
  return (
    <ModeloDeRelatorio titulo="Ciclo da compra" icone={Timer} arquivo="ciclo-da-compra"
      descricao="Quantos dias do pedido até a nota, em que etapa as compras travam e qual aprovador demora."
      periodo={periodo} linhas={linhas} colunas={colunas} chave={(l) => l.id} carregando={carregando} erro={erro}
      vazio="Nenhuma compra pedida no período."
      resumo={[
        { rotulo: 'Compras pedidas', valor: linhas.length, anterior: antes.length, formatar: String, melhorQuando: 'neutro' },
        { rotulo: 'Média até aprovar', valor: media(linhas.map((l) => l.dias_ate_aprovar)), anterior: media(antes.map((l) => l.dias_ate_aprovar)), formatar: dias, melhorQuando: 'menos',
          nota: lento ? `mais lento: ${lento.grupo} (${dias(lento.media)})` : undefined },
        { rotulo: 'Média até a nota', valor: media(linhas.map((l) => l.dias_ate_nota)), anterior: media(antes.map((l) => l.dias_ate_nota)), formatar: dias, melhorQuando: 'menos' },
        { rotulo: 'Paradas há mais de 3 dias', valor: paradas.length, formatar: String, ruim: paradas.length > 0, melhorQuando: 'menos' },
      ]} />
  );
}
