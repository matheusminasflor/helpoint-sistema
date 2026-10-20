// Marketing › Benefício de sexta (dono, 2026-10-20). Na sexta o responsável registra quem leva o quê; segunda ao
// meio-dia é o prazo. A tela abre no que pede ação (leis de UX: o que está atrasado e o que espera liberação primeiro;
// vermelho só para atraso e má-fé), depois quem está com produto, o histórico por colaborador e os produtos.
import { useMemo, useState } from 'react';
import { Gift, Plus, RotateCcw, Settings } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { usePessoasDaEmpresa } from '@/hooks/useProjetos';
import {
  useConfigDoBeneficio, useDevolver, useEhLiberador, useLiberar, useLinhas, useProdutosDoBeneficio, useRetiradas, useRetirar,
  useSalvarConfigDoBeneficio, useSalvarProduto, type ProdutoDoBeneficio, type Retirada,
} from '@/hooks/useBeneficioDeSexta';
import { conferirRegra } from '@/lib/beneficio-de-sexta';
import { format } from 'date-fns';

const quando = (iso: string | null) => (iso ? format(new Date(iso), 'dd/MM HH:mm') : '—');
const ESTADO: Record<string, string> = { normal: 'Normal', uso_acima: 'Uso acima do ideal', danificado: 'Danificado' };
const SEIS_MESES = 183 * 24 * 3600 * 1000;

