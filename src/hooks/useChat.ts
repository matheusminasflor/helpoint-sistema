import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { unwrap, expectRows } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantPath } from '@/hooks/useTenantPath';
import type { Database } from '@/integrations/supabase/types';
import { caminhoDoAnexo, LIMITE_DO_ANEXO } from '@/lib/chat-midia';

/**
 * Chat interno (L11a/L11b) — canais por setor, menção, não-lidas e conversa
 * direta. O corredor, não o arquivo: nada aqui comenta em chamado, nem o
 * contrário (§2 do plano).
 */

export type ChatCanalRow = Database['public']['Tables']['chat_channels']['Row'];
// `noticia_id` (20270128040000): a mensagem automática do Jornal aponta para a notícia; só o sistema a preenche.
export type ChatMensagemRow = Database['public']['Tables']['chat_messages']['Row'] & { noticia_id?: string | null };

export function useCanais() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['chat-canais', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<ChatCanalRow[]> =>
      unwrap(await supabase.from('chat_channels').select('*').order('nome')),
  });
}

/**
 * As mensagens de um canal, com assinatura de tempo real. Uma consulta só,
 * sem `select` aninhado: as FKs são compostas e o embed do PostgREST fica
 * ambíguo (mesmo motivo de `useProjetos.ts`). Os nomes de quem escreveu vêm
 * de `useProfiles`, à parte.
 */
/**
 * As mensagens do canal. DEFEITO até 2026-10-25: a consulta pedia as 200 MAIS ANTIGAS (`order asc` + `limit`), e num
 * canal com mais de 200 a mensagem nova não aparecia. Agora pede as `limite` mais novas e devolve em ordem de
 * leitura; `busca` procura no canal inteiro.
 */
export function useMensagens(channelId: string | undefined, limite = 200, busca = '') {
  const { tenantId } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!channelId) return;
    const channel = supabase
      .channel('chat-' + channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages', filter: 'channel_id=eq.' + channelId },
        () => {
          qc.invalidateQueries({ queryKey: ['chat-mensagens', tenantId, channelId] });
          // Mensagem nova muda o contador tambem — sem isto a bolinha so se
          // movia quando a janela perdia e recuperava o foco.
          qc.invalidateQueries({ queryKey: ['chat-nao-lidas', tenantId] });
          qc.invalidateQueries({ queryKey: ['chat-ultimas', tenantId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelId, tenantId, qc]);

  return useQuery({
    queryKey: ['chat-mensagens', tenantId, channelId, limite, busca],
    enabled: !!tenantId && !!channelId,
    queryFn: async (): Promise<ChatMensagemRow[]> => {
      let q = supabase.from('chat_messages').select('*').eq('channel_id', channelId!);
      if (busca.trim()) q = q.ilike('conteudo', `%${busca.trim()}%`);
      const linhas = unwrap(await q.order('created_at', { ascending: false }).limit(limite)) ?? [];
      return [...linhas].reverse();
    },
  });
}

export interface NovaMensagemInput {
  conteudo: string;
  /** Quem foi citado com `@Nome` — decisão 8 (L11b): vira aviso no sino de quem participa do canal. */
  mencionados?: string[];
  /** Foto, áudio ou arquivo até 10 MB (20270119010000). A foto já chega comprimida. */
  anexo?: File | null;
}

/** As colunas do anexo, que os tipos gerados ainda não conhecem. */
export interface AnexoDaMensagem {
  anexo_path: string | null;
  anexo_nome: string | null;
  anexo_tipo: string | null;
  anexo_bytes: number | null;
  anexo_apagado_em: string | null;
}

/**
 * O DVR de 300 MB: o banco marca os anexos mais antigos e devolve os caminhos; quem está enviando os remove.
 * Falhar aqui não impede o envio — o próximo anexo tenta de novo.
 */
async function liberarEspaco(bytes: number) {
  const { data, error } = await supabase.rpc('chat_liberar_espaco' as never, { p_bytes: bytes } as never);
  if (error) { console.error('chat_liberar_espaco', error); return; }
  const caminhos = (data ?? []) as unknown as string[];
  if (caminhos.length) {
    const { error: e } = await supabase.storage.from('chat').remove(caminhos);
    if (e) console.error('chat: remover anexos antigos', e);
  }
}

/** Link temporário (10 min) do anexo; null quando saiu para liberar espaço. */
export function useUrlDoAnexo(path: string | null, apagado: boolean) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['chat-anexo', tenantId, path],
    enabled: !!path && !apagado,
    staleTime: 8 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('chat').createSignedUrl(path!, 600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

export function useEnviarMensagem(channelId: string) {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ conteudo, mencionados, anexo }: NovaMensagemInput) => {
      let colunas: Partial<AnexoDaMensagem> = {};
      if (anexo) {
        if (anexo.size > LIMITE_DO_ANEXO) throw new Error('O anexo passa de 10 MB.');
        await liberarEspaco(anexo.size);
        const path = caminhoDoAnexo(tenantId!, channelId, anexo.name, crypto.randomUUID());
        const { error } = await supabase.storage.from('chat').upload(path, anexo, { contentType: anexo.type || undefined });
        if (error) throw error;
        colunas = { anexo_path: path, anexo_nome: anexo.name, anexo_tipo: anexo.type || null, anexo_bytes: anexo.size };
      }
      return expectRows(
        await supabase.from('chat_messages')
          .insert({
            tenant_id: tenantId!,
            channel_id: channelId,
            author_id: user!.id,
            conteudo,
            mencionados: mencionados ?? [],
            ...colunas,
          } as never)
          .select('id'),
        'a mensagem',
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-mensagens', tenantId, channelId] });
      qc.invalidateQueries({ queryKey: ['chat-nao-lidas', tenantId] });
      qc.invalidateQueries({ queryKey: ['chat-ultimas', tenantId] });
    },
    onError: (e) => toast.error(traduzir(e)),
  });
}

