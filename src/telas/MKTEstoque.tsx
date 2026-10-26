// Marketing › Estoque (dono, 2026-10-19): "Marketing precisa de Estoque e não inventário, pois precisa por quantidade dos
// produtos e entrada e saída". Estoque próprio do Marketing; entra à mão ou pela compra registrada de um produto ligado ao
// Catálogo de Compras; sai pela retirada (data e hora, quem retirou, motivo). Saldo e aviso de reposição no banco
// (20270128010000). Substitui o Inventário do Marketing — os itens de lá viraram produtos daqui.
import { useQueryState } from '@/hooks/useQueryState';
import { casaBusca } from '@/lib/tabela';
import { useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Boxes, Pencil, Plus, Trash2 } from 'lucide-react';
import { ConfirmarExclusao } from '@/components/ui/ConfirmarExclusao';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { useProfiles } from '@/hooks/useInventory';
import {
  useApagarDoEstoqueMkt, useCatalogoDeCompras, useLancarNoEstoqueMkt, useMovimentosMkt, useProdutosMkt, useSalvarProdutoMkt,
  type ProdutoMkt,
} from '@/hooks/useEstoqueMkt';
import { dataHora, fromLocalDateTimeInput, toLocalDateTimeInput } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { saldosDoEstoque } from '@/lib/indicadores-do-marketing';

type Lancamento = 'entrada' | 'saida';

const qtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const campo = 'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm';