export default function MKTBeneficioDeSexta() {
  const { user, role } = useAuth();
  const admin = role === 'owner' || role === 'admin';
  const { data: config } = useConfigDoBeneficio();
  const { data: retiradas = [], isLoading } = useRetiradas();
  const { data: produtos = [] } = useProdutosDoBeneficio();
  const { data: pessoas = [] } = usePessoasDaEmpresa();
  const nome = (id: string | null) => pessoas.find((p) => p.id === id)?.nome ?? '—';
  const responsavel = admin || (!!user && config?.responsavel_id === user.id);
  const { data: ehLiberador = false } = useEhLiberador();
  const liberador = admin || ehLiberador;

  const [retirando, setRetirando] = useState(false);
  const [devolvendo, setDevolvendo] = useState<Retirada | null>(null);
  const [decidindo, setDecidindo] = useState<Retirada | null>(null);
  const [produto, setProduto] = useState<Partial<ProdutoDoBeneficio> | null>(null);
  const [configurando, setConfigurando] = useState(false);

  const agora = Date.now();
  const esperando = retiradas.filter((r) => r.status === 'aguardando_liberacao');
  const fora = retiradas.filter((r) => r.status === 'retirada')
    .sort((a, b) => new Date(a.prazo ?? 0).getTime() - new Date(b.prazo ?? 0).getTime());
  const vencida = (r: Retirada) => !!r.prazo && new Date(r.prazo).getTime() < agora;

  // Disponível = quantidade − o que está fora ou esperando liberação.
  const usados = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of retiradas) if (r.status === 'retirada' || r.status === 'aguardando_liberacao')
      for (const i of r.itens) if (i.produto) m.set(i.produto.id, (m.get(i.produto.id) ?? 0) + i.quantidade);
    return m;
  }, [retiradas]);

  // Histórico por colaborador: retiradas, atrasos nos últimos 6 meses (a conta do banco) e má-fé.
  const porColaborador = useMemo(() => {
    const m = new Map<string, { retiradas: number; atrasos6m: number; maFe: number; ultima: string }>();
    for (const r of retiradas) {
      if (r.status === 'recusada') continue;
      const x = m.get(r.colaborador_id) ?? { retiradas: 0, atrasos6m: 0, maFe: 0, ultima: r.pedido_em };
      x.retiradas += 1;
      if ((r.atraso || (r.status === 'retirada' && vencida(r))) && agora - new Date(r.pedido_em).getTime() < SEIS_MESES) x.atrasos6m += 1;
      if (r.ma_fe) x.maFe += 1;
      m.set(r.colaborador_id, x);
    }
    return [...m.entries()].sort((a, b) => b[1].atrasos6m - a[1].atrasos6m || b[1].maFe - a[1].maFe);
  }, [retiradas]); // eslint-disable-line react-hooks/exhaustive-deps

  const itensEmTexto = (r: Retirada) => r.itens.map((i) => `${i.quantidade}× ${i.produto?.nome ?? '?'}`).join(', ');

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Benefício de sexta" icon={Gift}
        description="Na sexta o colaborador leva até 3 produtos da mesma linha (ou 2 de linhas diferentes) e devolve segunda até o meio-dia."
        actions={
          <div className="flex flex-wrap gap-2">
            {admin && <Button variant="outline" onClick={() => setConfigurando(true)}><Settings className="w-4 h-4 mr-1.5" aria-hidden="true" />Configurar</Button>}
            {responsavel && <Button onClick={() => setRetirando(true)}><Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />Registrar retirada</Button>}
          </div>
        }>
        <p className="text-[13px] text-muted-foreground">
          Responsável: {config?.responsavel_id ? nome(config.responsavel_id) : 'ninguém (Configurar)'} · Libera quem tem 2 atrasos: gestor do Marketing
          {config?.liberador_id ? ` e ${nome(config.liberador_id)}` : ''}
        </p>
      </PageHeader>

      <div className="p-4 lg:p-6 space-y-6">
        {isLoading ? <Skeleton className="h-40 w-full" /> : (
          <>
            {esperando.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-[15px] font-semibold">Esperando liberação ({esperando.length})</h2>
                {esperando.map((r) => (
                  <Card key={r.id} className="p-3 flex flex-wrap items-center gap-3 border-status-warning">
                    <span className="flex-1 min-w-[220px]"><b>{nome(r.colaborador_id)}</b> · {itensEmTexto(r)}
                      <span className="block text-[12px] text-muted-foreground">2 atrasos nos últimos 6 meses · pedido em {quando(r.pedido_em)}</span></span>
                    {liberador && <Button size="sm" onClick={() => setDecidindo(r)}>Decidir</Button>}
                  </Card>
                ))}
              </section>
            )}

            <section className="space-y-2">
              <h2 className="text-[15px] font-semibold">Com os colaboradores agora ({fora.length})</h2>
              {fora.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum produto fora.</p> : (
                <Card className="overflow-x-auto">
                  <table className="w-full text-[14px] min-w-[620px]">
                    <thead><tr className="border-b border-border text-left text-muted-foreground text-[12px]">
                      <th className="px-3 py-2">Colaborador</th><th className="px-3 py-2">Produtos</th><th className="px-3 py-2">Saiu</th>
                      <th className="px-3 py-2">Prazo</th><th className="px-3 py-2" />
                    </tr></thead>
                    <tbody>
                      {fora.map((r) => (
                        <tr key={r.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 font-medium">{nome(r.colaborador_id)}</td>
                          <td className="px-3 py-2">{itensEmTexto(r)}</td>
                          <td className="px-3 py-2 font-mono text-xs">{quando(r.retirado_em)}<span className="block text-muted-foreground font-sans">por {nome(r.registrado_por)}</span></td>
                          <td className={`px-3 py-2 font-mono text-xs ${vencida(r) ? 'text-status-danger font-bold' : ''}`}>{quando(r.prazo)}{vencida(r) && ' · atrasado'}</td>
                          <td className="px-3 py-2 text-right">
                            {responsavel && <Button size="sm" variant="outline" onClick={() => setDevolvendo(r)}><RotateCcw className="w-4 h-4 mr-1" aria-hidden="true" />Devolução</Button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}
            </section>

            <section className="space-y-2">
              <h2 className="text-[15px] font-semibold">Histórico por colaborador</h2>
              {porColaborador.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma retirada ainda.</p> : (
                <Card className="overflow-x-auto">
                  <table className="w-full text-[14px] min-w-[520px]">
                    <thead><tr className="border-b border-border text-left text-muted-foreground text-[12px]">
                      <th className="px-3 py-2">Colaborador</th><th className="px-3 py-2 text-right">Retiradas</th>
                      <th className="px-3 py-2 text-right">Atrasos (6 meses)</th><th className="px-3 py-2 text-right">Má-fé</th><th className="px-3 py-2">Situação</th>
                    </tr></thead>
                    <tbody>
                      {porColaborador.map(([id, x]) => (
                        <tr key={id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 font-medium">{nome(id)}</td>
                          <td className="px-3 py-2 text-right font-mono">{x.retiradas}</td>
                          <td className={`px-3 py-2 text-right font-mono ${x.atrasos6m >= 2 ? 'text-status-danger font-bold' : ''}`}>{x.atrasos6m}</td>
                          <td className={`px-3 py-2 text-right font-mono ${x.maFe > 0 ? 'text-status-danger font-bold' : ''}`}>{x.maFe}</td>
                          <td className="px-3 py-2">{x.atrasos6m >= 2 ? <Badge className="badge-danger">Precisa de liberação</Badge> : <span className="text-muted-foreground text-[13px]">Livre</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">Ver todas as devoluções</summary>
                <div className="mt-2 space-y-1">
                  {retiradas.filter((r) => r.status === 'devolvida' || r.status === 'recusada').map((r) => (
                    <p key={r.id} className={r.ma_fe ? 'text-status-danger' : ''}>
                      {quando(r.devolvido_em ?? r.pedido_em)} · <b>{nome(r.colaborador_id)}</b> · {itensEmTexto(r)} ·{' '}
                      {r.status === 'recusada' ? `recusada: ${r.liberacao_motivo ?? ''}` : `${r.atraso ? 'com atraso' : 'no prazo'} · ${ESTADO[r.estado_na_volta ?? 'normal']}`}
                      {r.motivo_atraso && ` · motivo: ${r.motivo_atraso}`}{r.detalhe_da_volta && ` · ${r.detalhe_da_volta}`}{r.ma_fe && ' · indício de má-fé'}
                    </p>
                  ))}
                </div>
              </details>
            </section>

            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-semibold flex-1">Produtos do benefício</h2>
                {responsavel && <Button size="sm" variant="outline" onClick={() => setProduto({ quantidade: 1, ativo: true })}><Plus className="w-4 h-4 mr-1" aria-hidden="true" />Produto</Button>}
              </div>
              <Card className="overflow-x-auto">
                <table className="w-full text-[14px] min-w-[480px]">
                  <thead><tr className="border-b border-border text-left text-muted-foreground text-[12px]">
                    <th className="px-3 py-2">Produto</th><th className="px-3 py-2">Linha</th><th className="px-3 py-2 text-right">Disponível</th><th className="px-3 py-2 text-right">Total</th>
                  </tr></thead>
                  <tbody>
                    {produtos.length === 0 && <tr><td colSpan={4} className="px-3 py-3 text-muted-foreground">Cadastre os produtos que entram no benefício.</td></tr>}
                    {produtos.map((p) => (
                      <tr key={p.id} className={`border-b border-border last:border-0 ${responsavel ? 'cursor-pointer hover:bg-muted/40' : ''} ${p.ativo ? '' : 'opacity-50'}`}
                        onClick={() => responsavel && setProduto(p)}>
                        <td className="px-3 py-2 font-medium">{p.nome}</td>
                        <td className="px-3 py-2">{p.familia?.nome ?? '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">{Math.max(0, p.quantidade - (usados.get(p.id) ?? 0))}</td>
                        <td className="px-3 py-2 text-right font-mono">{p.quantidade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </section>
          </>
        )}
      </div>

      {retirando && <RegistrarRetirada produtos={produtos.filter((p) => p.ativo)} usados={usados} onFechar={() => setRetirando(false)} />}
      {devolvendo && <RegistrarDevolucao retirada={devolvendo} atrasada={vencida(devolvendo)} onFechar={() => setDevolvendo(null)} />}
      {decidindo && <Decidir retirada={decidindo} nome={nome(decidindo.colaborador_id)} onFechar={() => setDecidindo(null)} />}
      {produto && <EditarProduto produto={produto} onFechar={() => setProduto(null)} />}
      {configurando && <Configurar onFechar={() => setConfigurando(false)} />}
    </div>
  );
}

function RegistrarRetirada({ produtos, usados, onFechar }: { produtos: ProdutoDoBeneficio[]; usados: Map<string, number>; onFechar: () => void }) {
  const { data: pessoas = [] } = usePessoasDaEmpresa();
  const retirar = useRetirar();
  const [colaborador, setColaborador] = useState('');
  const [qtd, setQtd] = useState<Record<string, number>>({});
  const escolhidos = produtos.filter((p) => (qtd[p.id] ?? 0) > 0);
  const erro = conferirRegra(escolhidos.map((p) => ({ quantidade: qtd[p.id], linha: p.familia_id })));
  const salvar = () => retirar.mutate(
    { colaborador, itens: escolhidos.map((p) => ({ produto_id: p.id, quantidade: qtd[p.id] })) },
    { onSuccess: onFechar },
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Registrar retirada</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ben-colab">Quem está levando</Label>
            <select id="ben-colab" value={colaborador} onChange={(e) => setColaborador(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
              <option value="">Escolha…</option>
              {[...pessoas].sort((a, b) => a.nome.localeCompare(b.nome)).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Produtos</p>
            {produtos.map((p) => {
              const livre = Math.max(0, p.quantidade - (usados.get(p.id) ?? 0));
              return (
                <div key={p.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{p.nome} <span className="text-muted-foreground">· {p.familia?.nome} · {livre} disponível</span></span>
                  <Input aria-label={`Quantidade de ${p.nome}`} type="number" min={0} max={Math.min(3, livre)} className="w-20"
                    value={qtd[p.id] ?? 0} disabled={livre === 0}
                    onChange={(e) => setQtd({ ...qtd, [p.id]: Math.max(0, Math.min(livre, Number(e.target.value) || 0)) })} />
                </div>
              );
            })}
          </div>
          <p className={`text-sm ${erro && escolhidos.length > 0 ? 'text-status-danger' : 'text-muted-foreground'}`}>
            {erro && escolhidos.length > 0 ? erro : 'Até 3 da mesma linha; misturando linhas, até 2. Devolução: segunda até o meio-dia.'}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button disabled={!colaborador || !!erro || retirar.isPending} onClick={salvar}>Registrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RegistrarDevolucao({ retirada, atrasada, onFechar }: { retirada: Retirada; atrasada: boolean; onFechar: () => void }) {
  const devolver = useDevolver();
  const [estado, setEstado] = useState('normal');
  const [motivo, setMotivo] = useState('');
  const [detalhe, setDetalhe] = useState('');
  const precisaDetalhe = atrasada || estado !== 'normal';
  const valido = (!atrasada || motivo.trim() !== '') && (!precisaDetalhe || detalhe.trim() !== '');
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar devolução</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {atrasada && <p className="text-sm text-status-danger font-medium">Fora do prazo: o motivo e o detalhe do produto são obrigatórios.</p>}
          <div className="space-y-1.5">
            <Label htmlFor="ben-estado">Como o produto voltou</Label>
            <select id="ben-estado" value={estado} onChange={(e) => setEstado(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
              <option value="normal">Normal</option>
              <option value="uso_acima">Uso acima do ideal</option>
              <option value="danificado">Danificado</option>
            </select>
          </div>
          {atrasada && (
            <div className="space-y-1.5">
              <Label htmlFor="ben-motivo">Por que atrasou *</Label>
              <Input id="ben-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
          )}
          {precisaDetalhe && (
            <div className="space-y-1.5">
              <Label htmlFor="ben-detalhe">Detalhe do produto *</Label>
              <Input id="ben-detalhe" value={detalhe} onChange={(e) => setDetalhe(e.target.value)} placeholder="Ex.: frascos pela metade" />
            </div>
          )}
          {atrasada && estado === 'uso_acima' && (
            <p className="text-sm text-status-danger">Atraso com uso acima do ideal fica marcado no histórico como indício de má-fé.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button disabled={!valido || devolver.isPending}
            onClick={() => devolver.mutate({ id: retirada.id, estado, motivo, detalhe }, { onSuccess: onFechar })}>Registrar devolução</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Decidir({ retirada, nome, onFechar }: { retirada: Retirada; nome: string; onFechar: () => void }) {
  const liberar = useLiberar();
  const [motivo, setMotivo] = useState('');
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Liberar a retirada de {nome}?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Atrasou a devolução 2 vezes nos últimos 6 meses. Pedido: {retirada.itens.map((i) => `${i.quantidade}× ${i.produto?.nome}`).join(', ')}.</p>
        <div className="space-y-1.5">
          <Label htmlFor="ben-decisao">Motivo (obrigatório para recusar)</Label>
          <Input id="ben-decisao" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={!motivo.trim() || liberar.isPending}
            onClick={() => liberar.mutate({ id: retirada.id, aprova: false, motivo }, { onSuccess: onFechar })}>Recusar</Button>
          <Button disabled={liberar.isPending} onClick={() => liberar.mutate({ id: retirada.id, aprova: true, motivo }, { onSuccess: onFechar })}>Liberar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditarProduto({ produto, onFechar }: { produto: Partial<ProdutoDoBeneficio>; onFechar: () => void }) {
  const { data: linhas = [] } = useLinhas();
  const salvar = useSalvarProduto();
  const [p, setP] = useState({ nome: produto.nome ?? '', familia_id: produto.familia_id ?? '', quantidade: produto.quantidade ?? 1, ativo: produto.ativo ?? true });
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{produto.id ? 'Editar produto' : 'Novo produto do benefício'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="bp-nome">Produto</Label>
            <Input id="bp-nome" value={p.nome} onChange={(e) => setP({ ...p, nome: e.target.value })} placeholder="Ex.: Shampoo Oxygen 500ml" /></div>
          <div className="space-y-1.5"><Label htmlFor="bp-linha">Linha</Label>
            <select id="bp-linha" value={p.familia_id} onChange={(e) => setP({ ...p, familia_id: e.target.value })}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
              <option value="">Escolha…</option>
              {linhas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select></div>
          <div className="space-y-1.5"><Label htmlFor="bp-qtd">Quantas unidades o benefício tem</Label>
            <Input id="bp-qtd" type="number" min={0} className="w-28" value={p.quantidade} onChange={(e) => setP({ ...p, quantidade: Math.max(0, Number(e.target.value) || 0) })} /></div>
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={p.ativo} onChange={(e) => setP({ ...p, ativo: e.target.checked })} />Disponível no benefício</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button disabled={!p.nome.trim() || !p.familia_id || salvar.isPending}
            onClick={() => salvar.mutate({ id: produto.id, ...p }, { onSuccess: onFechar })}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Configurar({ onFechar }: { onFechar: () => void }) {
  const { data: config } = useConfigDoBeneficio();
  const { data: pessoas = [] } = usePessoasDaEmpresa();
  const salvar = useSalvarConfigDoBeneficio();
  const [c, setC] = useState({ responsavel_id: config?.responsavel_id ?? null, liberador_id: config?.liberador_id ?? null });
  const pessoa = (id: string | null, on: (v: string | null) => void, campo: string) => (
    <select id={campo} value={id ?? ''} onChange={(e) => on(e.target.value || null)} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
      <option value="">Ninguém</option>
      {[...pessoas].sort((a, b) => a.nome.localeCompare(b.nome)).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
    </select>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Configurar o benefício</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="bc-resp">Responsável (registra retiradas e devoluções)</Label>
            {pessoa(c.responsavel_id, (v) => setC({ ...c, responsavel_id: v }), 'bc-resp')}</div>
          <div className="space-y-1.5"><Label htmlFor="bc-lib">Quem libera, além do gestor do Marketing</Label>
            {pessoa(c.liberador_id, (v) => setC({ ...c, liberador_id: v }), 'bc-lib')}</div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button disabled={salvar.isPending} onClick={() => salvar.mutate(c, { onSuccess: onFechar })}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
