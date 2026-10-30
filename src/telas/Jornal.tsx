// A página do Jornal da empresa (decisão do dono, 2026-10-04): a notícia principal e o histórico,
// com busca e filtro por tipo. Quem tem a seção Jornal do Marketing vê também "Nova notícia", os
// rascunhos e as despublicadas, e os botões de cada caixinha (o banco confere a mesma coisa).
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { Copy, EyeOff, Newspaper, Pencil, Plus, Repeat, Search, Send, Star, Trash2, MoreHorizontal } from 'lucide-react';
import { ConfirmarExclusao } from '@/components/ui/ConfirmarExclusao';
import { PageHeader } from '@/components/layout/PageHeader';
import { useQueryState } from '@/hooks/useQueryState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { LeituraDaNoticia } from '@/components/jornal/LeituraDaNoticia';
import { EditorDeNoticia } from '@/components/jornal/EditorDeNoticia';
import { todayISO } from '@/lib/dates';
import { mensagemDeErro } from '@/lib/supabase-result';
import { cn, semAcento } from '@/lib/utils';
import { CartaoDaNoticia, DestaqueDaNoticia, SeloDoTipo } from '@/components/jornal/CartaoDaNoticia';
import { ATUALIZACAO_DO_SISTEMA, capaDaHome, maisRecentePrimeiro, ROTULO_DO_TIPO, type TipoDeNoticia } from '@/lib/jornal';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { PrintsDaNoticia } from '@/components/jornal/PrintsDaNoticia';
import {
  ROTULO_DA_REPETICAO, useApagarNoticia, useAtualizacoesNaoLidas, useImagensDasNoticias, useDuplicarNoticia, useLeiturasDoJornal, useLeituraDaNoticia,
  useMudarStatusDaNoticia, useNoticias, usePodeNoJornal,
  type Noticia,
} from '@/hooks/useJornal';

const dia = (d: string) => format(new Date(`${d}T12:00:00`), 'dd/MM/yyyy', { locale: ptBR });