/**
 * Quantas mensagens não lidas por canal (decisão 7: uma conta sobre o que
 * já existe, não um segundo sistema de aviso). Invalidada pela mesma
 * assinatura de tempo real de `useMensagens` — abrir qualquer canal já
 * dispara a invalidação de `chat-mensagens`, mas esta lista é separada, então
 * Quem a mantém em dia é a invalidação: a assinatura de tempo real das
 * mensagens e as mutations de enviar, apagar e entrar no canal. Sem isso o
 * número só se movia quando a janela perdia e recuperava o foco — a pessoa
 * abria o canal, lia tudo, e a bolinha continuava lá.
 */
export function useNaoLidas() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['chat-nao-lidas', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<{ channel_id: string; qtd: number }[]> =>
      unwrap(await supabase.rpc('chat_nao_lidas')),
  });
}

export interface UltimaMensagem {
  channel_id: string;
  author_id: string;
  conteudo: string;
  created_at: string;
  deleted_at: string | null;
}

/**
 * A última mensagem de cada canal, para a lista do Chat como a do WhatsApp (dono, 2026-10-28): prévia, hora e a ordem
 * de quem falou por último. Uma consulta só: as 300 mensagens mais novas que a pessoa enxerga, e a primeira de cada
 * canal. ponytail: canal sem mensagem entre as 300 mais novas aparece sem prévia; se incomodar, uma função no banco
 * com `distinct on (channel_id)` resolve.
 */
export function useUltimasMensagens() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['chat-ultimas', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Map<string, UltimaMensagem>> => {
      const linhas: UltimaMensagem[] = unwrap(await supabase.from('chat_messages')
        .select('channel_id, author_id, conteudo, created_at, deleted_at')
        .order('created_at', { ascending: false })
        .limit(300)) ?? [];
      const mapa = new Map<string, UltimaMensagem>();
      for (const m of linhas) if (!mapa.has(m.channel_id)) mapa.set(m.channel_id, m);
      return mapa;
    },
  });
}

/**
 * Abre a conversa direta com alguém, ou entra na que já existe
 * (`chat_abrir_conversa` é find-or-create no banco — decisão 2). Navega para
 * ela e força a lista de canais a buscar de novo, porque a conversa pode ser
 * nova e ainda não estar no cache.
 */
