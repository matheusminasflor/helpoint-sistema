// Painel do Comercial (revisão aprovada pelo dono em 2026-11-12, https://claude.ai/artifact/DogLjeM9MuJUzFt2H7ALFV seção
// 7.2): o que a vendedora vê ao entrar. Três perguntas, nesta ordem: quanto vendi contra a meta, quanto tenho de comissão
// e o que fazer hoje. Nenhuma conta nova: a venda e a meta são as de Metas e desempenho (`com_painel_do_gestor`), a
// comissão é `com_comissao`, os retornos e os devolvidos vêm das mesmas consultas da Agenda e dos Pedidos.
// Leis de UX: Von Restorff (só a pendência tem borda vermelha), gradiente de meta (quanto falta e quanto já é garantido),
// proximidade (cada pendência abre o que resolve). Sem janela por cima: a ajuda é o "i" de cada número.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TresRespostas } from '@/components/comercial/TresRespostas';
import { CartaoDaComissao } from '@/components/comercial/CartaoDaComissao';
import { useAuth } from '@/contexts/AuthContext';
import { usePodeGerirCarteiras } from '@/hooks/useAccessProfiles';
import { retornoSemDono, usePainelDoGestor, useRetornosDaEquipe } from '@/hooks/useComercialLancamentos';
import { useCarteiraMembros } from '@/hooks/useComercialCarteirasMetas';
import { useChecklists } from '@/hooks/usePedidosChecklist';
import { useTenantPath } from '@/hooks/useTenantPath';
import { competenciaAtual, competenciaCurta } from '@/lib/competencia-comercial';
import { situacaoDoRetorno } from '@/lib/relatorios-novos';
import { ultimoDiaDoMes } from '@/lib/semanas-dos-artistas';
import { todayISO } from '@/lib/dates';
import { cn } from '@/lib/utils';

