// Compras › Aprovar compras (decisões do dono: 2026-10-03, na Diretoria; 2026-10-09, mudou para Compras).
//
// "Área específica: aprovar, recusar e solicitar ajustes. Exibir fornecedor, valor, solicitante,
// justificativas e anexos. Registrar decisão, usuário, data e observações; contador de pendências no
// menu; histórico de compras do item." Abre para quem tem "Aprovar / reprovar compra" no perfil de Compras
// (`telas-do-perfil`); quem tem SÓ essa caixinha vê só esta tela.
//
// Em QUADRO (dono, 2026-10-13: "está muito ruim para visualizar"; escolheu Kanban em vez do formato
// Helpdesk): Aguardando decisão · Em ajuste · Aprovada, aguardando compra · Comprada (30 dias). O cartão diz
// o essencial (produto, quantidade, valor, quem pediu, há quanto espera, o orçamento recomendado); clicar
// abre o painel ao lado com a justificativa, o histórico do item e a decisão (`PurchasePanel`). Sem arrastar:
// aprovar pede orçamento, quantidade e às vezes motivo — arrastar pularia isso.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ExternalLink, History, Hourglass, MessageSquareWarning, ShoppingCart, Star } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { KPICard } from '@/components/glpi/KPICard';
import { PurchasePanel } from '@/components/compras/PurchasePanel';
import { HistoricoDoItem } from '@/components/compras/HistoricoDoItem';
import { Cartao, Coluna } from '@/components/compras/QuadroDeCompras';
import { useNomesDeQuemPediu } from '@/hooks/useNomesDeQuemPediu';
import { ComoFuncionaCompras } from '@/components/compras/ComoFuncionaCompras';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { rotuloDoSetor } from '@/lib/setores';
import { todayISO } from '@/lib/dates';
import { formatBRL } from '@/types/financeiro';
import {
  chaveDoItem, useHistoricoDeCompras, usePurchaseRequestsPanel, useTemposDeDecisao,
  type CompraDoHistorico, type PurchaseRequestRow,
} from '@/hooks/usePurchases';
import { formatarEspera } from '@/lib/tempo-de-decisao';

const data = (iso: string | null) => (iso ? format(parseISO(iso), 'dd/MM/yyyy') : '—');
const TRINTA_DIAS = 30 * 24 * 60 * 60 * 1000;

type Coluna = 'pending_approval' | 'adjustment_requested' | 'approved' | 'completed';