export function useAbrirConversa() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  return useMutation({
    mutationFn: async (outroId: string) =>
      unwrap(await supabase.rpc('chat_abrir_conversa', { p_outro: outroId })),
    onSuccess: (channelId) => {
      qc.invalidateQueries({ queryKey: ['chat-canais', tenantId] }); qc.invalidateQueries({ queryKey: ['chat-participantes', tenantId] });
      navigate(tenantPath(`/chat/${channelId}`));
    },
    onError: (e) => toast.error(traduzir(e)),
  });
}

/** Apagar é do autor e de dono/administrador — decisão 5: o texto some do banco de verdade. */
export function useApagarMensagem(channelId: string) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const linhas = expectRows(
        await supabase.from('chat_messages')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', id)
          .select('id, anexo_path' as 'id'),
        'a mensagem',
      ) as unknown as Array<{ anexo_path: string | null }>;
      // O banco marcou o anexo (20270119010000); o arquivo sai do Storage aqui.
      const caminhos = linhas.map((l) => l.anexo_path).filter((p): p is string => !!p);
      if (caminhos.length) {
        const { error } = await supabase.storage.from('chat').remove(caminhos);
        if (error) console.error('chat: remover o anexo apagado', error);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-mensagens', tenantId, channelId] });
      qc.invalidateQueries({ queryKey: ['chat-nao-lidas', tenantId] });
      qc.invalidateQueries({ queryKey: ['chat-ultimas', tenantId] });
    },
    onError: (e) => toast.error(traduzir(e)),
  });
}

export interface NovoCanalInput {
  nome: string;
  descricao?: string | null;
  privado: boolean;
  /** Só usado quando `privado`. O criador já entra pelo trigger do banco. */
  convidados?: string[];
}

export function useCriarCanal() {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NovoCanalInput) => {
      const [linha] = expectRows(
        await supabase.from('chat_channels')
          .insert({
            tenant_id: tenantId!,
            nome: input.nome.trim(),
            descricao: input.descricao?.trim() || null,
            privado: input.privado,
            created_by: user!.id,
          })
          .select('id'),
        'o canal',
      );
      // O criador nunca vai na lista: o trigger já o incluiu, e incluir de novo dá 23505.
      const convidados = (input.convidados ?? []).filter((id) => id !== user!.id);
      if (input.privado && convidados.length) {
        expectRows(
          await supabase.from('chat_channel_members')
            .insert(convidados.map((userId) => ({
              tenant_id: tenantId!,
              channel_id: linha.id,
              user_id: userId,
            })))
            .select('id'),
          'os convidados',
        );
      }
      return linha;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-canais', tenantId] }); qc.invalidateQueries({ queryKey: ['chat-participantes', tenantId] });
      toast.success('Canal criado.');
    },
    onError: (e) => toast.error(traduzir(e)),
  });
}

export function useApagarCanal() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      expectRows(await supabase.from('chat_channels').delete().eq('id', id).select('id'), 'o canal'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-canais', tenantId] });
      toast.success('Canal removido.');
    },
    onError: (e) => toast.error(traduzir(e)),
  });
}

/**
 * Chamado ao abrir o canal: marca "li até aqui" para quem já participa, e
 * entra, quando o canal é aberto e a pessoa ainda não está nele.
 *
 * **São duas operações, e juntá-las num `upsert` era o defeito.** O `upsert`
 * vira `INSERT ... ON CONFLICT DO UPDATE`, e o PostgreSQL avalia o `WITH CHECK`
 * do INSERT sobre a linha proposta **mesmo quando o caminho tomado é o do
 * conflito**. A policy de INSERT exige canal aberto (ou ser o criador), então
 * quem foi convidado para um canal fechado tomava `42501` toda vez que abria o
 * canal — e `last_read_at` nunca andava justamente ali.
 *
 * Primeiro o UPDATE, que é o caso comum e o único que o convidado pode fazer.
 * Só se ele não achar linha é que se tenta entrar, e aí a policy de INSERT
 * decide — que é exatamente o que ela existe para decidir.
 */
