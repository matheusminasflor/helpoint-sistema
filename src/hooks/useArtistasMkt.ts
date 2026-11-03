// Marketing › Artistas (dono, 2026-11-03; migration 20270212210000). Os artistas com o teto da bonificação e as metas,
// as entregas do mês e a reunião do mês. A conta da bonificação é `src/lib/bonificacao-dos-artistas.ts`.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { expectRows, unwrap } from '@/lib/supabase-result';
import type { TipoDeEntrega } from '@/lib/bonificacao-dos-artistas';

export interface Artista {
  id: string;
  nome: string;
  teto_mensal: number;
  meta_stories: number;
  meta_reels: number;
  meta_posts: number;
  ativo: boolean;
}

export interface EntregaMkt {
  id: string;
  artista_id: string;
  data: string;
  tipo: TipoDeEntrega;
  quantidade: number;
  produto: string | null;
  aprovado: boolean;
  na_campanha: boolean;
  link: string | null;
  observacao: string | null;
}

/** O primeiro e o último dia do mês `AAAA-MM`. */
export function diasDoMes(mes: string): { de: string; ate: string } {
  const [a, m] = mes.split('-').map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  return { de: `${mes}-01`, ate: `${mes}-${String(ultimo).padStart(2, '0')}` };
}

export function useArtistas() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['artistas-mkt', 'artistas', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Artista[]> =>
      ((unwrap(await supabase.from('mkt_artistas' as never)
        .select('id, nome, teto_mensal, meta_stories, meta_reels, meta_posts, ativo')
        .order('nome')) ?? []) as unknown as Artista[])
        .map((a) => ({ ...a, teto_mensal: Number(a.teto_mensal) })),
  });
}

export function useEntregasDoMes(mes: string) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['artistas-mkt', 'entregas', tenantId, mes],
    enabled: !!tenantId,
    queryFn: async (): Promise<EntregaMkt[]> => {
      const { de, ate } = diasDoMes(mes);
      return (unwrap(await supabase.from('mkt_artistas_entregas' as never)
        .select('id, artista_id, data, tipo, quantidade, produto, aprovado, na_campanha, link, observacao')
        .gte('data', de).lte('data', ate)
        .order('data', { ascending: false })) ?? []) as unknown as EntregaMkt[];
    },
  });
}

/** Quem esteve na reunião do mês: artista → presente. */
export function useReunioesDoMes(mes: string) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['artistas-mkt', 'reunioes', tenantId, mes],
    enabled: !!tenantId,
    queryFn: async (): Promise<Map<string, boolean>> => {
      const linhas = (unwrap(await supabase.from('mkt_artistas_reunioes' as never)
        .select('artista_id, presente').eq('mes', `${mes}-01`)) ?? []) as unknown as { artista_id: string; presente: boolean }[];
      return new Map(linhas.map((l) => [l.artista_id, l.presente]));
    },
  });
}

/** Os produtos já lançados, para sugerir no campo (a planilha tinha a lista no menu). */
export function useProdutosLancados() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['artistas-mkt', 'produtos', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<string[]> => {
      const linhas = (unwrap(await supabase.from('mkt_artistas_entregas' as never)
        .select('produto').not('produto', 'is', null).order('data', { ascending: false }).limit(1000)) ?? []) as unknown as { produto: string }[];
      return [...new Set(linhas.map((l) => l.produto))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    },
  });
}

export type ArtistaParaSalvar = Omit<Artista, 'id'> & { id?: string };

export function useSalvarArtista() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...a }: ArtistaParaSalvar) => {
      const dados = { ...a, nome: a.nome.trim() };
      const tabela = supabase.from('mkt_artistas' as never);
      expectRows(
        id ? await tabela.update(dados as never).eq('id', id).select('id') : await tabela.insert(dados as never).select('id'),
        'o artista',
      );
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['artistas-mkt', 'artistas', tenantId] }); toast.success('Artista salvo.'); },
    onError: (e: Error) => toast.error(e.message.includes('mkt_artistas_nome') ? 'Já existe um artista com este nome.' : e.message),
  });
}

export type EntregaParaLancar = Omit<EntregaMkt, 'id'>;

export function useLancarEntrega() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: EntregaParaLancar) => {
      expectRows(
        await supabase.from('mkt_artistas_entregas' as never).insert({
          ...e, produto: e.produto?.trim() || null, link: e.link?.trim() || null, observacao: e.observacao?.trim() || null,
        } as never).select('id'),
        'a entrega',
      );
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['artistas-mkt'] }); toast.success('Entrega lançada.'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useApagarEntrega() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      expectRows(await supabase.from('mkt_artistas_entregas' as never).delete().eq('id', id).select('id'), 'a entrega');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['artistas-mkt', 'entregas', tenantId] }); toast.success('Entrega apagada.'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useMarcarReuniao() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: { artista_id: string; mes: string; presente: boolean }) => {
      expectRows(
        await supabase.from('mkt_artistas_reunioes' as never)
          .upsert({ artista_id: r.artista_id, mes: `${r.mes}-01`, presente: r.presente } as never, { onConflict: 'artista_id,mes' })
          .select('id'),
        'a reunião do mês',
      );
    },
    onSuccess: (_d, r) => qc.invalidateQueries({ queryKey: ['artistas-mkt', 'reunioes', tenantId, r.mes] }),
    onError: (e: Error) => toast.error(e.message),
  });
}
