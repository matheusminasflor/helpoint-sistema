// Compras › Estoque (dono, 2026-10-15): "sempre que formos comprar algo, selecionar em compras o produto que foi
// comprado para entrar no estoque, seja pela Caixinha, seja por compras em geral. E quando for saída o usuário
// manualmente retira do estoque colocando a data de saída, quem retirou, hora e motivo". Só os suprimentos do
// Catálogo (marcados lá, com o estoque mínimo); o saldo e o aviso de reposição moram no banco (20270118010000).
import { useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Boxes, Trash2 } from 'lucide-react';
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
import { useDecideACaixinha } from '@/hooks/useCaixinha';
import { useProfiles } from '@/hooks/useInventory';
import {
  useApagarDoEstoque, useLancarNoEstoque, useMovimentosDoEstoque, useSuprimentos, type Suprimento,
} from '@/hooks/useEstoque';
import { dataHora, fromLocalDateTimeInput, toLocalDateTimeInput } from '@/lib/dates';
import { cn } from '@/lib/utils';

type Lancamento = 'entrada' | 'saida';

const qtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

export default function ComprasEstoque() {
  const { can } = useDepartmentPermissions('compras');
  const decide = useDecideACaixinha();
  const podeLancar = can('estoque', 'create') || decide;
  const podeApagar = can('estoque', 'delete');
  const { data: suprimentos = [], isLoading } = useSuprimentos();
  const { data: movimentos = [] } = useMovimentosDoEstoque();
  const { profiles } = useProfiles();
  const apagar = useApagarDoEstoque();
  const [lancando, setLancando] = useState<Lancamento | null>(null);

  const saldos = useMemo(() => {
    const s = new Map<string, number>();
    for (const m of movimentos) s.set(m.produto_id, (s.get(m.produto_id) ?? 0) + (m.tipo === 'entrada' ? m.quantidade : -m.quantidade));
    return s;
  }, [movimentos]);
  const nomeDoProduto = useMemo(() => new Map(suprimentos.map((p) => [p.id, p])), [suprimentos]);
  const nomeDaPessoa = useMemo(() => new Map(profiles.map((p) => [p.id, p.full_name || p.email])), [profiles]);
  const ativos = suprimentos.filter((p) => p.is_active || (saldos.get(p.id) ?? 0) > 0);

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Estoque de suprimentos"
        description="Folhas, café, copos… A compra registrada (e a da Caixinha) entra sozinha; a retirada se registra aqui. Abaixo do mínimo, Compras é avisado."
        icon={Boxes}
        actions={podeLancar && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setLancando('saida')}><ArrowUpCircle className="w-4 h-4 mr-1.5" aria-hidden="true" />Registrar retirada</Button>
            <Button variant="outline" onClick={() => setLancando('entrada')}><ArrowDownCircle className="w-4 h-4 mr-1.5" aria-hidden="true" />Entrada manual</Button>
          </div>
        )}
      />
      <div className="p-4 lg:p-6 space-y-4">
        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="p-4 space-y-1">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : ativos.length === 0 ? (
            <EmptyState icon={Boxes} title="Nenhum suprimento"
              description='Marque "Suprimento (controla estoque)" no Catálogo de Produtos nos itens do dia a dia.' />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-border bg-secondary/60 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">Suprimento</th>
                    <th className="px-3 py-2 font-semibold text-right">Em estoque</th>
                    <th className="px-3 py-2 font-semibold text-right">Mínimo</th>
                    <th className="px-3 py-2 font-semibold">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {ativos.map((p) => {
                    const saldo = saldos.get(p.id) ?? 0;
                    const baixo = p.estoque_minimo > 0 && saldo < p.estoque_minimo;
                    return (
                      <tr key={p.id} className="border-b border-border">
                        <td className="px-3 py-2 font-medium">{p.name}</td>
                        <td className={cn('px-3 py-2 font-mono text-right', baixo && 'text-status-danger font-semibold')}>
                          {qtd(saldo)} {p.unidade}
                        </td>
                        <td className="px-3 py-2 font-mono text-right text-muted-foreground">
                          {p.estoque_minimo > 0 ? `${qtd(p.estoque_minimo)} ${p.unidade}` : '—'}
                        </td>
                        <td className="px-3 py-2">
                          <Badge className={baixo ? 'badge-danger' : 'badge-success'}>{baixo ? 'Repor' : 'Ok'}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
                    <th className="px-3 py-2 font-semibold">Suprimento</th>
                    <th className="px-3 py-2 font-semibold text-right">Quantidade</th>
                    <th className="px-3 py-2 font-semibold">Quem retirou</th>
                    <th className="px-3 py-2 font-semibold">Motivo</th>
                    {podeApagar && <th className="px-3 py-2" aria-label="Ações" />}
                  </tr>
                </thead>
                <tbody>
                  {movimentos.map((m) => {
                    const p = nomeDoProduto.get(m.produto_id);
                    const automatico = !!(m.purchase_request_id || m.caixinha_movimento_id);
                    return (
                      <tr key={m.id} className="border-b border-border">
                        <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{dataHora(m.quando)}</td>
                        <td className="px-3 py-2">{p?.name ?? '—'}</td>
                        <td className={cn('px-3 py-2 font-mono text-right', m.tipo === 'entrada' ? 'text-status-success' : 'text-status-danger')}>
                          {m.tipo === 'entrada' ? '+' : '−'} {qtd(m.quantidade)} {p?.unidade}
                        </td>
                        <td className="px-3 py-2">{m.retirado_por ? nomeDaPessoa.get(m.retirado_por) ?? '—' : '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">{m.motivo || '—'}</td>
                        {podeApagar && (
                          <td className="px-3 py-2 text-right">
                            {!automatico && (
                              <Button variant="ghost" size="icon" title="Apagar este lançamento" disabled={apagar.isPending}
                                onClick={() => apagar.mutate(m.id)}>
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
      </div>

      {lancando && (
        <NovoLancamento tipo={lancando} suprimentos={suprimentos.filter((p) => p.is_active)} saldos={saldos}
          pessoas={profiles} onFechar={() => setLancando(null)} />
      )}
    </div>
  );
}

function NovoLancamento({ tipo, suprimentos, saldos, pessoas, onFechar }: {
  tipo: Lancamento;
  suprimentos: Suprimento[];
  saldos: Map<string, number>;
  pessoas: Array<{ id: string; full_name: string | null; email: string }>;
  onFechar: () => void;
}) {
  const lancar = useLancarNoEstoque();
  const [produto, setProduto] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [quando, setQuando] = useState(toLocalDateTimeInput(new Date().toISOString()));
  const [quem, setQuem] = useState('');
  const [motivo, setMotivo] = useState('');
  const numero = Number(quantidade.replace(',', '.'));
  const item = suprimentos.find((p) => p.id === produto);
  const saldo = saldos.get(produto) ?? 0;
  const passa = tipo === 'saida' && !!item && numero > saldo;
  const valido = !!produto && numero > 0 && !!quando && motivo.trim() !== '' && (tipo === 'entrada' || !!quem) && !passa;
  const campo = 'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm';

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
        <DialogHeader><DialogTitle>{tipo === 'saida' ? 'Registrar retirada' : 'Entrada manual'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="es-produto">Suprimento *</Label>
            <select id="es-produto" className={campo} value={produto} onChange={(e) => setProduto(e.target.value)}>
              <option value="">Escolha…</option>
              {suprimentos.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({qtd(saldos.get(p.id) ?? 0)} {p.unidade} em estoque)</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="es-qtd">Quantidade{item ? ` (${item.unidade})` : ''} *</Label>
              <Input id="es-qtd" inputMode="decimal" className="font-mono" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es-quando">Data e hora *</Label>
              <input id="es-quando" type="datetime-local" className={campo} value={quando} onChange={(e) => setQuando(e.target.value)} />
            </div>
          </div>
          {passa && <p className="text-xs text-status-danger">O estoque tem {qtd(saldo)} {item?.unidade}.</p>}
          {tipo === 'saida' && (
            <div className="space-y-1.5">
              <Label htmlFor="es-quem">Quem retirou *</Label>
              <select id="es-quem" className={campo} value={quem} onChange={(e) => setQuem(e.target.value)}>
                <option value="">Escolha…</option>
                {pessoas.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="es-motivo">Motivo *</Label>
            <Input id="es-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder={tipo === 'saida' ? 'Ex.: copa do escritório, reunião' : 'Ex.: contagem do estoque'} />
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
