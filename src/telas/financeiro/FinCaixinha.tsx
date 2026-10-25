// Financeiro › Caixinha (dono, 2026-10-14): "um caixa que recebe valor X semanal do diretor para comprar
// suprimentos como café, adoçantes, coisas do dia a dia, com entrada e saída, mostrando tudo o que foi comprado
// e os recibos". A entrada é registrada a cada repasse (o valor semanal vem sugerido); a saída é a compra da
// categoria Caixinha registrada (nasce no banco, com o recibo) ou o gasto solto, lançado aqui com recibo.
// Quem aprova a Caixinha decide os pedidos dela aqui mesmo, no quadro "Pedidos da Caixinha".
// Duas Caixinhas (dono, 2026-10-20; 20270129010000): INBRAS e MF, cada uma com o seu responsável, saldo e pedidos.
// O Financeiro (seção Caixinha do perfil) troca entre as duas; o responsável vê só a dele — e entra por `/caixinha`,
// sem precisar do módulo Financeiro.
// Período e PDF (etapa 4 · Financeiro, 2026-10-25): a lista e os totais do período escolhido, e o PDF (com ou sem os
// recibos) daqui mesmo. O item "Relatório da Caixinha" saiu do menu — repetia esta tela; o endereço antigo traz para cá.
import { useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, FileDown, Paperclip, PiggyBank, Trash2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryState } from '@/hooks/useQueryState';
import { FiltroDePeriodo } from '@/components/financeiro/FiltroDePeriodo';
import { baixarAnexo, useCaixinhaDoRelatorio } from '@/hooks/useRelatoriosDoFinanceiro';
import { intervaloDoPeriodo, type Intervalo, type TipoDePeriodo } from '@/lib/periodo-do-relatorio';
import { gerarRelatorioPdf } from '@/lib/relatorio-pdf';
import { rotuloDoSetor } from '@/lib/setores';
import { ConfirmarExclusao } from '@/components/ui/ConfirmarExclusao';
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

import { useNomesDeQuemPediu } from '@/hooks/useNomesDeQuemPediu';
import {
  urlDoRecibo, useApagarDaCaixinha, useCaixinhas, useDecideACaixinha, useLancarNaCaixinha, useMovimentosDaCaixinha,
} from '@/hooks/useCaixinha';
import { useAuth } from '@/contexts/AuthContext';
import { usePessoasDaEmpresa } from '@/hooks/useProjetos';
import { Link } from 'react-router-dom';
import { useCreatePurchaseProduct, usePurchaseProducts, usePurchaseRequestsPanel } from '@/hooks/usePurchases';
import { useConfiguracaoDosSetores } from '@/hooks/useAccessProfiles';
import { useTenantPath } from '@/hooks/useTenantPath';
import { todayISO } from '@/lib/dates';
import { formatBRL, formatDateBR } from '@/types/financeiro';
import { cn } from '@/lib/utils';

type Lancamento = 'entrada' | 'saida';

