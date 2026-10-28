// O Resumo do diretor no CELULAR (dono, 2026-10-28; proposta "Helpoint no celular", aprovada): uma tela, o que pede ação
// primeiro. Nenhuma conta nova — cada número vem de onde a Diretoria (e o menu) já tira:
//  - Aprovar compras: `usePurchaseCounters` (o mesmo número do menu de Compras);
//  - Venda do mês × meta: `useMetaXRealizadoAno` + `ProjecaoDoMesDaEmpresa` (as do Resumo da Diretoria);
//  - Chamados atrasados por setor: `FarolChamadosPorSetor` (o do Resumo);
//  - A pagar em 7 dias: `useFinEntries('payable')`, só para quem vê Contas a pagar.
import { Link } from 'react-router-dom';
import { ChevronRight, ShoppingCart } from 'lucide-react';
import { useTenantPath } from '@/hooks/useTenantPath';
import { usePurchaseCounters } from '@/hooks/usePurchases';
import { useMetaXRealizadoAno } from '@/hooks/useDiretoriaMetaXRealizado';
import { useFinEntries } from '@/hooks/useFinanceiro';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { daysFromTodayISO, todayISO } from '@/lib/dates';
import { effectiveStatus, formatBRL } from '@/types/financeiro';
import { FarolChamadosPorSetor } from './ObjetivosEChamados';
import { ProjecaoDoMesDaEmpresa } from './DiretoriaResumo';

export default function ResumoDoDiretor() {
  const tenantPath = useTenantPath();
  const hoje = todayISO();
  const { data: compras } = usePurchaseCounters();
  const { can: podeCompras } = useDepartmentPermissions('compras');
  const { dadosGrafico, isLoading } = useMetaXRealizadoAno();
  const mes = dadosGrafico[Number(hoje.slice(5, 7)) - 1];
  const pct = mes?.realizado != null && mes?.meta ? Math.round((mes.realizado / mes.meta) * 100) : null;
  const { can } = useDepartmentPermissions('financeiro');
  const vePagar = can('payables', 'view');
  const { data: contas = [] } = useFinEntries('payable');
  const em7 = daysFromTodayISO(7);
  const aPagar = vePagar ? contas.filter((c) => effectiveStatus(c) !== 'paid' && effectiveStatus(c) !== 'cancelled' && c.due_date <= em7) : [];
  const vencidas = aPagar.filter((c) => c.due_date < hoje).length;

  return (
    <div className="p-4 space-y-3">
      <h1 className="text-xl font-bold">Resumo do diretor</h1>

      {podeCompras('solicitacoes', 'approve') && (
        <Link to={tenantPath('/compras/aprovacoes')}
          className="flex items-center gap-3 rounded-xl bg-primary text-primary-foreground px-4 py-3.5 font-semibold">
          <ShoppingCart className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span className="flex-1">Aprovar compras</span>
          <span className="tabular-nums">{compras?.pendingApproval ?? '…'} esperando</span>
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      )}

      <section className="rounded-xl border border-border bg-card p-4">
        <p className="text-[13px] text-muted-foreground">Venda de {mes?.mes ?? 'este mês'}</p>
        <p className="text-2xl font-semibold tabular-nums mt-0.5">
          {isLoading ? '…' : mes?.realizado != null ? formatBRL(mes.realizado) : 'sem dado'}
        </p>
        {pct != null && (
          <p className={`text-[13px] font-semibold mt-0.5 ${pct >= 100 ? 'text-status-success' : 'text-status-warning'}`}>
            {pct}% da meta de {formatBRL(mes!.meta!)}
          </p>
        )}
      </section>
      <ProjecaoDoMesDaEmpresa mes={mes} competencia={`${hoje.slice(0, 7)}-01`} />

      <FarolChamadosPorSetor />

      {vePagar && (
        <Link to={tenantPath('/financeiro/contas-a-pagar')} className="block rounded-xl border border-border bg-card p-4">
          <p className="text-[13px] text-muted-foreground">A pagar nos próximos 7 dias</p>
          <p className="text-2xl font-semibold tabular-nums mt-0.5">{formatBRL(aPagar.reduce((s, c) => s + Number(c.amount), 0))}</p>
          <p className={`text-[13px] mt-0.5 ${vencidas ? 'text-status-danger font-semibold' : 'text-muted-foreground'}`}>
            {aPagar.length} {aPagar.length === 1 ? 'conta' : 'contas'}{vencidas ? ` · ${vencidas} já vencida${vencidas === 1 ? '' : 's'}` : ''}
          </p>
        </Link>
      )}

      <p className="text-[13px] text-muted-foreground pt-1">Os Insights completos (metas, clientes, produtos) abrem no computador.</p>
    </div>
  );
}
