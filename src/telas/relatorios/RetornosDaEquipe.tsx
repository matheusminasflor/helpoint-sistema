// Agenda de retornos (etapa 5): quem ligar hoje, que retorno atrasou. Os retornos em aberto que eu vejo — a vendedora,
// os dela; o gestor, os da equipe (a policy de `com_interacoes`). Para as vendedoras e o gestor.
import { PhoneCall } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ModeloDeRelatorio, type ColunaDoRelatorio } from '@/components/relatorios/ModeloDeRelatorio';
import { useRetornosDaEquipe } from '@/hooks/useComercialLancamentos';
import { useTenantPath } from '@/hooks/useTenantPath';
import { situacaoDoRetorno } from '@/lib/relatorios-novos';
import { todayISO } from '@/lib/dates';

const dia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
type Linha = ReturnType<typeof useRetornosDaEquipe>['data'] extends (infer L)[] | undefined ? L : never;

export default function RetornosDaEquipe() {
  const { data = [], isLoading, error } = useRetornosDaEquipe();
  const tenantPath = useTenantPath();
  const hoje = todayISO();
  const conta = (s: 'atrasado' | 'hoje' | 'proximo') => data.filter((l) => l.prazo && situacaoDoRetorno(l.prazo, hoje) === s).length;
  const colunas: ColunaDoRelatorio<Linha>[] = [
    { chave: 'prazo', rotulo: 'Prazo', valor: (l) => l.prazo,
      mostrar: (l) => {
        const s = l.prazo ? situacaoDoRetorno(l.prazo, hoje) : 'proximo';
        return <span className={s === 'atrasado' ? 'text-status-danger' : s === 'hoje' ? 'text-status-info' : undefined}>{l.prazo ? dia(l.prazo) : '—'}{s === 'atrasado' ? ' · atrasado' : s === 'hoje' ? ' · hoje' : ''}</span>;
      } },
    { chave: 'cliente', rotulo: 'Cliente', valor: (l) => l.cliente?.razao_social ?? l.cliente_codigo,
      mostrar: (l) => (l.cliente_codigo
        ? <Link to={tenantPath(`/comercial/clientes-parados?cliente=${encodeURIComponent(l.cliente_codigo)}`)} className="text-primary underline">{l.cliente?.razao_social ?? l.cliente_codigo}</Link>
        : '—') },
    { chave: 'cidade', rotulo: 'Cidade', valor: (l) => (l.cliente?.cidade ? `${l.cliente.cidade}${l.cliente.estado ? `/${l.cliente.estado}` : ''}` : null) },
    { chave: 'telefone', rotulo: 'Telefone', valor: (l) => l.cliente?.telefone ?? null },
    { chave: 'vendedora', rotulo: 'Quem liga', valor: (l) => l.vendedor?.full_name ?? null },
    { chave: 'obs', rotulo: 'O que ficou combinado', valor: (l) => l.observacoes },
  ];
  return (
    <ModeloDeRelatorio titulo="Agenda de retornos" icone={PhoneCall} arquivo="agenda-de-retornos"
      descricao="Quem ligar hoje e que retorno atrasou: os retornos em aberto dos lançamentos, do prazo mais antigo para o mais novo."
      linhas={data} colunas={colunas} chave={(l) => l.id} carregando={isLoading} erro={error}
      vazio="Nenhum retorno em aberto."
      resumo={[
        { rotulo: 'Atrasados', valor: conta('atrasado'), formatar: String, ruim: conta('atrasado') > 0 },
        { rotulo: 'Para hoje', valor: conta('hoje'), formatar: String },
        { rotulo: 'Próximos', valor: conta('proximo'), formatar: String },
      ]} />
  );
}
