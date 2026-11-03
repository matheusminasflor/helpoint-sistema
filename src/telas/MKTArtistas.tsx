// Marketing › Artistas (dono, 2026-11-03; docs/proposta-indicadores-marketing.md, decisão 2). A seção 1 da planilha
// PAINEL MKT no Helpoint: o mês de cada artista (stories, reels e posts, peças que valem meia, reunião) e a bonificação
// pela regra da planilha (`src/lib/bonificacao-dos-artistas.ts`); abaixo, as entregas do mês.
import { useMemo, useState } from 'react';
import { Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmarExclusao } from '@/components/ui/ConfirmarExclusao';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useQueryState } from '@/hooks/useQueryState';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import {
  useApagarEntrega, useArtistas, useEntregasDoMes, useLancarEntrega, useMarcarReuniao, useProdutosLancados, useReunioesDoMes,
  useSalvarArtista, type Artista,
} from '@/hooks/useArtistasMkt';
import { bonificacaoDoMes, pesoDaPeca, type TipoDeEntrega } from '@/lib/bonificacao-dos-artistas';
import { STATUS_DO_ARTISTA as STATUS } from '@/lib/artistas-nos-indicadores';
import { formatBRL } from '@/lib/crm';
import { todayISO } from '@/lib/dates';
import { cn } from '@/lib/utils';

