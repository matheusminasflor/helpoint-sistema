// Compras › Aprovar compras (decisões do dono: 2026-10-03, na Diretoria; 2026-10-09, mudou para Compras).
//
// "Área específica: aprovar, recusar e solicitar ajustes. Exibir fornecedor, valor, solicitante,
// justificativas e anexos. Registrar decisão, usuário, data e observações; contador de pendências no
// menu; histórico de compras do item." Cada pedido mostra quem pediu e o porquê, as compras anteriores
// do mesmo item e o painel de decisão do chamado (`PurchasePanel`). Abre para quem tem "Aprovar /
// reprovar compra" no perfil de Compras (`telas-do-perfil`); quem tem SÓ essa caixinha vê só esta tela.
// E mostra quanto cada pedido já espera: enquanto aguarda a decisão, o prazo de Compras fica parado.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ExternalLink, History, Hourglass, MessageSquareWarning, ShoppingCart } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { KPICard } from '@/components/glpi/KPICard';
import { PurchasePanel } from '@/components/financeiro/PurchasePanel';
import { ComoFuncionaCompras } from '@/components/financeiro/ComoFuncionaCompras';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { unwrap } from '@/lib/supabase-result';
import { rotuloDoSetor } from '@/lib/setores';
import { todayISO } from '@/lib/dates';
import { formatBRL } from '@/types/financeiro';
import {
  chaveDoItem, useHistoricoDeCompras, usePurchaseRequestsPanel, useTemposDeDecisao, type CompraDoHistorico,
} from '@/hooks/usePurchases';
import { formatarEspera } from '@/lib/tempo-de-decisao';

const data = (iso: string | null) => (iso ? format(parseISO(iso), 'dd/MM/yyyy') : '—');