const eValor = (m: string) => m === 'valor_vendas';
const diaCurto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export default function ComercialPainelDoDia() {
  const { user } = useAuth();
  const gestor = usePodeGerirCarteiras();
  const tenantPath = useTenantPath();
  const competencia = competenciaAtual();
  const de = competencia;
  const ate = ultimoDiaDoMes(competencia);
  const hoje = todayISO();
  const { data: painel = [], isLoading } = usePainelDoGestor(competencia, null);
  const { data: retornos = [] } = useRetornosDaEquipe();
  const { data: checklists = [] } = useChecklists();
  const { data: membros = [] } = useCarteiraMembros();
  const comCarteira = useMemo(() => new Set(membros.map((m) => m.user_id)), [membros]);

  const porVendedora = useMemo(() => {
    const mapa = new Map<string, { nome: string; carteira: string | null; linhas: typeof painel }>();
    for (const l of painel) {
      const v = mapa.get(l.vendedor_id) ?? { nome: l.vendedor_nome, carteira: l.carteira, linhas: [] };
      v.linhas.push(l);
      mapa.set(l.vendedor_id, v);
    }
    // A vendedora vê só ela (o banco já recorta); o gestor, a equipe. A dona dos números vem primeiro.
    return [...mapa.entries()].sort(([a], [b]) => Number(b === user?.id) - Number(a === user?.id));
  }, [painel, user?.id]);

  // O que fazer hoje: o devolvido pelo Financeiro primeiro (trava a venda), depois o retorno atrasado e o de hoje.
  const devolvidos = checklists.filter((c) => c.situacao === 'Recusado' && (gestor || c.vendedor_id === user?.id));
  // Retorno de quem saiu do Comercial não é "ligar hoje" de ninguém: vira um aviso só, para o gestor (Agenda de retornos).
  const vencidos = retornos.filter((r) => r.prazo && situacaoDoRetorno(r.prazo, hoje) !== 'proximo');
  const paraLigar = vencidos.filter((r) => !retornoSemDono(r, comCarteira) && (gestor || r.vendedor_id === user?.id));
  const semDono = gestor ? vencidos.filter((r) => retornoSemDono(r, comCarteira)) : [];
  const pendencias = devolvidos.length + paraLigar.length;

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Painel do Comercial" icon={LayoutDashboard}
        description={`${competenciaCurta(competencia)}: a venda contra a meta, a comissão e o que fazer hoje.`} />
      <div className="px-4 lg:px-8 pb-6 space-y-4">
        <Card className={cn('p-4 space-y-2', pendencias > 0 && 'border-2 border-status-danger')}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">O que fazer hoje</h2>
            <span className={cn('text-2xl font-extrabold tabular-nums', pendencias ? 'text-status-danger' : 'text-status-success')}>{pendencias}</span>
          </div>
          {pendencias === 0 ? (
            <p className="text-[14px] text-status-success">Nada pendente: nenhum retorno vencido e nenhum pedido devolvido.</p>
          ) : (
            <ul className="divide-y divide-border text-[14px] max-h-80 overflow-y-auto">
              {devolvidos.map((c) => (
                <li key={c.id} className="py-1.5 flex flex-wrap items-baseline justify-between gap-2">
                  <Link to={tenantPath(`/comercial/lancamentos?corrigir=${c.interacao_id}`)} className="text-primary underline">
                    Corrigir o pedido {c.protocolo} · {c.cliente_nome}
                  </Link>
                  <span className="text-[12px] badge-warning">devolvido pelo Financeiro</span>
                </li>
              ))}
              {paraLigar.map((r) => {
                const atrasado = situacaoDoRetorno(r.prazo!, hoje) === 'atrasado';
                return (
                  <li key={r.id} className="py-1.5 flex flex-wrap items-baseline justify-between gap-2">
                    {r.cliente_codigo ? (
                      <Link to={tenantPath(`/comercial/lancamentos?cliente=${encodeURIComponent(r.cliente_codigo)}`)} className="text-primary underline">
                        Ligar para {r.cliente?.razao_social ?? r.cliente_codigo}
                      </Link>
                    ) : <span>Retorno sem cliente</span>}
                    <span className={cn('text-[12px]', atrasado ? 'text-status-danger' : 'text-status-info')}>
                      {atrasado ? `atrasado desde ${diaCurto(r.prazo!)}` : 'hoje'}{gestor && r.vendedor?.full_name ? ` · ${r.vendedor.full_name}` : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {semDono.length > 0 && (
            <p className="text-[13px] text-muted-foreground">
              {semDono.length} {semDono.length === 1 ? 'retorno' : 'retornos'} de quem saiu do Comercial esperam você na{' '}
              <Link to={tenantPath('/comercial/agenda-de-retornos')} className="text-primary underline">Agenda de retornos</Link>.
            </p>
          )}
        </Card>

        {isLoading ? <Skeleton className="h-48 w-full" /> : (
          <div className="grid gap-4 xl:grid-cols-2">
            {porVendedora.map(([id, v]) => (
              <Card key={id} className="p-4 space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold">{id === user?.id ? 'Você' : v.nome}</h2>
                  <span className="text-[13px] text-muted-foreground">{v.carteira ? `Carteira ${v.carteira}` : 'Sem carteira'}</span>
                </div>
                {v.carteira && (
                  <TresRespostas carteiras={v.carteira.split(', ')} competencia={competencia} intervalo={null} de={de} ate={ate}
                    vendido={v.linhas.find((l) => eValor(l.metrica))?.realizado ?? 0}
                    meta={v.linhas.find((l) => eValor(l.metrica))?.meta ?? null}
                    indicadores={v.linhas.filter((l) => !eValor(l.metrica) && l.metrica !== 'pct_meta' && l.cor !== 'sem_meta').length}
                    abaixoDaMeta={v.linhas.filter((l) => !eValor(l.metrica) && l.metrica !== 'pct_meta' && (l.cor === 'vermelho' || l.cor === 'amarelo')).length} />
                )}
                <CartaoDaComissao pessoaId={id} de={de} ate={ate} />
              </Card>
            ))}
          </div>
        )}
        {/* Quem atende o CRM não tem carteira: a comissão dela aparece aqui, sozinha. */}
        {!porVendedora.some(([id]) => id === user?.id) && <CartaoDaComissao pessoaId={user?.id} de={de} ate={ate} />}
        <p className="text-[13px] text-muted-foreground">
          Os detalhes estão em <Link to={tenantPath('/comercial/indicadores')} className="underline">Indicadores</Link>,{' '}
          <Link to={tenantPath('/comercial/agenda-de-retornos')} className="underline">Agenda de retornos</Link> e{' '}
          <Link to={tenantPath('/comercial/pedidos')} className="underline">Pedidos</Link>.
        </p>
      </div>
    </div>
  );
}