export default function FinCaixinha() {
  const { can } = useDepartmentPermissions('financeiro');
  const { user } = useAuth();
  const { data: caixinhas = [] } = useCaixinhas();
  const { data: pessoas = [] } = usePessoasDaEmpresa();
  // Quem tem a seção Caixinha do Financeiro vê as duas; o responsável, só a dele.
  const visiveis = caixinhas.filter((c) => can('caixinha', 'view') || c.responsavel_id === user?.id);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const atual = visiveis.find((c) => c.id === escolhida) ?? visiveis[0] ?? null;
  const decide = useDecideACaixinha(atual?.id);
  // Só o responsável lança (e apaga, se tiver "Excluir"); o Financeiro vê a do outro como leitura (dono, 2026-10-20;
  // a mesma regra de `pode_na_caixinha(acao, caixinha)`).
  const podeLancar = !!atual && decide;
  const podeApagar = podeLancar && can('caixinha', 'delete');
  const { data: todos = [], isLoading, refetch } = useMovimentosDaCaixinha();
  const { data: pedidos = [], refetch: refetchPedidos } = usePurchaseRequestsPanel();
  const apagar = useApagarDaCaixinha();
  const [lancando, setLancando] = useState<Lancamento | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [apagando, setApagando] = useState<{ id: string; descricao: string; valor: number; data: string } | null>(null);

  const doAtual = useMemo(() => todos.filter((m) => m.caixinha_id === atual?.id), [todos, atual?.id]);
  // O saldo é de sempre; a lista e os totais, do período.
  const saldo = doAtual.reduce((s, m) => s + (m.tipo === 'entrada' ? m.valor : -m.valor), 0);
  const [periodo, setPeriodo] = useQueryState<TipoDePeriodo>('periodo', 'mes');
  const [personalizado, setPersonalizado] = useState<Partial<Intervalo>>({});
  const intervalo = intervaloDoPeriodo(periodo, todayISO(), personalizado);
  const movimentos = doAtual.filter((m) => m.data >= intervalo.de && m.data <= intervalo.ate);
  const noPeriodo = (t: Lancamento) => movimentos.filter((m) => m.tipo === t).reduce((s, m) => s + m.valor, 0);
  const doRelatorio = useCaixinhaDoRelatorio(intervalo);
  const [gerando, setGerando] = useState(false);
  const exportar = async (comRecibos: boolean) => {
    if (!atual) return;
    setGerando(true);
    try {
      const linhas = (doRelatorio.data ?? []).filter((l) => l.caixinha_id === atual.id);
      const entradas = linhas.filter((l) => l.tipo === 'entrada').reduce((s, l) => s + l.valor, 0);
      const saidas = linhas.filter((l) => l.tipo === 'saida').reduce((s, l) => s + l.valor, 0);
      await gerarRelatorioPdf({
        titulo: `Caixinha ${atual.filial}`,
        linhasDoCabecalho: [
          `Período: ${formatDateBR(intervalo.de)} a ${formatDateBR(intervalo.ate)}`,
          `Responsável: ${responsavel ?? '—'} · Gerado em ${formatDateBR(todayISO())}`,
        ],
        colunas: [
          { titulo: 'Data', largura: 10 }, { titulo: 'Descrição', largura: 46 }, { titulo: 'Setor', largura: 14 },
          { titulo: 'Entrada', largura: 12, direita: true }, { titulo: 'Saída', largura: 12, direita: true },
        ],
        linhas: linhas.map((l) => [formatDateBR(l.data), l.descricao, l.compra?.department ? rotuloDoSetor(l.compra.department) : '—',
          l.tipo === 'entrada' ? formatBRL(l.valor) : '', l.tipo === 'saida' ? formatBRL(l.valor) : '']),
        totais: ['', `Saldo do período: ${formatBRL(entradas - saidas)}`, '', formatBRL(entradas), formatBRL(saidas)],
        anexos: comRecibos
          ? linhas.filter((l) => l.recibo_path).map((l) => ({ titulo: `${formatDateBR(l.data)} · ${l.descricao} · ${formatBRL(l.valor)}`, path: l.recibo_path! }))
          : [],
        baixar: baixarAnexo,
        nomeDoArquivo: `caixinha-${atual.filial.toLowerCase()}-${intervalo.de}-a-${intervalo.ate}.pdf`,
      });
    } catch (e) {
      toast.error(`Não gerou o PDF: ${(e as Error).message}`);
    } finally {
      setGerando(false);
    }
  };
  const responsavel = pessoas.find((p) => p.id === atual?.responsavel_id)?.nome;

  const daCaixinha = useMemo(() => pedidos.filter((p) => p.caixinha && p.caixinha_id === atual?.id), [pedidos, atual?.id]);
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
        title={atual ? `Caixinha ${atual.filial}` : 'Caixinha'}
        description="O caixa do dia a dia: o repasse semanal entra (e aparece no Financeiro como Reposição da Caixinha, já paga), as compras pequenas saem, cada uma com o recibo."
        icon={PiggyBank}
        actions={podeLancar && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setLancando('entrada')}><ArrowDownCircle className="w-4 h-4 mr-1.5" aria-hidden="true" />Registrar entrada</Button>
            <Button variant="outline" onClick={() => setLancando('saida')}><ArrowUpCircle className="w-4 h-4 mr-1.5" aria-hidden="true" />Registrar saída</Button>
          </div>
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          {visiveis.length > 1 && visiveis.map((c) => (
            <Button key={c.id} size="sm" variant={c.id === atual?.id ? 'default' : 'outline'} aria-pressed={c.id === atual?.id}
              onClick={() => setEscolhida(c.id)}>
              {c.filial}
            </Button>
          ))}
          {atual && (
            <span className="text-[13px] text-muted-foreground">
              Responsável: {responsavel ?? 'ninguém (escolha em Compras › Configurações › Quem compra e Caixinha)'}
              {!podeLancar && ' · somente leitura para você'}
            </span>
          )}
        </div>
      </PageHeader>
      <div className="p-4 lg:p-6 space-y-4">
        {!atual && (
          <EmptyState icon={PiggyBank} title="Nenhuma Caixinha para você"
            description="Você não é responsável por nenhuma Caixinha e não tem a seção Caixinha do Financeiro." />
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <KPICard value={formatBRL(saldo)} label="Saldo do Caixinha" icon={Wallet} color={saldo > 0 ? 'green' : 'orange'} />
          <KPICard value={formatBRL(noPeriodo('entrada'))} label="Entrou no período" icon={ArrowDownCircle} color="blue" />
          <KPICard value={formatBRL(noPeriodo('saida'))} label="Saiu no período" icon={ArrowUpCircle} color="purple" />
        </div>
        {atual && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FiltroDePeriodo tipo={periodo} onTipo={setPeriodo} personalizado={personalizado} onPersonalizado={setPersonalizado} />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={gerando || doRelatorio.isLoading} onClick={() => exportar(false)}>
                <FileDown className="w-4 h-4 mr-1.5" aria-hidden="true" />{gerando ? 'Gerando…' : 'Exportar PDF'}
              </Button>
              <Button size="sm" variant="ghost" disabled={gerando || doRelatorio.isLoading} onClick={() => exportar(true)}>
                PDF com os recibos
              </Button>
            </div>
          </div>
        )}

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
            <EmptyState icon={PiggyBank} title={doAtual.length ? 'Nada lançado neste período' : 'Nada lançado ainda'}
              description={doAtual.length ? 'Escolha outro período acima.' : 'Comece pela entrada do repasse em "Registrar entrada".'} />
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
                              onClick={() => setApagando(m)}>
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
        <ConfirmarExclusao aberto={!!apagando} titulo="Apagar este lançamento da Caixinha?"
          descricao={apagando ? `“${apagando.descricao}”, ${formatBRL(apagando.valor)}, de ${formatDateBR(apagando.data)}. O saldo da Caixinha muda e o lançamento não volta.` : ''}
          enviando={apagar.isPending} onCancelar={() => setApagando(null)}
          onConfirmar={() => apagando && apagar.mutate(apagando.id, { onSuccess: () => setApagando(null) })} />
      </div>

      {lancando && atual && (
        <NovoLancamento tipo={lancando} saldo={saldo} valorSemanal={atual.valor_semanal} caixinhaId={atual.id}
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

function NovoLancamento({ tipo, saldo, valorSemanal, caixinhaId, onFechar }: {
  tipo: Lancamento; saldo: number; valorSemanal: number | null; caixinhaId: string; onFechar: () => void;
}) {
  const lancar = useLancarNaCaixinha();
  const tenantPath = useTenantPath();
  const [valor, setValor] = useState(tipo === 'entrada' && valorSemanal ? String(valorSemanal).replace('.', ',') : '');
  const [descricao, setDescricao] = useState(tipo === 'entrada' ? 'Repasse semanal' : '');
  const [data, setData] = useState(todayISO());
  const [recibo, setRecibo] = useState<File | null>(null);
  // A saída diz O QUE foi comprado escolhendo no Catálogo de Produtos (dono, 2026-10-15): o que não está lá se
  // cadastra antes. O suprimento entra no Estoque de Compras pela quantidade. Recibo: opcional.
  const { data: catalogo = [] } = usePurchaseProducts('', { includeInactive: true });
  const produtos = catalogo.filter((p) => p.is_active);
  const [produto, setProduto] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  // Cadastrar o produto sem sair da Caixinha (etapa 4 · Compras, 2026-10-25), para quem já cadastra no Catálogo.
  const perfil = useConfiguracaoDosSetores();
  const podeCadastrar = !perfil.isLoading && !perfil.isError && perfil.pode('compras', 'catalogo', 'edit');
  const criarProduto = useCreatePurchaseProduct();
  const [novoNome, setNovoNome] = useState<string | null>(null);
  const [novoSuprimento, setNovoSuprimento] = useState(false);
  const cadastrar = () => novoNome?.trim() && criarProduto.mutate(
    { name: novoNome, suprimento: novoSuprimento, unidade: 'un', estoque_minimo: 0 },
    { onSuccess: (p) => { setProduto(p.id); setNovoNome(null); setNovoSuprimento(false); } },
  );
  const escolhido = produtos.find((p) => p.id === produto);
  const qtd = Number(quantidade.replace(',', '.'));
  // "1.234,50" e "12,50" (vírgula decimal) ou "12.50".
  const numero = Number(valor.includes(',') ? valor.replace(/\./g, '').replace(',', '.') : valor);
  const valido = numero > 0 && !!data && (tipo === 'entrada' ? descricao.trim() !== '' : !!escolhido && qtd > 0);
  const passaDoSaldo = tipo === 'saida' && numero > saldo;

  const salvar = () => lancar.mutate({
    caixinha_id: caixinhaId, tipo, valor: numero, data, recibo,
    descricao: tipo === 'saida' && escolhido ? `${escolhido.name}${descricao.trim() ? ` — ${descricao.trim()}` : ''}` : descricao,
    produto_id: tipo === 'saida' ? produto : null,
    quantidade: tipo === 'saida' ? qtd : null,
  }, { onSuccess: onFechar });

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
          {tipo === 'saida' ? (
            <>
              <div className="grid grid-cols-[1fr_7rem] gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cx-produto">O que foi comprado *</Label>
                  <select id="cx-produto" value={produto} onChange={(e) => setProduto(e.target.value)}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm">
                    <option value="">Escolha no Catálogo…</option>
                    {produtos.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}{p.suprimento ? ` (estoque, ${p.unidade ?? 'un'})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cx-qtd">Quantidade *</Label>
                  <Input id="cx-qtd" inputMode="decimal" className="font-mono" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
                </div>
              </div>
              {novoNome !== null ? (
                <div className="rounded-md border border-border p-3 space-y-2">
                  <Label htmlFor="cx-novo">Produto novo no Catálogo</Label>
                  <div className="flex gap-2">
                    <Input id="cx-novo" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex.: Café 500 g" autoFocus />
                    <Button type="button" size="sm" disabled={!novoNome.trim() || criarProduto.isPending} onClick={cadastrar}>Cadastrar</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setNovoNome(null)}>Cancelar</Button>
                  </div>
                  <label className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" checked={novoSuprimento} onChange={(e) => setNovoSuprimento(e.target.checked)} />
                    É suprimento (controla estoque, em unidades; o mínimo se ajusta depois no Catálogo)
                  </label>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Não está na lista?{' '}
                  {podeCadastrar
                    ? <button type="button" className="text-primary underline" onClick={() => setNovoNome('')}>Cadastrar aqui</button>
                    : <>Cadastre antes em <Link to={tenantPath('/compras/catalogo')} className="text-primary underline">Compras › Catálogo de Produtos</Link></>}.
                  {escolhido?.suprimento && ' Este item é suprimento: a quantidade entra no Estoque.'}
                </p>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="cx-descricao">Observação <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                <Input id="cx-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: mercado do bairro" />
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="cx-descricao">Descrição</Label>
              <Input id="cx-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="cx-data">Data</Label>
            <input id="cx-data" type="date" value={data} onChange={(e) => setData(e.target.value)}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm" />
          </div>
          {tipo === 'saida' && (
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
              <Paperclip className="w-4 h-4" aria-hidden="true" />
              <span className={cn(!recibo && 'text-primary underline')}>{recibo ? recibo.name : 'Anexar recibo ou nota (opcional)'}</span>
              <input type="file" className="hidden" onChange={(e) => setRecibo(e.target.files?.[0] ?? null)} />
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button disabled={!valido || passaDoSaldo || lancar.isPending} onClick={salvar}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