export default function AprovarCompras() {
  const { tenantId } = useAuth();
  const tenantPath = useTenantPath();
  const { can } = useDepartmentPermissions('compras');
  const podeDecidir = can('solicitacoes', 'approve');
  const { data: tempos, refetch: refetchTempos } = useTemposDeDecisao();
  const { data: pendentes = [], isLoading, refetch } = usePurchaseRequestsPanel({ status: 'pending_approval' });
  const { data: emAjuste = [], refetch: refetchAjuste } = usePurchaseRequestsPanel({ status: 'adjustment_requested' });
  const { data: historico = new Map<string, CompraDoHistorico[]>(), refetch: refetchHistorico } = useHistoricoDeCompras();

  // Quem pediu: só o nome, de quem está nas listas.
  const quem = useMemo(
    () => [...new Set([...pendentes, ...emAjuste].map(p => p.created_by).filter(Boolean))] as string[],
    [pendentes, emAjuste],
  );
  const { data: nomes = {} } = useQuery({
    queryKey: ['compras-quem-pediu', tenantId, quem],
    enabled: !!tenantId && quem.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const rows = (unwrap(await supabase.from('profiles').select('id, full_name, email').in('id', quem)) ?? []) as
        Array<{ id: string; full_name: string | null; email: string }>;
      return Object.fromEntries(rows.map(r => [r.id, r.full_name || r.email]));
    },
  });

  // O mês corrente no Brasil (regra 4): o que já foi aprovado nele, para dar a medida do pendente.
  const mes = todayISO().slice(0, 7);
  const aprovadasNoMes = useMemo(() => {
    let n = 0; let total = 0;
    historico.forEach(lista => lista.forEach(c => {
      if (c.data && c.data.slice(0, 7) === mes) { n += 1; total += c.valor ?? 0; }
    }));
    return { n, total };
  }, [historico, mes]);
  const totalPendente = pendentes.reduce((s, p) => s + Number(p.estimated_amount ?? 0), 0);

  const decidiu = () => { refetch(); refetchAjuste(); refetchHistorico(); refetchTempos(); };
  const agora = Date.now();

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Aprovar compras"
        description={podeDecidir
          ? 'Aprove, peça ajuste ou recuse. Cada decisão fica registrada com seu nome, a data e a observação.'
          : 'Você acompanha. Decidir pede a caixinha "Aprovar / reprovar compra" no perfil de Compras.'}
        icon={ShoppingCart}
        actions={<ComoFuncionaCompras para="quem-aprova" />}
      />
      <div className="p-4 lg:p-6 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <KPICard value={String(pendentes.length)} label="Aguardando decisão" icon={ShoppingCart} color="orange" />
          <KPICard value={formatBRL(totalPendente)} label="Valor estimado aguardando" icon={ShoppingCart} color="blue" />
          <KPICard value={tempos?.mediaEmMinutos != null ? formatarEspera(tempos.mediaEmMinutos) : '—'}
            label="Tempo médio de decisão" icon={Hourglass} color="purple" />
          <KPICard value={String(emAjuste.length)} label="Em ajuste com quem pediu" icon={MessageSquareWarning} color="orange" />
          <KPICard value={`${aprovadasNoMes.n} · ${formatBRL(aprovadasNoMes.total)}`} label="Aprovadas neste mês" icon={History} color="green" />
        </div>

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : pendentes.length === 0 ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Nenhum pedido de compra aguardando decisão.</CardContent></Card>
        ) : pendentes.map(p => (
          <Card key={p.id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">{p.product_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.ticket?.ticket_number ? `#${p.ticket.ticket_number} · ` : ''}
                    {rotuloDoSetor(p.department)} · pedido por <span className="font-medium text-foreground">{nomes[p.created_by ?? ''] ?? '—'}</span> em {data(p.created_at)}
                  </p>
                </div>
                <Link to={tenantPath(`/helpdesk/${p.ticket_id}`)} className="text-xs text-primary inline-flex items-center gap-1">
                  Abrir chamado (anexos e conversa) <ExternalLink className="w-3 h-3" aria-hidden="true" />
                </Link>
              </div>

              {tempos?.esperandoDesde.get(p.id) && (
                <p className="rounded-md badge-warning px-3 py-2 text-sm">
                  Esperando a decisão há <b>{formatarEspera((agora - Date.parse(tempos.esperandoDesde.get(p.id)!)) / 60_000)}</b>.
                  {' '}Enquanto isso o prazo de Compras fica parado, e quem pediu continua sem a compra.
                </p>
              )}

              {p.ticket?.description && (
                <div className="rounded-md bg-muted/40 p-3 text-sm">
                  <p className="text-xs font-semibold text-muted-foreground mb-0.5">Justificativa de quem pediu</p>
                  <p className="whitespace-pre-wrap">{p.ticket.description}</p>
                </div>
              )}
              {p.adjustment_response && (
                <div className="rounded-md bg-muted/40 p-3 text-sm">
                  <p className="text-xs font-semibold text-muted-foreground mb-0.5">Resposta ao último ajuste</p>
                  <p className="whitespace-pre-wrap">{p.adjustment_response}</p>
                </div>
              )}

              <HistoricoDoItem anteriores={historico.get(chaveDoItem(p)) ?? []} />

              {p.ticket_id && <PurchasePanel ticketId={p.ticket_id} onUpdate={decidiu} />}
            </CardContent>
          </Card>
        ))}

        {emAjuste.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Em ajuste com quem pediu</h2>
            {emAjuste.map(p => (
              <Card key={p.id}>
                <CardContent className="p-3 text-sm flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{p.product_name} <span className="text-xs text-muted-foreground">· {nomes[p.created_by ?? ''] ?? '—'}</span></p>
                    <p className="text-xs text-muted-foreground">Ajuste pedido: {p.adjustment_reason}</p>
                  </div>
                  <Link to={tenantPath(`/helpdesk/${p.ticket_id}`)} className="text-xs text-primary inline-flex items-center gap-1">
                    Abrir chamado <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HistoricoDoItem({ anteriores }: { anteriores: CompraDoHistorico[] }) {
  return (
    <div className="rounded-md border border-border">
      <p className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-muted-foreground border-b border-border">
        <History className="w-3.5 h-3.5" aria-hidden="true" /> Compras anteriores deste item
      </p>
      {anteriores.length === 0 ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">Primeira compra deste item.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-1.5 font-medium">Data</th>
              <th className="px-3 py-1.5 font-medium">Fornecedor</th>
              <th className="px-3 py-1.5 font-medium">Setor</th>
              <th className="px-3 py-1.5 font-medium text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {anteriores.slice(0, 5).map(c => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-3 py-1.5 font-mono">{data(c.data)}</td>
                <td className="px-3 py-1.5">{c.fornecedor ?? '—'}</td>
                <td className="px-3 py-1.5">{rotuloDoSetor(c.setor)}</td>
                <td className="px-3 py-1.5 font-mono text-right">{c.valor != null ? formatBRL(c.valor) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {anteriores.length > 5 && (
        <p className="px-3 py-1.5 text-[12px] text-muted-foreground border-t border-border">e mais {anteriores.length - 5} compra(s) antes.</p>
      )}
    </div>
  );
}
