// Financeiro › Caixinha (dono, 2026-10-14): "um caixa que recebe valor X semanal do diretor para comprar
// suprimentos como café, adoçantes, coisas do dia a dia, com entrada e saída, mostrando tudo o que foi comprado
// e os recibos". A entrada é registrada a cada repasse (o valor semanal vem sugerido); a saída é a compra da
// categoria Caixinha registrada (nasce no banco, com o recibo) ou o gasto solto, lançado aqui com recibo.
// Quem aprova a Caixinha decide os pedidos dela aqui mesmo, no quadro "Pedidos da Caixinha".
import { useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Paperclip, PiggyBank, Trash2, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { KPICard } from '@/components/glpi/KPICard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PurchasePanel } from '@/components/financeiro/PurchasePanel';
import { Cartao, Coluna } from '@/components/financeiro/QuadroDeCompras';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { usePurchaseRequestsPanel } from '@/hooks/usePurchases';
import { useNomesDeQuemPediu } from '@/hooks/useNomesDeQuemPediu';
import {
  urlDoRecibo, useApagarDaCaixinha, useComprasConfig, useDecideACaixinha, useLancarNaCaixinha, useMovimentosDaCaixinha,
} from '@/hooks/useCaixinha';
import { useSuprimentos } from '@/hooks/useEstoque';
import { todayISO } from '@/lib/dates';
import { formatBRL, formatDateBR } from '@/types/financeiro';
import { cn } from '@/lib/utils';

type Lancamento = 'entrada' | 'saida';

export default function FinCaixinha() {
  const { can } = useDepartmentPermissions('financeiro');
  const decide = useDecideACaixinha();
  const podeLancar = can('caixinha', 'create') || decide;
  const podeApagar = can('caixinha', 'delete');
  const { data: config } = useComprasConfig();
  const { data: movimentos = [], isLoading, refetch } = useMovimentosDaCaixinha();
  const { data: pedidos = [], refetch: refetchPedidos } = usePurchaseRequestsPanel();
  const apagar = useApagarDaCaixinha();
  const [lancando, setLancando] = useState<Lancamento | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  const saldo = movimentos.reduce((s, m) => s + (m.tipo === 'entrada' ? m.valor : -m.valor), 0);
  const mes = todayISO().slice(0, 7);
  const doMes = (t: Lancamento) => movimentos.filter((m) => m.tipo === t && m.data.slice(0, 7) === mes).reduce((s, m) => s + m.valor, 0);

  const daCaixinha = useMemo(() => pedidos.filter((p) => p.caixinha), [pedidos]);
  const nomes = useNomesDeQuemPediu(daCaixinha);
  const pendentes = daCaixinha.filter((p) => p.status === 'pending_approval');
  const aComprar = daCaixinha.filter((p) => p.status === 'approved');
  const pedidoAberto = daCaixinha.find((p) => p.id === aberto) ?? null;

  const abrirRecibo = async (path: string) => {
    const url = await urlDoRecibo(path);
    if (url) window.open(url, '_blank', 'noopener');
  };

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Caixinha"
        description="O caixa do dia a dia: o repasse semanal entra (e aparece no Financeiro como Reposição da Caixinha, já paga), as compras pequenas saem, cada uma com o recibo."
        icon={PiggyBank}
        actions={podeLancar && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setLancando('entrada')}><ArrowDownCircle className="w-4 h-4 mr-1.5" aria-hidden="true" />Registrar entrada</Button>
            <Button variant="outline" onClick={() => setLancando('saida')}><ArrowUpCircle className="w-4 h-4 mr-1.5" aria-hidden="true" />Registrar saída</Button>
          </div>
        )}
      />
      <div className="p-4 lg:p-6 space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <KPICard value={formatBRL(saldo)} label="Saldo do Caixinha" icon={Wallet} color={saldo > 0 ? 'green' : 'orange'} />
          <KPICard value={formatBRL(doMes('entrada'))} label="Entrou neste mês" icon={ArrowDownCircle} color="blue" />
          <KPICard value={formatBRL(doMes('saida'))} label="Saiu neste mês" icon={ArrowUpCircle} color="purple" />
        </div>

        {(pendentes.length > 0 || aComprar.length > 0) && (
          <div className="flex gap-3 overflow-x-auto pb-1 items-start">
            <Coluna titulo={decide ? 'Pedidos da Caixinha para você decidir' : 'Pedidos da Caixinha aguardando decisão'} destaque
              vazio="Nada esperando decisão." pedidos={pendentes}
              cartao={(p) => <Cartao p={p} nome={nomes[p.created_by ?? '']} onAbrir={setAberto} rodape={`pedido em ${formatDateBR(p.created_at)}`} />} />
            <Coluna titulo="Aprovados · comprar e anexar o recibo" vazio="Nada para comprar." pedidos={aComprar}
              cartao={(p) => <Cartao p={p} nome={nomes[p.created_by ?? '']} onAbrir={setAberto} aprovada rodape={`aprovado em ${formatDateBR(p.approved_at ?? p.created_at)}`} />} />
          </div>
        )}

        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="p-4 space-y-1">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : movimentos.length === 0 ? (
            <EmptyState icon={PiggyBank} title="Nada lançado ainda"
              description='Comece pela entrada do repasse em "Registrar entrada".' />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-border bg-secondary/60 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">Data</th>
                    <th className="px-3 py-2 font-semibold">Descrição</th>
                    <th className="px-3 py-2 font-semibold text-right">Valor</th>
                    <th className="px-3 py-2 font-semibold">Recibo</th>
                    {podeApagar && <th className="px-3 py-2" aria-label="Ações" />}
                  </tr>
                </thead>
                <tbody>
                  {movimentos.map((m) => (
                    <tr key={m.id} className="border-b border-border">
                      <td className="px-3 py-2 font-mono text-xs">{formatDateBR(m.data)}</td>
                      <td className="px-3 py-2">
                        {m.descricao}
                        {m.purchase_request_id && <span className="ml-2 text-[12px] text-muted-foreground">(pedido em Compras)</span>}
                      </td>
                      <td className={cn('px-3 py-2 font-mono text-right', m.tipo === 'entrada' ? 'text-status-success' : 'text-status-danger')}>
                        {m.tipo === 'entrada' ? '+' : '−'} {formatBRL(m.valor)}
                      </td>
                      <td className="px-3 py-2">
                        {m.recibo_path ? (
                          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => abrirRecibo(m.recibo_path!)}>
                            <Paperclip className="w-3.5 h-3.5 mr-1" aria-hidden="true" />ver
                          </Button>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      {podeApagar && (
                        <td className="px-3 py-2 text-right">
                          {!m.purchase_request_id && (
                            <Button variant="ghost" size="icon" title="Apagar este lançamento" disabled={apagar.isPending}
                              onClick={() => apagar.mutate(m.id)}>
                              <Trash2 className="w-4 h-4" aria-hidden="true" /><span className="sr-only">Apagar</span>
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {lancando && (
        <NovoLancamento tipo={lancando} saldo={saldo} valorSemanal={config?.caixinha_valor_semanal ?? null}
          onFechar={() => setLancando(null)} />
      )}

      <Sheet open={!!pedidoAberto} onOpenChange={(o) => !o && setAberto(null)}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
          {pedidoAberto && (
            <>
              <SheetHeader className="pr-8"><SheetTitle className="text-left text-[18px]">{pedidoAberto.product_name}</SheetTitle></SheetHeader>
              <div className="mt-4">
                <PurchasePanel ticketId={pedidoAberto.ticket_id} onUpdate={() => { refetch(); refetchPedidos(); }} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function NovoLancamento({ tipo, saldo, valorSemanal, onFechar }: {
  tipo: Lancamento; saldo: number; valorSemanal: number | null; onFechar: () => void;
}) {
  const lancar = useLancarNaCaixinha();
  const [valor, setValor] = useState(tipo === 'entrada' && valorSemanal ? String(valorSemanal).replace('.', ',') : '');
  const [descricao, setDescricao] = useState(tipo === 'entrada' ? 'Repasse semanal' : '');
  const [data, setData] = useState(todayISO());
  const [recibo, setRecibo] = useState<File | null>(null);
  // O suprimento comprado entra no Estoque de Compras (opcional; 2026-10-15).
  const { data: suprimentos = [] } = useSuprimentos();
  const [produto, setProduto] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const qtd = Number(quantidade.replace(',', '.'));
  // "1.234,50" e "12,50" (vírgula decimal) ou "12.50".
  const numero = Number(valor.includes(',') ? valor.replace(/\./g, '').replace(',', '.') : valor);
  const valido = numero > 0 && descricao.trim() !== '' && !!data && (tipo === 'entrada' || !!recibo) && (!produto || qtd > 0);
  const passaDoSaldo = tipo === 'saida' && numero > saldo;

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{tipo === 'entrada' ? 'Registrar entrada' : 'Registrar saída'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cx-valor">Valor (R$)</Label>
            <Input id="cx-valor" inputMode="decimal" className="w-40 font-mono" value={valor} onChange={(e) => setValor(e.target.value)} />
            {passaDoSaldo && <p className="text-xs text-status-danger">O Caixinha tem {formatBRL(saldo)}: registre a entrada antes.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cx-descricao">{tipo === 'entrada' ? 'Descrição' : 'O que foi comprado'}</Label>
            <Input id="cx-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)}
              placeholder={tipo === 'saida' ? 'Ex.: café e adoçante no mercado' : undefined} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cx-data">Data</Label>
            <input id="cx-data" type="date" value={data} onChange={(e) => setData(e.target.value)}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm" />
          </div>
          {tipo === 'saida' && (
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
              <Paperclip className="w-4 h-4" aria-hidden="true" />
              <span className={cn(!recibo && 'text-primary underline')}>{recibo ? recibo.name : 'Anexar recibo *'}</span>
              <input type="file" className="hidden" onChange={(e) => setRecibo(e.target.files?.[0] ?? null)} />
            </label>
          )}
          {tipo === 'saida' && suprimentos.some((p) => p.is_active) && (
            <div className="grid grid-cols-[1fr_8rem] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cx-suprimento">Entra no estoque (opcional)</Label>
                <select id="cx-suprimento" value={produto} onChange={(e) => setProduto(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm">
                  <option value="">Não é suprimento</option>
                  {suprimentos.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unidade})</option>)}
                </select>
              </div>
              {produto && (
                <div className="space-y-1.5">
                  <Label htmlFor="cx-qtd">Quantidade</Label>
                  <Input id="cx-qtd" inputMode="decimal" className="font-mono" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button disabled={!valido || passaDoSaldo || lancar.isPending}
            onClick={() => lancar.mutate({ tipo, valor: numero, descricao, data, recibo, produto_id: produto || null, quantidade: produto ? qtd : null }, { onSuccess: onFechar })}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
