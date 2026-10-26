// Compras › Pedidos de compra: a caixa de entrada de quem ATENDE compra. Em QUADRO (dono, 2026-10-14:
// "Solicitações de compra ser formato Kanban também"), uma coluna por situação, com o mesmo cartão de Aprovar
// compras; clicar abre o pedido da compra (rodada 2: não há mais chamado). A coluna "Aprovada · comprar" vem destacada: é o trabalho de Compras.
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { Cartao, Coluna } from '@/components/financeiro/QuadroDeCompras';
import { useNomesDeQuemPediu } from '@/hooks/useNomesDeQuemPediu';
import { rotuloDoSetor } from '@/lib/setores';
import { useQueryState } from '@/hooks/useQueryState';
import { useTenantPath } from '@/hooks/useTenantPath';
import { usePurchaseRequestsPanel, type PurchaseRequestRow } from '@/hooks/usePurchases';
import { formatBRLAmount } from '@/types/purchases';
import { formatDateBR } from '@/types/financeiro';
import { cn } from '@/lib/utils';

type PeriodFilter = 'all' | '30d' | '90d' | 'year';

const PERIOD_TABS: { key: PeriodFilter; label: string }[] = [
  { key: 'all', label: 'Todo período' },
  { key: '30d', label: 'Últimos 30 dias' },
  { key: '90d', label: 'Últimos 90 dias' },
  { key: 'year', label: 'Este ano' },
];

// Pagar primeiro, nota depois (dono, 2026-10-15; 20270121010000): a aprovada se divide nos passos do pagamento.
const paga = (p: PurchaseRequestRow) => !!p.pagamento_em;
const boletoEmAberto = (p: PurchaseRequestRow) => paga(p) && p.forma_pagamento === 'boleto' && !p.boleto_pago_em;
const COLUNAS: { id: string; filtro: (p: PurchaseRequestRow) => boolean; titulo: string; vazio: string; destaque?: boolean }[] = [
  { id: 'pending_approval', filtro: (p) => p.status === 'pending_approval', titulo: 'Aguardando aprovação', vazio: 'Nada esperando aprovação.' },
  { id: 'adjustment_requested', filtro: (p) => p.status === 'adjustment_requested', titulo: 'Em ajuste com quem pediu', vazio: 'Nenhuma em ajuste.' },
  { id: 'approved', filtro: (p) => p.status === 'approved' && !paga(p), titulo: 'Aprovada · comprar', vazio: 'Nenhuma compra para fazer.', destaque: true },
  { id: 'boleto', filtro: (p) => p.status === 'approved' && boletoEmAberto(p), titulo: 'Boleto no Financeiro', vazio: 'Nenhum boleto esperando pagamento.' },
  { id: 'paga', filtro: (p) => p.status === 'approved' && paga(p) && !boletoEmAberto(p), titulo: 'Paga · aguardando a nota', vazio: 'Nenhuma esperando a nota.', destaque: true },
  { id: 'completed', filtro: (p) => p.status === 'completed', titulo: 'Comprada', vazio: 'Nenhuma compra feita no período.' },
  { id: 'rejected', filtro: (p) => p.status === 'rejected', titulo: 'Recusada', vazio: 'Nenhuma recusada no período.' },
];

function periodStart(period: PeriodFilter): string | undefined {
  const now = new Date();
  if (period === '30d') return new Date(now.getTime() - 30 * 864e5).toISOString();
  if (period === '90d') return new Date(now.getTime() - 90 * 864e5).toISOString();
  if (period === 'year') return new Date(now.getFullYear(), 0, 1).toISOString();
  return undefined;
}

function rodape(p: PurchaseRequestRow) {
  const chamado = p.pedido ? `#${p.pedido.numero} · ` : '';
  if (p.status === 'completed') return `${chamado}comprada em ${formatDateBR(p.executed_at ?? p.created_at)}`;
  if (p.status === 'approved' && p.pagamento_em) return `${chamado}paga em ${formatDateBR(p.pagamento_em)}`;
  if (p.status === 'approved') return `${chamado}aprovada em ${formatDateBR(p.approved_at ?? p.created_at)}`;
  return `${chamado}pedida em ${formatDateBR(p.created_at)}`;
}

export default function ComprasSolicitacoes() {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const [department, setDepartment] = useQueryState<string>('setor', '');
  const [period, setPeriod] = useQueryState<PeriodFilter>('periodo', 'all');

  const { data: requests = [], isLoading } = usePurchaseRequestsPanel({
    department: department || undefined,
    from: periodStart(period),
  });

  const departments = useMemo(
    () => Array.from(new Set(requests.map(r => r.department).filter(Boolean) as string[])).sort(),
    [requests],
  );

  const nomes = useNomesDeQuemPediu(requests);
  const total = requests.reduce((sum, r) => sum + Number(r.estimated_amount || 0), 0);
  const abrir = (id: string) => {
    const r = requests.find((x) => x.id === id);
    if (r) navigate(tenantPath(`/solicitacoes/${r.solicitacao_id}`));
  };

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Pedidos de compra"
        description="Todas as compras pedidas pela empresa, por situação. Clique numa compra para abrir o pedido."
        icon={ShoppingCart}
      >
        {/* SEM BOTÃO DE PEDIR, de propósito (LEVA P). Esta tela é a caixa de entrada de quem
            ATENDE compra — só entra quem tem o módulo. Quem pede vai por "Novo › Pedido ›
            Compras", como pede a qualquer setor. O dono, 2026-09-28: "o módulo de compras,
            quem tem acesso, é onde vai receber a demanda". */}
        <div className="flex flex-wrap items-center gap-1.5">
          {PERIOD_TABS.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setPeriod(t.key)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-full transition-colors',
                period === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {t.label}
            </button>
          ))}
          {departments.length > 0 && (
            <>
              <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
              <label className="sr-only" htmlFor="setor-filtro">Filtrar por setor</label>
              <select
                id="setor-filtro"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="h-7 rounded-md border border-border bg-background px-2 text-xs"
              >
                <option value="">Todos os setores</option>
                {departments.map(d => <option key={d} value={d}>{rotuloDoSetor(d)}</option>)}
              </select>
            </>
          )}
        </div>
      </PageHeader>

      <div className="p-4 lg:p-6 space-y-3">
        <p className="text-sm text-muted-foreground">
          {requests.length} {requests.length === 1 ? 'pedido' : 'pedidos'} · total estimado{' '}
          <span className="font-mono text-foreground">{formatBRLAmount(total)}</span>
        </p>

        {isLoading ? <Skeleton className="h-64 w-full" /> : (
          <div className="flex flex-col sm:flex-row gap-3 sm:overflow-x-auto pb-3 sm:items-start">
            {COLUNAS.map((c) => (
              <Coluna key={c.id} titulo={c.titulo} vazio={c.vazio} destaque={c.destaque}
                pedidos={requests.filter(c.filtro)}
                cartao={(p) => (
                  <Cartao p={p} nome={nomes[p.created_by ?? '']} onAbrir={abrir} aprovada={p.status === 'approved' || p.status === 'completed'}
                    rodape={rodape(p)} />
                )} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
