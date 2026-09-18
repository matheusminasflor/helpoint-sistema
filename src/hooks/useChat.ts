import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { unwrap, expectRows } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import type { Database } from '@/integrations/supabase/types';

/**
 * Chat interno (L11a) — canais por setor e mensagens. O corredor, não o
 * arquivo: nada aqui comenta em chamado, nem o contrário (§2 do plano).
 */

export type ChatCanalRow = Database['public']['Tables']['chat_channels']['Row'];
export type ChatMensagemRow = Database['public']['Tables']['chat_messages']['Row'];

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
export function useMensagens(channelId: string | undefined) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!channelId) return;
    const channel = supabase
      .channel('chat-' + channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages', filter: 'channel_id=eq.' + channelId },
        () => qc.invalidateQueries({ queryKey: ['chat-mensagens', tenantId, channelId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelId, tenantId, qc]);

  return useQuery({
    queryKey: ['chat-mensagens', tenantId, channelId],
    enabled: !!tenantId && !!channelId,
    queryFn: async (): Promise<ChatMensagemRow[]> =>
      unwrap(
        await supabase.from('chat_messages').select('*')
          .eq('channel_id', channelId!)
          .order('created_at', { ascending: true })
          .limit(200),
      ),
  });
}

export function useEnviarMensagem(channelId: string) {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conteudo: string) =>
      expectRows(
        await supabase.from('chat_messages')
          .insert({ tenant_id: tenantId!, channel_id: channelId, author_id: user!.id, conteudo })
          .select('id'),
        'a mensagem',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat-mensagens', tenantId, channelId] }),
    onError: (e) => toast.error(traduzir(e)),
  });
}

/** Apagar é do autor e de dono/administrador — decisão 5: o texto some do banco de verdade. */
export function useApagarMensagem(channelId: string) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      expectRows(
        await supabase.from('chat_messages')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', id)
          .select('id'),
        'a mensagem',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat-mensagens', tenantId, channelId] }),
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
      if (input.privado && input.convidados?.length) {
        expectRows(
          await supabase.from('chat_channel_members')
            .insert(input.convidados.map((userId) => ({
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
      qc.invalidateQueries({ queryKey: ['chat-canais', tenantId] });
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
 * Chamado ao abrir o canal: entra (canal aberto) ou marca "li até aqui"
 * (`last_read_at`) para quem já é membro. `onConflict` porque a pessoa pode
 * já estar lá — a policy de INSERT só deixa entrar de novo em canal aberto,
 * mas o `upsert` cobre os dois casos com uma chamada só.
 */
export function useEntrarNoCanal() {
  const { tenantId, user } = useAuth();
  return useMutation({
    mutationFn: async (channelId: string) =>
      expectRows(
        await supabase.from('chat_channel_members')
          .upsert(
            { tenant_id: tenantId!, channel_id: channelId, user_id: user!.id, last_read_at: new Date().toISOString() },
            { onConflict: 'channel_id,user_id' },
          )
          .select('id'),
        'a entrada no canal',
      ),
  });
}

export interface ChatParticipante {
  user_id: string;
  nome: string;
}

export function useParticipantesDoCanal(channelId: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['chat-participantes', tenantId, channelId],
    enabled: !!tenantId && !!channelId,
    queryFn: async (): Promise<ChatParticipante[]> => {
      const membros = unwrap(
        await supabase.from('chat_channel_members').select('user_id').eq('channel_id', channelId!),
      );
      if (membros.length === 0) return [];
      const perfis = unwrap(
        await supabase.from('profiles').select('id, full_name, email').in('id', membros.map((m) => m.user_id)),
      );
      return perfis
        .map((p) => ({ user_id: p.id, nome: p.full_name || p.email }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    },
  });
}

export function useConvidarParaCanal(channelId: string) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) =>
      expectRows(
        await supabase.from('chat_channel_members')
          .insert({ tenant_id: tenantId!, channel_id: channelId, user_id: userId })
          .select('id'),
        'o participante',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat-participantes', tenantId, channelId] }),
    onError: (e) => toast.error(traduzir(e)),
  });
}

export function useTirarDoCanal(channelId: string) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) =>
      expectRows(
        await supabase.from('chat_channel_members').delete()
          .eq('channel_id', channelId).eq('user_id', userId).select('id'),
        'o participante',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat-participantes', tenantId, channelId] }),
    onError: (e) => toast.error(traduzir(e)),
  });
}

/** O erro do banco em português de quem usa o sistema. */
function traduzir(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('chat_channels_nome_unico')) return 'Já existe um canal com esse nome.';
  if (msg.includes('mensagem do chat nao se edita')) return 'Mensagem não pode ser editada — só apagada.';
  if (msg.includes('row-level security') || msg.includes('42501')) {
    return 'Você não participa deste canal.';
  }
  return msg;
}