export default function AprovarCompras() {
  const tenantPath = useTenantPath();
  const { can } = useDepartmentPermissions('compras');
  const podeDecidir = can('solicitacoes', 'approve');
  const { data: tempos, refetch: refetchTempos } = useTemposDeDecisao();
  const { data: pedidos = [], isLoading, refetch } = usePurchaseRequestsPanel();
  const { data: historico = new Map<string, CompraDoHistorico[]>(), refetch: refetchHistorico } = useHistoricoDeCompras();
  const [aberto, setAberto] = useState<string | null>(null);

  const agora = Date.now();
  const colunas = useMemo(() => {
    const de = (s: Coluna) => pedidos.filter((p) => p.status === s);
    return {
      // O que espera há mais tempo primeiro.
      pending_approval: de('pending_approval').sort((a, b) => a.created_at.localeCompare(b.created_at)),
      adjustment_requested: de('adjustment_requested'),
      approved: de('approved'),
      completed: de('completed').filter((p) => !p.executed_at || agora - Date.parse(p.executed_at) <= TRINTA_DIAS),
    };
  }, [pedidos, agora]);

  const nomes = useNomesDeQuemPediu(pedidos);

  // O mês corrente no Brasil (regra 4): o que já foi aprovado nele, para dar a medida do pendente.
  const mes = todayISO().slice(0, 7);
  const aprovadasNoMes = useMemo(() => {
    let n = 0; let total = 0;
    historico.forEach((lista) => lista.forEach((c) => {
      if (c.data && c.data.slice(0, 7) === mes) { n += 1; total += c.valor ?? 0; }
    }));
    return { n, total };
  }, [historico, mes]);
  const totalPendente = colunas.pending_approval.reduce((s, p) => s + Number(p.estimated_amount ?? 0), 0);

  const decidiu = () => { refetch(); refetchHistorico(); refetchTempos(); };
  const pedidoAberto = pedidos.find((p) => p.id === aberto) ?? null;
  const espera = (p: PurchaseRequestRow) => {
    const desde = tempos?.esperandoDesde.get(p.id);
    return desde ? formatarEspera((agora - Date.parse(desde)) / 60_000) : null;
  };

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Aprovar compras"
        description={podeDecidir
          ? 'Clique numa compra para ver os orçamentos e decidir. Cada decisão fica registrada com seu nome, a data e a observação.'
          : 'Você acompanha. Decidir pede a caixinha "Aprovar / reprovar compra" no perfil de Compras.'}
        icon={ShoppingCart}
        actions={<ComoFuncionaCompras para="quem-aprova" />}
      />
      <div className="p-4 lg:p-6 space-y-4">
        <div className="faixa-de-numeros grid grid-cols-2 lg:grid-cols-4">
          <KPICard value={String(colunas.pending_approval.length)} label="Aguardando decisão" icon={ShoppingCart} color="orange" />
          <KPICard value={formatBRL(totalPendente)} label="Valor aguardando decisão" icon={ShoppingCart} color="blue" />
          <KPICard value={tempos?.mediaEmMinutos != null ? formatarEspera(tempos.mediaEmMinutos) : '—'}
            label="Tempo médio de decisão" icon={Hourglass} color="purple" />
          <KPICard value={`${aprovadasNoMes.n} · ${formatBRL(aprovadasNoMes.total)}`} label="Aprovadas neste mês" icon={History} color="green" />
        </div>

        {isLoading ? <Skeleton className="h-64 w-full" /> : (
          <div className="flex flex-col sm:flex-row gap-3 sm:overflow-x-auto pb-3 sm:items-start">
            <Coluna titulo={podeDecidir ? 'Aguardando sua decisão' : 'Aguardando decisão'} destaque
              vazio="Nada esperando decisão." pedidos={colunas.pending_approval}
              cartao={(p) => (
                <Cartao p={p} nome={nomes[p.created_by ?? '']} onAbrir={setAberto}
                  rodape={espera(p) && <span className="text-status-warning font-medium">Espera há {espera(p)}</span>}
                  extra={p.recomendado?.supplier && (
                    <span className="inline-flex items-center gap-1 text-[12px] text-primary"><Star className="w-3 h-3" aria-hidden="true" />{p.recomendado.supplier} recomendado</span>
                  )} />
              )} />
            <Coluna titulo="Em ajuste com quem pediu" vazio="Nenhuma compra voltou para ajuste." pedidos={colunas.adjustment_requested}
              cartao={(p) => (
                <Cartao p={p} nome={nomes[p.created_by ?? '']} onAbrir={setAberto}
                  extra={p.adjustment_reason && (
                    <span className="flex items-start gap-1 text-[12px] text-muted-foreground"><MessageSquareWarning className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" /><span className="line-clamp-2">{p.adjustment_reason}</span></span>
                  )} />
              )} />
            <Coluna titulo="Aprovada · aguardando compra" vazio="Nenhuma compra esperando ser feita." pedidos={colunas.approved}
              cartao={(p) => (
                <Cartao p={p} nome={nomes[p.created_by ?? '']} onAbrir={setAberto} aprovada
                  rodape={<span>Aprovada em {data(p.approved_at)}</span>} />
              )} />
            <Coluna titulo="Comprada · últimos 30 dias" vazio="Nenhuma compra feita nos últimos 30 dias." pedidos={colunas.completed}
              cartao={(p) => (
                <Cartao p={p} nome={nomes[p.created_by ?? '']} onAbrir={setAberto} aprovada
                  rodape={<span className="text-status-success">Comprada em {data(p.executed_at)}</span>} />
              )} />
          </div>
        )}
      </div>

      <Sheet open={!!pedidoAberto} onOpenChange={(o) => !o && setAberto(null)}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto overflow-x-hidden">
          {pedidoAberto && (
            <>
              <SheetHeader className="pr-8">
                <SheetTitle className="text-left text-[18px]">{pedidoAberto.product_name}</SheetTitle>
                <SheetDescription className="text-left">
                  {pedidoAberto.pedido?.numero ? `#${pedidoAberto.pedido.numero} · ` : ''}
                  {rotuloDoSetor(pedidoAberto.department)} · pedido por {nomes[pedidoAberto.created_by ?? ''] ?? '—'} em {data(pedidoAberto.created_at)}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-3">
                <Link to={tenantPath(`/solicitacoes/${pedidoAberto.solicitacao_id}`)} className="text-[13px] text-primary inline-flex items-center gap-1">
                  Abrir o pedido (conversa e histórico) <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>
                {pedidoAberto.status === 'pending_approval' && espera(pedidoAberto) && (
                  <p className="rounded-md badge-warning px-3 py-2 text-sm">
                    Esperando a decisão há <b>{espera(pedidoAberto)}</b>. Enquanto isso, quem pediu continua sem a compra.
                  </p>
                )}
                {pedidoAberto.pedido?.detalhes && (
                  <div className="rounded-md bg-muted/40 p-3 text-sm">
                    <p className="text-xs font-semibold text-muted-foreground mb-0.5">Justificativa de quem pediu</p>
                    <p className="whitespace-pre-wrap">{pedidoAberto.pedido.detalhes}</p>
                  </div>
                )}
                {pedidoAberto.adjustment_response && (
                  <div className="rounded-md bg-muted/40 p-3 text-sm">
                    <p className="text-xs font-semibold text-muted-foreground mb-0.5">Resposta ao último ajuste</p>
                    <p className="whitespace-pre-wrap">{pedidoAberto.adjustment_response}</p>
                  </div>
                )}
                <HistoricoDoItem anteriores={historico.get(chaveDoItem(pedidoAberto)) ?? []} />
                <PurchasePanel pedidoId={pedidoAberto.solicitacao_id} onUpdate={decidiu} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
