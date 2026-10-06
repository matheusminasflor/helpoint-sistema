// A página do Jornal da empresa (decisão do dono, 2026-10-04): a notícia principal e o histórico,
// com busca e filtro por tipo. Quem tem a seção Jornal do Marketing vê também "Nova notícia", os
// rascunhos e as despublicadas, e os botões de cada caixinha (o banco confere a mesma coisa).
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { EyeOff, Newspaper, Pencil, Plus, Search, Send, Star, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { LeituraDaNoticia } from '@/components/jornal/LeituraDaNoticia';
import { EditorDeNoticia } from '@/components/jornal/EditorDeNoticia';
import { todayISO } from '@/lib/dates';
import { mensagemDeErro } from '@/lib/supabase-result';
import { semAcento } from '@/lib/utils';
import { capaDaHome, maisRecentePrimeiro, ROTULO_DO_TIPO, type TipoDeNoticia } from '@/lib/jornal';
import {
  useApagarNoticia, useCapas, useMudarStatusDaNoticia, useNoticias, usePodeNoJornal, type Noticia,
} from '@/hooks/useJornal';

const dia = (d: string) => format(new Date(`${d}T12:00:00`), 'dd/MM/yyyy', { locale: ptBR });

export default function Jornal() {
  const { data: noticias = [], isLoading, error } = useNoticias();
  const pode = usePodeNoJornal();
  const status = useMudarStatusDaNoticia();
  const apagar = useApagarNoticia();
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [aberta, setAberta] = useState<Noticia | null>(null);
  const [editando, setEditando] = useState<Noticia | 'nova' | null>(null);

  const publicadas = noticias.filter((n) => n.status === 'publicada');
  const naoPublicadas = noticias.filter((n) => n.status !== 'publicada');
  const { principal } = capaDaHome(noticias, todayISO());
  const { data: capas } = useCapas(noticias.flatMap((n) => (n.capa_caminho ? [n.capa_caminho] : [])));
  const capaDe = (n: Noticia) => (n.capa_caminho ? capas?.get(n.capa_caminho) : undefined);

  const historico = useMemo(() => {
    const q = semAcento(busca.trim());
    return [...publicadas].sort(maisRecentePrimeiro)
      .filter((n) => (!tipo || n.tipo === tipo) && (!q || semAcento(`${n.titulo} ${n.texto}`).includes(q)));
  }, [publicadas, busca, tipo]);

  const falhou = (e: unknown) => toast.error(mensagemDeErro(e));
  const acoes = (n: Noticia) => (
    <div className="flex flex-wrap gap-1">
      {pode.editar && <Button variant="ghost" size="sm" onClick={() => setEditando(n)}><Pencil className="w-4 h-4 mr-1" />Editar</Button>}
      {pode.publicar && n.status !== 'publicada' && (
        <Button variant="outline" size="sm" disabled={status.isPending}
          onClick={() => status.mutate({ id: n.id, status: 'publicada' }, { onSuccess: () => toast.success('Notícia publicada.'), onError: falhou })}>
          <Send className="w-4 h-4 mr-1" />Publicar
        </Button>
      )}
      {pode.publicar && n.status === 'publicada' && (
        <Button variant="ghost" size="sm" disabled={status.isPending}
          onClick={() => status.mutate({ id: n.id, status: 'despublicada' }, { onSuccess: () => toast.success('Notícia despublicada.'), onError: falhou })}>
          <EyeOff className="w-4 h-4 mr-1" />Despublicar
        </Button>
      )}
      {pode.excluir && (
        <Button variant="ghost" size="sm" className="text-destructive" disabled={apagar.isPending}
          onClick={() => apagar.mutate(n, { onSuccess: () => toast.success('Notícia excluída.'), onError: falhou })}>
          <Trash2 className="w-4 h-4 mr-1" />Excluir
        </Button>
      )}
    </div>
  );

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <PageHeader
        className="bg-transparent border-0 px-0 py-0"
        icon={Newspaper}
        title="Jornal da empresa"
        description="Notícias, novos colaboradores, aniversários, feriados e festas."
        actions={pode.editar ? <Button onClick={() => setEditando('nova')}><Plus className="w-4 h-4 mr-1" />Nova notícia</Button> : undefined}
      />

      {error ? (
        <p className="text-sm text-destructive">Não foi possível carregar o jornal.</p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <>
          {principal && (
            <button type="button" onClick={() => setAberta(principal)}
              className="w-full text-left rounded-lg border bg-card overflow-hidden hover:bg-muted/30 transition-colors">
              {capaDe(principal) && <img src={capaDe(principal)} alt="" className="w-full max-h-72 object-cover" />}
              <div className="p-4 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>Em destaque</Badge>
                  <Badge variant="outline">{ROTULO_DO_TIPO[principal.tipo] ?? principal.tipo}</Badge>
                  <span className="text-[13px] text-muted-foreground">{dia(principal.data_noticia)}</span>
                </div>
                <p className="text-lg font-semibold text-foreground">{principal.titulo}</p>
              </div>
            </button>
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
                      <p className="text-[13px] text-muted-foreground">{ROTULO_DO_TIPO[n.tipo] ?? n.tipo} · {dia(n.data_noticia)}</p>
                    </div>
                    {acoes(n)}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Histórico</h2>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar notícia" className="pl-8" aria-label="Buscar notícia" />
              </div>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Filtrar por tipo"
                className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                <option value="">Todos os tipos</option>
                {(Object.keys(ROTULO_DO_TIPO) as TipoDeNoticia[]).map((t) => <option key={t} value={t}>{ROTULO_DO_TIPO[t]}</option>)}
              </select>
            </div>
            {historico.length === 0 ? (
              <EmptyState icon={Newspaper} title={busca || tipo ? 'Nenhuma notícia encontrada' : 'Nenhuma notícia publicada'}
                description={busca || tipo ? 'Tente outra busca.' : 'Quando o Marketing publicar uma notícia, ela aparece aqui.'} />
            ) : (
              <ul className="divide-y rounded-lg border bg-card">
                {historico.map((n) => (
                  <li key={n.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
                    {capaDe(n) && <img src={capaDe(n)} alt="" className="w-16 h-12 object-cover rounded" />}
                    <button type="button" onClick={() => setAberta(n)} className="flex-1 min-w-[200px] text-left">
                      <span className="block font-medium text-sm text-foreground">{n.titulo}</span>
                      <span className="block text-[13px] text-muted-foreground">{ROTULO_DO_TIPO[n.tipo] ?? n.tipo} · {dia(n.data_noticia)}{n.autor?.full_name ? ` · ${n.autor.full_name}` : ''}</span>
                    </button>
                    {(pode.editar || pode.publicar || pode.excluir) && acoes(n)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <LeituraDaNoticia noticia={aberta} capa={aberta ? capaDe(aberta) : undefined} onClose={() => setAberta(null)} />
      {editando && <EditorDeNoticia noticia={editando === 'nova' ? null : editando} onClose={() => setEditando(null)} />}
    </div>
  );
}
