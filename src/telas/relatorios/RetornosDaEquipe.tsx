// Agenda de retornos (etapa 5): quem ligar hoje, que retorno atrasou. Os retornos em aberto que eu vejo — a vendedora,
// os dela; o gestor, os da equipe (a policy de `com_interacoes`). Para as vendedoras e o gestor.
// Retorno de quem saiu do Comercial (revisão de 2026-11-12) não conta como atrasado: espera o gestor, que vê com quem
// está a carteira do cliente hoje e tira o retorno da agenda.
import { useMemo } from 'react';
import { PhoneCall } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ModeloDeRelatorio, type ColunaDoRelatorio } from '@/components/relatorios/ModeloDeRelatorio';
import { retornoSemDono, useRetornosDaEquipe, useTirarRetornosDaAgenda } from '@/hooks/useComercialLancamentos';
import { useCarteiraMembros } from '@/hooks/useComercialCarteirasMetas';
import { usePodeGerirCarteiras } from '@/hooks/useAccessProfiles';
import { useTenantPath } from '@/hooks/useTenantPath';
import { situacaoDoRetorno } from '@/lib/relatorios-novos';
import { todayISO } from '@/lib/dates';

const dia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
type Linha = ReturnType<typeof useRetornosDaEquipe>['data'] extends (infer L)[] | undefined ? L : never;

export default function RetornosDaEquipe() {
  const { data = [], isLoading, error } = useRetornosDaEquipe();
  const { data: membros = [] } = useCarteiraMembros();
  const gestor = usePodeGerirCarteiras();
  const tirar = useTirarRetornosDaAgenda();
  const tenantPath = useTenantPath();
  const hoje = todayISO();
  const comCarteira = useMemo(() => new Set(membros.map((m) => m.user_id)), [membros]);
  const donaDaCarteira = (carteira: string | null | undefined) => {
    const daCarteira = membros.filter((m) => m.carteira === carteira);
    return (daCarteira.find((m) => m.responsavel) ?? daCarteira[0])?.nome ?? null;
  };
  const semDono = data.filter((l) => retornoSemDono(l, comCarteira));
  const conta = (s: 'atrasado' | 'hoje' | 'proximo') =>
    data.filter((l) => l.prazo && !retornoSemDono(l, comCarteira) && situacaoDoRetorno(l.prazo, hoje) === s).length;
  const colunas: ColunaDoRelatorio<Linha>[] = [
    { chave: 'prazo', rotulo: 'Prazo', valor: (l) => l.prazo,
      mostrar: (l) => {
        if (retornoSemDono(l, comCarteira)) return <span className="text-muted-foreground">{l.prazo ? dia(l.prazo) : '—'} · para o gestor</span>;
        const s = l.prazo ? situacaoDoRetorno(l.prazo, hoje) : 'proximo';
        return <span className={s === 'atrasado' ? 'text-status-danger' : s === 'hoje' ? 'text-status-info' : undefined}>{l.prazo ? dia(l.prazo) : '—'}{s === 'atrasado' ? ' · atrasado' : s === 'hoje' ? ' · hoje' : ''}</span>;
      } },
    { chave: 'cliente', rotulo: 'Cliente', valor: (l) => l.cliente?.razao_social ?? l.cliente_codigo,
      mostrar: (l) => (l.cliente_codigo
        ? <Link to={tenantPath(`/comercial/clientes-parados?cliente=${encodeURIComponent(l.cliente_codigo)}`)} className="text-primary underline">{l.cliente?.razao_social ?? l.cliente_codigo}</Link>
        : '—') },
    { chave: 'cidade', rotulo: 'Cidade', valor: (l) => (l.cliente?.cidade ? `${l.cliente.cidade}${l.cliente.estado ? `/${l.cliente.estado}` : ''}` : null) },
    { chave: 'telefone', rotulo: 'Telefone', valor: (l) => l.cliente?.telefone ?? null },
    { chave: 'vendedora', rotulo: 'Quem liga', valor: (l) => l.vendedor?.full_name ?? null,
      mostrar: (l) => {
        if (!retornoSemDono(l, comCarteira)) return l.vendedor?.full_name ?? '—';
        const dona = donaDaCarteira(l.cliente?.carteira);
        return (
          <span>
            {l.vendedor?.full_name ?? '—'} <span className="text-status-warning">· saiu do Comercial</span>
            {dona && <span className="block text-[12px] text-muted-foreground">a carteira do cliente hoje é de {dona}</span>}
          </span>
        );
      } },
    { chave: 'obs', rotulo: 'O que ficou combinado', valor: (l) => l.observacoes },
  ];
  return (
    <ModeloDeRelatorio titulo="Agenda de retornos" icone={PhoneCall} arquivo="agenda-de-retornos"
      descricao="Quem ligar hoje e que retorno atrasou: os retornos em aberto dos lançamentos, do prazo mais antigo para o mais novo."
      acima={gestor && semDono.length > 0 ? (
        <div className="rounded-lg border border-status-warning/40 bg-status-warning/5 p-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[14px]">
            <strong>{semDono.length} {semDono.length === 1 ? 'retorno' : 'retornos'} de quem saiu do Comercial</strong>{' '}
            ({[...new Set(semDono.map((l) => l.vendedor?.full_name ?? '—'))].join(', ')}). Ninguém vai ligar: combine com a dona da
            carteira de cada cliente e tire da agenda. O contato continua contando nos indicadores.
          </p>
          <Button size="sm" variant="outline" disabled={tirar.isPending} onClick={() => tirar.mutate(semDono.map((l) => l.id))}>
            Tirar os {semDono.length} da agenda
          </Button>
        </div>
      ) : undefined}
      linhas={data} colunas={colunas} chave={(l) => l.id} carregando={isLoading} erro={error}
      vazio="Nenhum retorno em aberto."
      resumo={[
        { rotulo: 'Atrasados', valor: conta('atrasado'), formatar: String, ruim: conta('atrasado') > 0 },
        { rotulo: 'Para hoje', valor: conta('hoje'), formatar: String },
        { rotulo: 'Próximos', valor: conta('proximo'), formatar: String },
        ...(semDono.length ? [{ rotulo: 'De quem saiu do Comercial', valor: semDono.length, formatar: String }] : []),
      ]} />
  );
}