export default function Jornal() {
  const { data: noticias = [], isLoading, error } = useNoticias();
  const pode = usePodeNoJornal();
  const status = useMudarStatusDaNoticia();
  const apagar = useApagarNoticia();
  const [apagando, setApagando] = useState<Noticia | null>(null);
  const duplicar = useDuplicarNoticia();
  const [busca, setBusca] = useQueryState<string>('q', '');
  const [tipo, setTipo] = useState('');
  // Notícias da empresa ou o mural de atualizações do sistema (dono, 2026-10-14).
  // Na URL: o aviso da "Lyra avisa" abre direto o mural (`?aba=atualizacoes`).
  const [aba, setAba] = useQueryState<'noticias' | 'atualizacoes'>('aba', 'noticias');
  const { data: naoLidas = new Set<string>() } = useAtualizacoesNaoLidas();
  // A leitura de toda notícia aberta fica gravada (etapa 4, 2026-10-25) — é dela que sai o "lida por N de M".
  const { nova, ler, carregou } = useLeituraDaNoticia();
  const [aberta, setAberta] = useState<Noticia | null>(null);
  const { data: leituras } = useLeiturasDoJornal(pode.editar || pode.publicar);
  const [editando, setEditando] = useState<Noticia | 'nova' | null>(null);
  // "Ler a notícia" da mensagem automática do chat (dono, 2026-10-19): `?noticia=<id>` abre a leitura dela.
  const [noticiaDoLink, setNoticiaDoLink] = useQueryState<string>('noticia', '');
  const jaAbriu = useRef<string | null>(null);
  useEffect(() => {
    const n = noticiaDoLink ? noticias.find((x) => x.id === noticiaDoLink) : undefined;
    if (!n || jaAbriu.current === n.id) return;
    jaAbriu.current = n.id;
    setAberta(n);
    setNoticiaDoLink('');
  }, [noticiaDoLink, noticias, setNoticiaDoLink]);
  // Abrir a notícia (do destaque, da lista ou do link) grava a leitura.
  useEffect(() => {
    if (aberta) ler(aberta.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberta?.id, carregou]);

  const publicadas = noticias.filter((n) => n.status === 'publicada' && n.tipo !== ATUALIZACAO_DO_SISTEMA);
  const atualizacoes = noticias.filter((n) => n.status === 'publicada' && n.tipo === ATUALIZACAO_DO_SISTEMA).sort(maisRecentePrimeiro);
  const naoPublicadas = noticias.filter((n) => n.status !== 'publicada');
  const { principal } = capaDaHome(noticias, todayISO());
  const imagemDe = useImagensDasNoticias(noticias.filter((n) => n.tipo !== ATUALIZACAO_DO_SISTEMA));
  const imagemDaAberta = aberta ? imagemDe(aberta) : undefined;

  // Sem busca nem filtro, o destaque já está no topo e não se repete na grade.
  const historico = useMemo(() => {
    const q = semAcento(busca.trim());
    return [...publicadas].sort(maisRecentePrimeiro)
      .filter((n) => (!tipo || n.tipo === tipo) && (!q || semAcento(`${n.titulo} ${n.texto}`).includes(q)))
      .filter((n) => n !== principal || !!q || !!tipo);
  }, [publicadas, busca, tipo, principal]);

  const falhou = (e: unknown) => toast.error(mensagemDeErro(e));
  // Quem cuida do Jornal vê o que se repete e quando sai a próxima.
  const seRepete = (n: Noticia) => n.repetir && (
    <Badge variant="outline" className="ml-1 gap-1 font-normal">
      <Repeat className="w-3 h-3" aria-hidden="true" />
      {ROTULO_DA_REPETICAO[n.repetir]}{n.proxima_repeticao && ` · próxima ${dia(n.proxima_repeticao)}`}
    </Badge>
  );
  // Editar à mostra e o resto num menu (etapa 4 · Jornal, 2026-10-24): eram até cinco botões por notícia.
  const acoes = (n: Noticia) => (
    <div className="flex items-center gap-1">
      {n.status === 'publicada' && leituras && (
        <span className="text-[12px] text-muted-foreground tabular-nums mr-1" title="Quantas pessoas abriram esta notícia">
          {leituras.get(n.id) ? `Lida por ${leituras.get(n.id)!.lidas} de ${leituras.get(n.id)!.pessoas}` : 'Ninguém abriu ainda'}
        </span>
      )}
      {pode.editar && <Button variant="ghost" size="sm" onClick={() => setEditando(n)}><Pencil className="w-4 h-4 mr-1" />Editar</Button>}
      {pode.publicar && n.status !== 'publicada' && (
        <Button variant="outline" size="sm" disabled={status.isPending}
          onClick={() => status.mutate({ id: n.id, status: 'publicada' }, { onSuccess: () => toast.success('Notícia publicada.'), onError: falhou })}>
          <Send className="w-4 h-4 mr-1" />Publicar
        </Button>
      )}
      {(pode.editar || (pode.publicar && n.status === 'publicada') || pode.excluir) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" aria-label={`Mais ações de ${n.titulo}`}><MoreHorizontal className="w-4 h-4" aria-hidden="true" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* Duplicar (dono, 2026-10-13): tudo, como rascunho com a data de hoje, e já abre para ajustar. */}
            {pode.editar && (
              <DropdownMenuItem disabled={duplicar.isPending} onClick={() => duplicar.mutate({ noticia: n, hoje: todayISO() }, {
                onSuccess: (nova) => { toast.success('Cópia criada como rascunho.'); setEditando(nova); }, onError: falhou,
              })}>
                <Copy className="w-4 h-4 mr-2" aria-hidden="true" />Duplicar
              </DropdownMenuItem>
            )}
            {pode.publicar && n.status === 'publicada' && (
              <DropdownMenuItem disabled={status.isPending}
                onClick={() => status.mutate({ id: n.id, status: 'despublicada' }, { onSuccess: () => toast.success('Notícia despublicada.'), onError: falhou })}>
                <EyeOff className="w-4 h-4 mr-2" aria-hidden="true" />Despublicar
              </DropdownMenuItem>
            )}
            {pode.excluir && (
              <DropdownMenuItem className="text-destructive focus:text-destructive" disabled={apagar.isPending} onClick={() => setApagando(n)}>
                <Trash2 className="w-4 h-4 mr-2" aria-hidden="true" />Excluir…
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        icon={Newspaper}
        title="Notícias"
        description="Avisos, novos colaboradores, aniversários, feriados e festas."
        actions={pode.editar ? <Button onClick={() => setEditando('nova')}><Plus className="w-4 h-4 mr-1" />Nova notícia</Button> : undefined}
      />

      <div className="px-4 lg:px-8 pb-6 w-full space-y-5">
      <ConfirmarExclusao aberto={!!apagando} titulo="Excluir esta notícia?" acao="Excluir"
        descricao={apagando ? `“${apagando.titulo}” sai do Jornal para todo mundo, com as imagens e os anexos, e não volta. Para só tirar do ar, use Despublicar.` : ''}
        enviando={apagar.isPending} onCancelar={() => setApagando(null)}
        onConfirmar={() => apagando && apagar.mutate(apagando, {
          onSuccess: () => { toast.success('Notícia excluída.'); setApagando(null); }, onError: falhou,
        })} />

      <div className="inline-flex h-9 max-w-full overflow-x-auto rounded-md border border-input bg-card" role="tablist">
        {([['noticias', 'Notícias'], ['atualizacoes', `Atualizações do sistema${atualizacoes.length ? ` (${atualizacoes.length})` : ''}`]] as const).map(([v, r]) => (
          <button key={v} type="button" role="tab" aria-selected={aba === v} onClick={() => setAba(v)}
            className={`px-4 text-[14px] whitespace-nowrap border-r border-input last:border-r-0 ${aba === v ? 'bg-primary text-primary-foreground font-bold' : 'font-semibold text-foreground hover:bg-muted'}`}>
            {r}
            {v === 'atualizacoes' && naoLidas.size > 0 && (
              <span className="ml-1.5 inline-flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full bg-primary text-primary-foreground text-[12px] font-bold"
                title="Atualizações que você ainda não leu">{naoLidas.size}</span>
            )}
          </button>
        ))}
      </div>

      {error ? (
        <p className="text-sm text-destructive">Não foi possível carregar o jornal.</p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : aba === 'atualizacoes' ? (
        <section className="space-y-3 max-w-6xl">
          <p className="text-sm text-muted-foreground">
            O que mudou no Helpoint, em linguagem simples: o que foi corrigido, o que é novo e o que foi ajustado.
          </p>
          {atualizacoes.length === 0 ? (
            <EmptyState icon={Newspaper} title="Nenhuma atualização publicada" description="As próximas mudanças do sistema aparecem aqui." />
          ) : atualizacoes.map((n, i) => (
            // Não lida (2026-10-14): em azul, já aberta, com o selo "Nova"; abrir ou "Marcar como lida" tira o azul.
            <details key={n.id} open={i === 0 || naoLidas.has(n.id)}
              className={`panel px-5 py-4 ${naoLidas.has(n.id) ? 'ring-2 ring-primary/40' : ''}`}>
              <summary className="cursor-pointer list-none" onClick={() => ler(n.id)}>
                <span className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
                  {n.titulo}
                  {naoLidas.has(n.id) && <Badge className="bg-primary text-primary-foreground">Nova</Badge>}
                </span>
                <span className="block text-[13px] text-muted-foreground">{dia(n.data_noticia)}</span>
              </summary>
              <div className="mt-3 max-w-3xl"><MarkdownRenderer content={n.texto} /></div>
              <PrintsDaNoticia noticiaId={n.id} origem={n.repeticao_de} />
              {naoLidas.has(n.id) && (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => ler(n.id)}>Marcar como lida</Button>
              )}
              {(pode.editar || pode.publicar || pode.excluir) && <div className="mt-2">{acoes(n)}</div>}
            </details>
          ))}
        </section>
      ) : (
        <>
          {principal && (
            <DestaqueDaNoticia noticia={principal} imagem={imagemDe(principal)} nova={nova(principal)} onAbrir={() => setAberta(principal)} deLado />
          )}

          {pode.editar || pode.publicar ? naoPublicadas.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Rascunhos e despublicadas</h2>
              <ul className="divide-y rounded-lg border bg-card">
                {naoPublicadas.map((n) => (
                  <li key={n.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                    <div className="flex-1 min-w-[200px]">
                      <span className="font-medium text-sm">{n.titulo}</span>{' '}
                      <Badge variant="secondary">{n.status === 'rascunho' ? 'Rascunho' : 'Despublicada'}</Badge>
                      {n.destaque && <Star className="inline w-3.5 h-3.5 ml-1 text-primary" aria-label="Destaque" />}
                      {seRepete(n)}
                      <p className="text-[13px] text-muted-foreground">{ROTULO_DO_TIPO[n.tipo] ?? n.tipo} · {dia(n.data_noticia)}</p>
                    </div>
                    {acoes(n)}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="space-y-3">
            <h2 className="text-[20px] font-bold">{busca || tipo ? 'Resultado' : 'Mais notícias'}</h2>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar notícia" className="h-10 pl-9" aria-label="Buscar notícia" />
            </div>
            {/* O tipo em fichas com a cor dele, em vez de uma lista fechada (Hick: as 6 opções à vista, um toque). */}
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filtrar por tipo">
              {(['', ...(Object.keys(ROTULO_DO_TIPO) as TipoDeNoticia[]).filter((t) => t !== ATUALIZACAO_DO_SISTEMA)] as const).map((t) => (
                <button key={t || 'todos'} type="button" aria-pressed={tipo === t} onClick={() => setTipo(t)}
                  className={cn('shrink-0 rounded-full transition-shadow', tipo === t ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : 'hover:shadow-md')}>
                  {t ? <SeloDoTipo tipo={t} className="rounded-full" /> : <span className="estado badge-neutral rounded-full">Todos</span>}
                </button>
              ))}
            </div>
            {historico.length === 0 ? (
              <EmptyState icon={Newspaper} title={busca || tipo ? 'Nenhuma notícia encontrada' : 'Nenhuma outra notícia publicada'}
                description={busca || tipo ? 'Tente outra busca.' : 'Quando o Marketing publicar uma notícia, ela aparece aqui.'} />
            ) : (
              <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {historico.map((n) => (
                  <CartaoDaNoticia key={n.id} noticia={n} imagem={imagemDe(n)} nova={nova(n)} onAbrir={() => setAberta(n)}
                    extra={pode.editar ? seRepete(n) || undefined : undefined}
                    rodape={(pode.editar || pode.publicar || pode.excluir) ? acoes(n) : undefined} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <LeituraDaNoticia noticia={aberta} capa={imagemDaAberta && !imagemDaAberta.inteira ? imagemDaAberta.url : undefined} onClose={() => setAberta(null)} />
      {editando && <EditorDeNoticia noticia={editando === 'nova' ? null : editando} onClose={() => setEditando(null)} />}
      </div>
    </div>
  );
}