export default function MKTEstoque() {
  const { can } = useDepartmentPermissions('marketing');
  const podeLancar = can('estoque', 'create');
  const podeCadastrar = can('estoque', 'edit');
  const podeApagar = can('estoque', 'delete');
  const { data: produtos = [], isLoading } = useProdutosMkt();
  const { data: movimentos = [] } = useMovimentosMkt();
  const { profiles } = useProfiles();
  const apagar = useApagarDoEstoqueMkt();
  const [lancando, setLancando] = useState<Lancamento | null>(null);
  // "Retirar" direto na linha (etapa 4 · Marketing, 2026-10-25): o produto já vem escolhido.
  const [produtoDaLinha, setProdutoDaLinha] = useState('');
  const retirar = (id: string) => { setProdutoDaLinha(id); setLancando('saida'); };
  const [apagando, setApagando] = useState<{ id: string; texto: string } | null>(null);
  const [editando, setEditando] = useState<ProdutoMkt | 'novo' | null>(null);
  const [verInativos, setVerInativos] = useState(false);

  const saldos = useMemo(() => saldosDoEstoque(movimentos), [movimentos]);
  const produtoPorId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
  const nomeDaPessoa = useMemo(() => new Map(profiles.map((p) => [p.id, p.full_name || p.email])), [profiles]);
  const inativos = produtos.filter((p) => !p.ativo).length;
  const [busca, setBusca] = useQueryState<string>('q', '');
  const visiveis = produtos.filter((p) => (verInativos || p.ativo || (saldos.get(p.id) ?? 0) > 0) && casaBusca([p.nome], busca));

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Estoque do Marketing"
        description="Brindes, amostras, material gráfico… Quantidade de cada produto, entradas e retiradas. Abaixo do mínimo, o Marketing é avisado."
        icon={Boxes}
        actions={(podeLancar || podeCadastrar) && (
          <div className="flex flex-wrap gap-2">
            {podeLancar && <Button onClick={() => setLancando('saida')}><ArrowUpCircle className="w-4 h-4 mr-1.5" aria-hidden="true" />Registrar retirada</Button>}
            {podeLancar && <Button variant="outline" onClick={() => setLancando('entrada')}><ArrowDownCircle className="w-4 h-4 mr-1.5" aria-hidden="true" />Registrar entrada</Button>}
            {podeCadastrar && <Button variant="outline" onClick={() => setEditando('novo')}><Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />Novo produto</Button>}
          </div>
        )}
      />
      <div className="p-4 lg:p-6 space-y-4">
        {/* Busca no estoque (etapa 4 · Compras, 2026-10-24): nenhum dos dois estoques buscava. */}
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto" aria-label="Buscar produto no estoque" className="max-w-xs" />
        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="p-4 space-y-1">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : visiveis.length === 0 ? (
            <EmptyState icon={Boxes} title="Nenhum produto no estoque"
              description={podeCadastrar ? 'Cadastre em "Novo produto" o que o Marketing guarda.' : 'Ninguém cadastrou produtos ainda.'} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-border bg-secondary/60 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">Produto</th>
                    <th className="px-3 py-2 font-semibold">Categoria</th>
                    <th className="px-3 py-2 font-semibold">Local</th>
                    <th className="px-3 py-2 font-semibold text-right">Em estoque</th>
                    <th className="px-3 py-2 font-semibold text-right">Mínimo</th>
                    <th className="px-3 py-2 font-semibold">Situação</th>
                    {(podeCadastrar || podeLancar) && <th className="px-3 py-2" aria-label="Ações" />}
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((p) => {
                    const saldo = saldos.get(p.id) ?? 0;
                    const baixo = p.estoque_minimo > 0 && saldo < p.estoque_minimo;
                    return (
                      <tr key={p.id} className={cn('border-b border-border', !p.ativo && 'text-muted-foreground')}>
                        <td className="px-3 py-2 font-medium">
                          {p.nome}
                          {!p.ativo && <Badge variant="outline" className="ml-1.5 text-[12px]">inativo</Badge>}
                        </td>
                        <td className="px-3 py-2">{p.categoria || '—'}</td>
                        <td className="px-3 py-2">{p.local || '—'}</td>
                        <td className={cn('px-3 py-2 font-mono text-right', baixo && 'text-status-danger font-semibold')}>
                          {qtd(saldo)} {p.unidade}
                        </td>
                        <td className="px-3 py-2 font-mono text-right text-muted-foreground">
                          {p.estoque_minimo > 0 ? `${qtd(p.estoque_minimo)} ${p.unidade}` : '—'}
                        </td>
                        <td className="px-3 py-2">
                          {saldo <= 0
                            ? <Badge className="badge-danger">Sem estoque</Badge>
                            : <Badge className={baixo ? 'badge-warning' : 'badge-success'}>{baixo ? 'Repor' : 'Ok'}</Badge>}
                        </td>
                        {(podeCadastrar || podeLancar) && (
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {podeLancar && p.ativo && (
                              <Button size="sm" variant="outline" disabled={saldo <= 0} onClick={() => retirar(p.id)}>Retirar</Button>
                            )}
                            {podeCadastrar && (
                              <Button variant="ghost" size="icon" title="Editar produto" onClick={() => setEditando(p)}>
                                <Pencil className="w-4 h-4" aria-hidden="true" /><span className="sr-only">Editar {p.nome}</span>
                              </Button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {inativos > 0 && (
            <button type="button" onClick={() => setVerInativos((v) => !v)}
              className="px-3 py-2 text-[13px] text-muted-foreground underline hover:text-foreground">
              {verInativos ? 'Esconder os inativos' : `Mostrar os inativos (${inativos})`}
            </button>
          )}
        </Card>

        <Card className="overflow-hidden">
          <h2 className="px-3 py-2 text-[15px] font-semibold border-b border-border">Entradas e retiradas</h2>
          {movimentos.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Nada lançado ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-border bg-secondary/60 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">Quando</th>
                    <th className="px-3 py-2 font-semibold">Produto</th>
                    <th className="px-3 py-2 font-semibold text-right">Quantidade</th>
                    <th className="px-3 py-2 font-semibold">Quem retirou</th>
                    <th className="px-3 py-2 font-semibold">Motivo</th>
                    {podeApagar && <th className="px-3 py-2" aria-label="Ações" />}
                  </tr>
                </thead>
                <tbody>
                  {movimentos.map((m) => {
                    const p = produtoPorId.get(m.produto_id);
                    return (
                      <tr key={m.id} className="border-b border-border">
                        <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{dataHora(m.quando)}</td>
                        <td className="px-3 py-2">{p?.nome ?? '—'}</td>
                        <td className={cn('px-3 py-2 font-mono text-right', m.tipo === 'entrada' ? 'text-status-success' : 'text-status-danger')}>
                          {m.tipo === 'entrada' ? '+' : '−'} {qtd(m.quantidade)} {p?.unidade}
                        </td>
                        <td className="px-3 py-2">{m.retirado_por ? nomeDaPessoa.get(m.retirado_por) ?? '—' : '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">{m.motivo || '—'}</td>
                        {podeApagar && (
                          <td className="px-3 py-2 text-right">
                            {!m.purchase_request_id && (
                              <Button variant="ghost" size="icon" title="Apagar este lançamento" disabled={apagar.isPending}
                                onClick={() => setApagando({ id: m.id, texto: `${m.tipo === 'entrada' ? 'Entrada' : 'Saída'} de ${qtd(m.quantidade)} ${p?.unidade ?? ''} de ${p?.nome ?? 'produto'}, em ${dataHora(m.quando)}` })}>
                                <Trash2 className="w-4 h-4" aria-hidden="true" /><span className="sr-only">Apagar</span>
                              </Button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <ConfirmarExclusao aberto={!!apagando} titulo="Apagar este lançamento do estoque?"
          descricao={apagando ? `${apagando.texto}. O saldo do produto muda e o lançamento não volta.` : ''}
          enviando={apagar.isPending} onCancelar={() => setApagando(null)}
          onConfirmar={() => apagando && apagar.mutate(apagando.id, { onSuccess: () => setApagando(null) })} />
      </div>

      {lancando && (
        <NovoLancamento tipo={lancando} produtos={produtos.filter((p) => p.ativo)} saldos={saldos}
          pessoas={profiles} produtoInicial={produtoDaLinha} onFechar={() => { setLancando(null); setProdutoDaLinha(''); }} />
      )}
      {editando && (
        <FormularioProduto produto={editando === 'novo' ? null : editando} onFechar={() => setEditando(null)} />
      )}
    </div>
  );
}

function FormularioProduto({ produto, onFechar }: { produto: ProdutoMkt | null; onFechar: () => void }) {
  const salvar = useSalvarProdutoMkt();
  const { data: catalogo = [] } = useCatalogoDeCompras();
  const [nome, setNome] = useState(produto?.nome ?? '');
  const [unidade, setUnidade] = useState(produto?.unidade ?? 'un');
  const [categoria, setCategoria] = useState(produto?.categoria ?? '');
  const [local, setLocal] = useState(produto?.local ?? '');
  const [minimo, setMinimo] = useState(produto ? String(produto.estoque_minimo) : '0');
  const [catalogoId, setCatalogoId] = useState(produto?.compras_produto_id ?? '');
  const [ativo, setAtivo] = useState(produto?.ativo ?? true);
  const numero = Number(minimo.replace(',', '.'));
  const valido = nome.trim() !== '' && unidade.trim() !== '' && Number.isFinite(numero) && numero >= 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{produto ? `Editar ${produto.nome}` : 'Novo produto'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pm-nome">Nome *</Label>
            <Input id="pm-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Caneca MF PRO" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pm-unidade">Unidade *</Label>
              <Input id="pm-unidade" value={unidade} onChange={(e) => setUnidade(e.target.value)} placeholder="un, caixa, rolo" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pm-minimo">Estoque mínimo</Label>
              <Input id="pm-minimo" inputMode="decimal" className="font-mono" value={minimo} onChange={(e) => setMinimo(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pm-categoria">Categoria</Label>
              <Input id="pm-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ex.: Brindes" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pm-local">Onde fica</Label>
              <Input id="pm-local" value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Ex.: Armário MKT" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pm-catalogo">Produto no Catálogo de Compras</Label>
            <select id="pm-catalogo" className={campo} value={catalogoId} onChange={(e) => setCatalogoId(e.target.value)}>
              <option value="">Não ligar</option>
              {catalogo.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">
              Ligado, a compra registrada deste produto entra sozinha no estoque, pela quantidade aprovada.
            </p>
          </div>
          {produto && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
              Ativo (desmarque para tirar das listas; o histórico fica)
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button disabled={!valido || salvar.isPending} onClick={() => salvar.mutate(
            { id: produto?.id, nome, unidade, categoria, local, estoque_minimo: numero, compras_produto_id: catalogoId || null, ativo },
            { onSuccess: onFechar },
          )}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NovoLancamento({ tipo, produtos, saldos, pessoas, produtoInicial = '', onFechar }: {
  tipo: Lancamento;
  produtoInicial?: string;
  produtos: ProdutoMkt[];
  saldos: Map<string, number>;
  pessoas: Array<{ id: string; full_name: string | null; email: string }>;
  onFechar: () => void;
}) {
  const lancar = useLancarNoEstoqueMkt();
  const [produto, setProduto] = useState(produtoInicial);
  const [quantidade, setQuantidade] = useState('');
  const [quando, setQuando] = useState(toLocalDateTimeInput(new Date().toISOString()));
  const [quem, setQuem] = useState('');
  const [motivo, setMotivo] = useState('');
  const numero = Number(quantidade.replace(',', '.'));
  const item = produtos.find((p) => p.id === produto);
  const saldo = saldos.get(produto) ?? 0;
  const passa = tipo === 'saida' && !!item && numero > saldo;
  const valido = !!produto && numero > 0 && !!quando && motivo.trim() !== '' && (tipo === 'entrada' || !!quem) && !passa;

  const salvar = () => {
    let momento: string;
    try { momento = fromLocalDateTimeInput(quando); } catch { return; }
    lancar.mutate(
      { produto_id: produto, tipo, quantidade: numero, quando: momento, retirado_por: tipo === 'saida' ? quem : null, motivo },
      { onSuccess: onFechar },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{tipo === 'saida' ? 'Registrar retirada' : 'Registrar entrada'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="em-produto">Produto *</Label>
            <select id="em-produto" className={campo} value={produto} onChange={(e) => setProduto(e.target.value)}>
              <option value="">Escolha…</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>{p.nome} ({qtd(saldos.get(p.id) ?? 0)} {p.unidade} em estoque)</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="em-qtd">Quantidade{item ? ` (${item.unidade})` : ''} *</Label>
              <Input id="em-qtd" inputMode="decimal" className="font-mono" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="em-quando">Data e hora *</Label>
              <input id="em-quando" type="datetime-local" className={campo} value={quando} onChange={(e) => setQuando(e.target.value)} />
            </div>
          </div>
          {passa && <p className="text-xs text-status-danger">O estoque tem {qtd(saldo)} {item?.unidade}.</p>}
          {tipo === 'saida' && (
            <div className="space-y-1.5">
              <Label htmlFor="em-quem">Quem retirou *</Label>
              <select id="em-quem" className={campo} value={quem} onChange={(e) => setQuem(e.target.value)}>
                <option value="">Escolha…</option>
                {pessoas.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="em-motivo">{tipo === 'saida' ? 'Para quê *' : 'De onde veio *'}</Label>
            <Input id="em-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder={tipo === 'saida' ? 'Ex.: evento em BH, kit de influenciadora' : 'Ex.: chegou da gráfica, contagem do armário'} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button disabled={!valido || lancar.isPending} onClick={salvar}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