export function useEntrarNoCanal() {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (channelId: string) => {
      const marcados = unwrap(
        await supabase.from('chat_channel_members')
          .update({ last_read_at: new Date().toISOString() })
          .eq('channel_id', channelId)
          .eq('user_id', user!.id)
          .select('id'),
      );
      if (marcados.length > 0) return marcados;

      return expectRows(
        await supabase.from('chat_channel_members')
          .insert({ tenant_id: tenantId!, channel_id: channelId, user_id: user!.id })
          .select('id'),
        'a entrada no canal',
      );
    },
    // Marcar como lido é o que zera a bolinha: sem esta invalidação, a pessoa
    // abria o canal, lia tudo, e o número continuava lá até a janela perder e
    // recuperar o foco.
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['chat-nao-lidas', tenantId] }); qc.invalidateQueries({ queryKey: ['chat-participantes', tenantId] }); },
    // Abrir um canal fechado de que a pessoa não participa é caso normal para
    // dono e administrador (decisão 11 revista): eles veem que ele existe. Não
    // vira erro na tela — a tela já diz que eles não participam.
    onError: () => { /* silêncio proposital; ver o comentário acima */ },
  });
}

export interface ChatParticipante {
  user_id: string;
  nome: string;
}

/**
 * Os participantes de TODAS as conversas que a pessoa vê, numa consulta (mais uma para os nomes). Até 2026-10-28 eram
 * duas por conversa — o nome de cada conversa direta na lista pedia os dela: 14 conversas, ~28 idas ao servidor em duas
 * ondas ao abrir o Chat; no celular, segundos (vídeo do dono: "no chat demorando, puxa as informações").
 */
function useParticipantesDeTodos() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['chat-participantes', tenantId, 'todos'],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, ChatParticipante[]>> => {
      const membros = unwrap(await supabase.from('chat_channel_members').select('channel_id, user_id')) ?? [];
      const ids = [...new Set(membros.map((m) => m.user_id))];
      const perfis = ids.length
        ? unwrap(await supabase.from('profiles').select('id, full_name, email').in('id', ids)) ?? [] : [];
      const nome = new Map(perfis.map((p) => [p.id, p.full_name || p.email]));
      const por: Record<string, ChatParticipante[]> = {};
      for (const m of membros) {
        if (!nome.has(m.user_id)) continue; // perfil que a pessoa não vê: fica de fora, como antes
        (por[m.channel_id] ??= []).push({ user_id: m.user_id, nome: nome.get(m.user_id)! });
      }
      for (const lista of Object.values(por)) lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      return por;
    },
  });
}

export function useParticipantesDoCanal(channelId: string | undefined) {
  const todos = useParticipantesDeTodos();
  return { ...todos, data: channelId && todos.data ? todos.data[channelId] ?? [] : undefined };
}

/**
 * O nome que a tela mostra para um canal ou uma conversa direta. Um lugar só
 * decide isto (mesma ideia de `textoDaMensagem`): conversa direta não tem
 * `nome` no banco (é sempre `null` — a migration garante isso), então o
 * rótulo é o nome de quem está do outro lado, buscado nos participantes.
 *
 * Cobre também o caso de dono/administrador olhando uma conversa direta de
 * que não participam (decisão 11, revista, vale para conversa direta
 * também): aí "o outro lado" não existe — mostra os dois nomes, porque
 * mostrar só um seria escolher um dos dois sem motivo.
 */
export function useRotuloDoCanal(canal: ChatCanalRow): string {
  const { user } = useAuth();
  const { data: participantes = [] } = useParticipantesDoCanal(
    canal.tipo === 'direta' ? canal.id : undefined,
  );
  if (canal.tipo !== 'direta') return canal.nome ?? '';
  const outros = participantes.filter((p) => p.user_id !== user?.id);
  if (outros.length === participantes.length && participantes.length > 0) {
    return participantes.map((p) => p.nome).join(' e ');
  }
  return outros[0]?.nome ?? 'Conversa direta';
}

/** O erro do banco em português de quem usa o sistema. */
function traduzir(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('chat_channels_nome_unico')) return 'Já existe um canal com esse nome.';
  if (msg.includes('mensagem do chat nao se edita')) return 'Mensagem não pode ser editada — só apagada.';
  if (msg.includes('conversa direta precisa de duas pessoas diferentes')) {
    return 'Escolha outra pessoa para conversar.';
  }
  if (msg.includes('pessoa invalida para conversa direta')) {
    return 'Não foi possível abrir esta conversa.';
  }
  if (msg.includes('row-level security') || msg.includes('42501')) {
    return 'Você não participa deste canal.';
  }
  return msg;
}
