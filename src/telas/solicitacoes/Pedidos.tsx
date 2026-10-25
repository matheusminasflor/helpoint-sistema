// Pedidos (proposta "Helpoint no dia a dia", etapa 4b): o que eu pedi, o que espera a minha aprovação de gestor, e a
// porta para pedir. O chamado é um problema; o pedido tem etapas — aqui cada um mostra em que etapa está e com quem.
// `?novo=<tipo>` abre o formulário direto (o card antigo do abrir chamado e o Ctrl+K levam para cá).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ListaDeSolicitacoes } from '@/components/solicitacoes/ListaDeSolicitacoes';
import { NovoPedidoDialog } from '@/components/solicitacoes/NovoPedidoDialog';
import { PedirCompraDialog } from '@/components/solicitacoes/PedirCompraDialog';
import { EtapasDaCompra } from '@/components/financeiro/EtapasDaCompra';
import { PurchasePanel } from '@/components/financeiro/PurchasePanel';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useMinhasCompras } from '@/hooks/usePurchases';
import { formatQuantidade } from '@/types/purchases';
import { useMinhasSolicitacoes, useParaEuAprovar } from '@/hooks/useSolicitacoes';
import { useQueryState } from '@/hooks/useQueryState';
import { useTenantPath } from '@/hooks/useTenantPath';
import { TIPOS, TIPOS_DA_PORTA, terminou, type TipoDeSolicitacao } from '@/config/solicitacoes';

export default function Pedidos() {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { data: minhas = [], isLoading } = useMinhasSolicitacoes();
  const { data: paraAprovar = [], isLoading: carregandoAprovar } = useParaEuAprovar();
  const [aba, setAba] = useQueryState<'meus' | 'compras' | 'aprovar'>('aba', 'meus');
  // Minhas compras (etapa 4b): a compra com as etapas Pedido → Aprovada → Paga → Nota, e de quem é a vez.
  const { data: compras = [], isLoading: carregandoCompras, refetch: recarregarCompras } = useMinhasCompras();
  const [compraAberta, setCompraAberta] = useState<string | null>(null);
  const abertaNoPainel = compras.find((c) => c.id === compraAberta) ?? null;
  const [novo, setNovo] = useQueryState<string>('novo', '');
  const [escolhendo, setEscolhendo] = useState(false);
  const tipoNovo = (TIPOS_DA_PORTA as string[]).includes(novo) || novo.startsWith('rh_') ? novo as TipoDeSolicitacao : null;
  const abertas = minhas.filter((s) => !terminou(s.tipo, s.etapa));
  const fechadas = minhas.filter((s) => terminou(s.tipo, s.etapa));

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Pedidos" icon={ClipboardList}
        description="Compra, arte, acesso, reembolso e adiantamento: o que você pediu, em que etapa está e com quem."
        actions={<Button onClick={() => setEscolhendo(true)}><Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />Novo pedido</Button>} />
      <div className="p-4 lg:p-6 space-y-4">
        <Tabs value={aba} onValueChange={(v) => setAba(v as 'meus' | 'compras' | 'aprovar')}>
          <TabsList>
            <TabsTrigger value="meus">Meus pedidos{abertas.length ? ` (${abertas.length})` : ''}</TabsTrigger>
            <TabsTrigger value="compras">Minhas compras</TabsTrigger>
            <TabsTrigger value="aprovar">Para eu aprovar{paraAprovar.length ? ` (${paraAprovar.length})` : ''}</TabsTrigger>
          </TabsList>
          <TabsContent value="meus" className="space-y-4 mt-4">
            <ListaDeSolicitacoes linhas={abertas} carregando={isLoading} vazio="Nenhum pedido em aberto" mostrarQuem={false} />
            {fechadas.length > 0 && (
              <details>
                <summary className="cursor-pointer text-[14px] font-medium text-muted-foreground">Encerrados ({fechadas.length})</summary>
                <div className="mt-2"><ListaDeSolicitacoes linhas={fechadas} carregando={false} vazio="" mostrarQuem={false} /></div>
              </details>
            )}
          </TabsContent>
          <TabsContent value="compras" className="mt-4">
            {carregandoCompras ? <Skeleton className="h-32 w-full" /> : compras.length === 0 ? (
              <p className="text-[14px] text-muted-foreground">Você ainda não pediu compra por aqui.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                {compras.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setCompraAberta(c.id)} className="w-full text-left px-4 py-3 hover:bg-muted/40 space-y-2">
                      <span className="block text-[14px] font-medium">{c.product_name}
                        <span className="font-normal text-muted-foreground"> · {formatQuantidade(Number(c.quantidade ?? 1))}{c.ticket?.ticket_number ? ` · #${c.ticket.ticket_number}` : ''}</span>
                      </span>
                      <EtapasDaCompra compra={c} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="aprovar" className="mt-4">
            <p className="text-[13px] text-muted-foreground mb-2">Os pedidos de quem é do seu setor que esperam o seu sim ou não.</p>
            <ListaDeSolicitacoes linhas={paraAprovar} carregando={carregandoAprovar} vazio="Nada esperando a sua aprovação" />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={escolhendo} onOpenChange={setEscolhendo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>O que você quer pedir?</DialogTitle>
            <DialogDescription>Algo quebrou ou precisa de ajuda? Isso é chamado, em "Nova solicitação".</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => { setEscolhendo(false); setNovo('compra'); }}
              className="rounded-lg border border-border p-3 text-left min-h-11 hover:bg-muted/40">
              <span className="block text-[14px] font-semibold">Compra</span>
              <span className="block text-[13px] text-muted-foreground">Produto ou serviço — quem compra cota, quem aprova decide</span>
            </button>
            {TIPOS_DA_PORTA.map((t) => (
              <button key={t} type="button" onClick={() => { setEscolhendo(false); setNovo(t); }}
                className="rounded-lg border border-border p-3 text-left min-h-11 hover:bg-muted/40">
                <span className="block text-[14px] font-semibold">{TIPOS[t].rotulo}</span>
                <span className="block text-[13px] text-muted-foreground">{TIPOS[t].descricao}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {novo === 'compra' && (
        <PedirCompraDialog onFechar={() => setNovo('')}
          onEnviado={() => { setNovo(''); setAba('compras'); void recarregarCompras(); }} />
      )}

      <Sheet open={!!abertaNoPainel} onOpenChange={(o) => !o && setCompraAberta(null)}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
          {abertaNoPainel && (
            <>
              <SheetHeader className="pr-8"><SheetTitle className="text-left text-[18px]">{abertaNoPainel.product_name}</SheetTitle></SheetHeader>
              <div className="mt-4"><PurchasePanel ticketId={abertaNoPainel.ticket_id} onUpdate={() => void recarregarCompras()} /></div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {tipoNovo && (
        <NovoPedidoDialog tipo={tipoNovo} onFechar={() => setNovo('')}
          onEnviado={(id) => { setNovo(''); navigate(tenantPath(`/solicitacoes/${id}`)); }} />
      )}
    </div>
  );
}