const campo = 'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm';
const NOME_DO_TIPO: Record<TipoDeEntrega, string> = { stories: 'Stories', reels: 'Reels', post: 'Post (feed)' };
const dataCurta = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/');
const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function MKTArtistas() {
  const { can } = useDepartmentPermissions('marketing');
  const podeLancar = can('artistas', 'create');
  const podeCadastrar = can('artistas', 'edit');
  const podeApagar = can('artistas', 'delete');
  const [mes, setMes] = useQueryState<string>('mes', todayISO().slice(0, 7));
  const { data: artistas = [], isLoading } = useArtistas();
  const { data: entregas = [] } = useEntregasDoMes(mes);
  const { data: reunioes = new Map<string, boolean>() } = useReunioesDoMes(mes);
  const marcar = useMarcarReuniao();
  const apagar = useApagarEntrega();
  const [lancando, setLancando] = useState(false);
  const [editando, setEditando] = useState<Artista | 'novo' | null>(null);
  const [apagando, setApagando] = useState<{ id: string; texto: string } | null>(null);

  const nomeDo = useMemo(() => new Map(artistas.map((a) => [a.id, a.nome])), [artistas]);
  // Artista inativo só aparece no mês em que tem entrega (o histórico fica).
  const doMes = useMemo(() => artistas
    .filter((a) => a.ativo || entregas.some((e) => e.artista_id === a.id))
    .map((a) => ({ artista: a, b: bonificacaoDoMes(a, entregas.filter((e) => e.artista_id === a.id), !!reunioes.get(a.id)) })),
  [artistas, entregas, reunioes]);
  const total = doMes.reduce((s, x) => s + x.b.valor, 0);
  const teto = doMes.reduce((s, x) => s + x.artista.teto_mensal, 0);

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Artistas"
        description="Entregas de cada artista no mês, a reunião mensal e a bonificação: um terço pelos stories, um pelos reels e posts, um pela reunião."
        icon={Star}
        actions={(podeLancar || podeCadastrar) && (
          <div className="flex flex-wrap gap-2">
            {podeLancar && <Button onClick={() => setLancando(true)} disabled={!artistas.some((a) => a.ativo)}><Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />Lançar entrega</Button>}
            {podeCadastrar && <Button variant="outline" onClick={() => setEditando('novo')}><Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />Novo artista</Button>}
          </div>
        )}
      />
      <div className="p-4 lg:p-6 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="art-mes">Mês</Label>
            <input id="art-mes" type="month" className={cn(campo, 'w-auto')} value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
          </div>
          {doMes.length > 0 && (
            <p className="text-sm text-muted-foreground pb-2">
              Bonificação do mês: <span className="font-semibold text-foreground font-mono">{formatBRL(total)}</span> de {formatBRL(teto)} ({pct(teto ? total / teto : 0)})
            </p>
          )}
        </div>

        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="p-4 space-y-1">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : doMes.length === 0 ? (
            <EmptyState icon={Star} title="Nenhum artista cadastrado"
              description={podeCadastrar ? 'Cadastre em "Novo artista" com o teto da bonificação e as metas do mês.' : 'Ninguém cadastrou artistas ainda.'} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-border bg-secondary/60 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">Artista</th>
                    <th className="px-3 py-2 font-semibold text-right">Stories</th>
                    <th className="px-3 py-2 font-semibold text-right">Reels + posts</th>
                    <th className="px-3 py-2 font-semibold text-right" title="Aprovadas fora da campanha: valem metade">Valem meia</th>
                    <th className="px-3 py-2 font-semibold text-right" title="Fora da campanha e não aprovadas: não valem">Não valem</th>
                    <th className="px-3 py-2 font-semibold">Reunião</th>
                    <th className="px-3 py-2 font-semibold text-right">Bonificação</th>
                    <th className="px-3 py-2 font-semibold">Situação</th>
                    {podeCadastrar && <th className="px-3 py-2" aria-label="Ações" />}
                  </tr>
                </thead>
                <tbody>
                  {doMes.map(({ artista: a, b }) => (
                    <tr key={a.id} className={cn('border-b border-border', !a.ativo && 'text-muted-foreground')}>
                      <td className="px-3 py-2 font-medium">
                        {a.nome}
                        {!a.ativo && <Badge variant="outline" className="ml-1.5 text-[12px]">inativo</Badge>}
                      </td>
                      <td className="px-3 py-2 font-mono text-right whitespace-nowrap">{b.stories} <span className="text-muted-foreground">/ {a.meta_stories}</span></td>
                      <td className="px-3 py-2 font-mono text-right whitespace-nowrap">{b.reels + b.posts} <span className="text-muted-foreground">/ {a.meta_reels + a.meta_posts}</span></td>
                      <td className="px-3 py-2 font-mono text-right">{b.pecasMeio || '—'}</td>
                      <td className={cn('px-3 py-2 font-mono text-right', b.pecasFora > 0 && 'text-status-danger')}>{b.pecasFora || '—'}</td>
                      <td className="px-3 py-2">
                        {podeLancar ? (
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={!!reunioes.get(a.id)} disabled={marcar.isPending}
                              onChange={(e) => marcar.mutate({ artista_id: a.id, mes, presente: e.target.checked })} />
                            {reunioes.get(a.id) ? 'Foi' : 'Não foi'}
                          </label>
                        ) : (reunioes.get(a.id) ? 'Foi' : 'Não foi')}
                      </td>
                      <td className="px-3 py-2 font-mono text-right whitespace-nowrap">
                        {formatBRL(b.valor)} <span className="text-muted-foreground">de {formatBRL(a.teto_mensal)}</span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Badge className={STATUS[b.status].classe}>{STATUS[b.status].texto}</Badge>
                        <span className="ml-1.5 text-xs text-muted-foreground font-mono">{pct(b.parteDoTeto)}</span>
                      </td>
                      {podeCadastrar && (
                        <td className="px-3 py-2 text-right">
                          <Button variant="ghost" size="icon" title="Editar artista" onClick={() => setEditando(a)}>
                            <Pencil className="w-4 h-4" aria-hidden="true" /><span className="sr-only">Editar {a.nome}</span>
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="px-3 py-2 text-xs text-muted-foreground border-t border-border">
            Peça na campanha vale inteira; aprovada fora da campanha, metade; fora e não aprovada, nada. No alvo a partir de 100% do teto; atenção a partir de 70%.
          </p>
        </Card>

        <Card className="overflow-hidden">
          <h2 className="px-3 py-2 text-[15px] font-semibold border-b border-border">Entregas do mês</h2>
          {entregas.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Nada lançado neste mês.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-border bg-secondary/60 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">Dia</th>
                    <th className="px-3 py-2 font-semibold">Artista</th>
                    <th className="px-3 py-2 font-semibold">Tipo</th>
                    <th className="px-3 py-2 font-semibold text-right">Qtd.</th>
                    <th className="px-3 py-2 font-semibold">Produto</th>
                    <th className="px-3 py-2 font-semibold">Vale</th>
                    <th className="px-3 py-2 font-semibold">Observação</th>
                    {podeApagar && <th className="px-3 py-2" aria-label="Ações" />}
                  </tr>
                </thead>
                <tbody>
                  {entregas.map((e) => {
                    const peso = pesoDaPeca(e);
                    return (
                      <tr key={e.id} className="border-b border-border">
                        <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{dataCurta(e.data)}</td>
                        <td className="px-3 py-2">{nomeDo.get(e.artista_id) ?? '—'}</td>
                        <td className="px-3 py-2">{NOME_DO_TIPO[e.tipo]}</td>
                        <td className="px-3 py-2 font-mono text-right">{e.quantidade}</td>
                        <td className="px-3 py-2">{e.produto || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <Badge className={peso === 1 ? 'badge-success' : peso > 0 ? 'badge-warning' : 'badge-danger'}>
                            {peso === 1 ? 'Na campanha' : peso > 0 ? 'Meia (fora da campanha)' : 'Não vale'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {e.observacao || (e.link ? '' : '—')}
                          {e.link && <a href={e.link} target="_blank" rel="noreferrer" className="ml-1 underline">ver</a>}
                        </td>
                        {podeApagar && (
                          <td className="px-3 py-2 text-right">
                            <Button variant="ghost" size="icon" title="Apagar esta entrega" disabled={apagar.isPending}
                              onClick={() => setApagando({ id: e.id, texto: `${e.quantidade} ${NOME_DO_TIPO[e.tipo]} de ${nomeDo.get(e.artista_id) ?? 'artista'}, dia ${dataCurta(e.data)}` })}>
                              <Trash2 className="w-4 h-4" aria-hidden="true" /><span className="sr-only">Apagar</span>
                            </Button>
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
        <ConfirmarExclusao aberto={!!apagando} titulo="Apagar esta entrega?"
          descricao={apagando ? `${apagando.texto}. A bonificação do mês muda e a entrega não volta.` : ''}
          enviando={apagar.isPending} onCancelar={() => setApagando(null)}
          onConfirmar={() => apagando && apagar.mutate(apagando.id, { onSuccess: () => setApagando(null) })} />
      </div>

      {lancando && <NovaEntrega artistas={artistas.filter((a) => a.ativo)} mes={mes} onFechar={() => setLancando(false)} />}
      {editando && <FormularioArtista artista={editando === 'novo' ? null : editando} onFechar={() => setEditando(null)} />}
    </div>
  );
}

function FormularioArtista({ artista, onFechar }: { artista: Artista | null; onFechar: () => void }) {
  const salvar = useSalvarArtista();
  const [nome, setNome] = useState(artista?.nome ?? '');
  const [teto, setTeto] = useState(artista ? String(artista.teto_mensal) : '');
  const [stories, setStories] = useState(String(artista?.meta_stories ?? 10));
  const [reels, setReels] = useState(String(artista?.meta_reels ?? 4));
  const [posts, setPosts] = useState(String(artista?.meta_posts ?? 2));
  const [ativo, setAtivo] = useState(artista?.ativo ?? true);
  const n = (s: string) => Number(s.replace(',', '.'));
  const valido = nome.trim() !== '' && n(teto) >= 0 && teto.trim() !== '' && Number.isInteger(n(stories)) && n(stories) > 0
    && Number.isInteger(n(reels)) && n(reels) >= 0 && Number.isInteger(n(posts)) && n(posts) >= 0 && n(reels) + n(posts) > 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{artista ? `Editar ${artista.nome}` : 'Novo artista'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ar-nome">Nome *</Label>
            <Input id="ar-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ar-teto">Bonificação máxima no mês (R$) *</Label>
            <Input id="ar-teto" inputMode="decimal" className="font-mono" value={teto} onChange={(e) => setTeto(e.target.value)} placeholder="4000" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ar-stories">Meta de stories</Label>
              <Input id="ar-stories" inputMode="numeric" className="font-mono" value={stories} onChange={(e) => setStories(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ar-reels">Meta de reels</Label>
              <Input id="ar-reels" inputMode="numeric" className="font-mono" value={reels} onChange={(e) => setReels(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ar-posts">Meta de posts</Label>
              <Input id="ar-posts" inputMode="numeric" className="font-mono" value={posts} onChange={(e) => setPosts(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">As metas e o teto valem para a conta de todos os meses, inclusive os já lançados.</p>
          {artista && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
              Ativo (desmarque quando a parceria acabar; o histórico fica)
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button disabled={!valido || salvar.isPending} onClick={() => salvar.mutate(
            { id: artista?.id, nome, teto_mensal: n(teto), meta_stories: n(stories), meta_reels: n(reels), meta_posts: n(posts), ativo },
            { onSuccess: onFechar },
          )}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NovaEntrega({ artistas, mes, onFechar }: { artistas: Artista[]; mes: string; onFechar: () => void }) {
  const lancar = useLancarEntrega();
  const { data: produtos = [] } = useProdutosLancados();
  const hoje = todayISO();
  const [artista, setArtista] = useState('');
  const [data, setData] = useState(hoje.startsWith(mes) ? hoje : `${mes}-01`);
  const [tipo, setTipo] = useState<TipoDeEntrega>('stories');
  const [quantidade, setQuantidade] = useState('1');
  const [produto, setProduto] = useState('');
  const [naCampanha, setNaCampanha] = useState(true);
  const [aprovado, setAprovado] = useState(true);
  const [link, setLink] = useState('');
  const [observacao, setObservacao] = useState('');
  const qtd = Number(quantidade);
  const valido = !!artista && !!data && Number.isInteger(qtd) && qtd > 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Lançar entrega</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="en-artista">Artista *</Label>
              <select id="en-artista" className={campo} value={artista} onChange={(e) => setArtista(e.target.value)}>
                <option value="">Escolha…</option>
                {artistas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="en-data">Dia *</Label>
              <input id="en-data" type="date" className={campo} value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="en-tipo">Tipo *</Label>
              <select id="en-tipo" className={campo} value={tipo} onChange={(e) => setTipo(e.target.value as TipoDeEntrega)}>
                {(Object.keys(NOME_DO_TIPO) as TipoDeEntrega[]).map((t) => <option key={t} value={t}>{NOME_DO_TIPO[t]}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="en-qtd">Quantidade *</Label>
              <Input id="en-qtd" inputMode="numeric" className="font-mono" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="en-produto">Produto ou tema</Label>
            <Input id="en-produto" list="en-produtos" value={produto} onChange={(e) => setProduto(e.target.value)} placeholder="Ex.: Liss Evolution" />
            <datalist id="en-produtos">{produtos.map((p) => <option key={p} value={p} />)}</datalist>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={naCampanha} onChange={(e) => setNaCampanha(e.target.checked)} />
            Produto da campanha do mês (vale inteira)
          </label>
          {!naCampanha && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={aprovado} onChange={(e) => setAprovado(e.target.checked)} />
              Aprovada pelo Marketing (fora da campanha, vale metade; sem aprovação, não vale)
            </label>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="en-link">Link</Label>
            <Input id="en-link" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://instagram.com/…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="en-obs">Observação</Label>
            <Input id="en-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: postou e excluiu" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button disabled={!valido || lancar.isPending} onClick={() => lancar.mutate(
            { artista_id: artista, data, tipo, quantidade: qtd, produto, na_campanha: naCampanha, aprovado: naCampanha || aprovado, link, observacao },
            { onSuccess: onFechar },
          )}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
