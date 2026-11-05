// O Raio-X do Cliente: leitura e gravação. Quem pode ver e o que pode corrigir são regras do banco (migration
// 20270212380000); aqui só o caminho até elas.
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { expectRows, unwrap } from '@/lib/supabase-result';
import { lerAcompanhamento } from '@/hooks/useComercialLancamentos';
import type {
  LinhaDoRelatorio, Motivo, PerfilDoCliente, RaioXDoCliente, RespostaDoLancamento, ResultadoDaProposta, StatusDaDor, TipoDeProposta,
} from '@/lib/raio-x';

const erroNaTela = (e: unknown) => toast.error(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));

export function useRaioXDoCliente(codigo: string | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'raio-x', tenantId, codigo],
    enabled: !!tenantId && !!codigo,
    queryFn: async () => {
      const r = unwrap(await supabase.rpc('com_raio_x_do_cliente' as never, { p_codigo: codigo! } as never)) as unknown as RaioXDoCliente;
      return { ...r, valor_ultima_compra: r.valor_ultima_compra === null ? null : Number(r.valor_ultima_compra) };
    },
  });
}

export function useRelatorioRaioX(de: string, ate: string, carteira: string) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'raio-x-relatorio', tenantId, de, ate, carteira],
    enabled: !!tenantId,
    queryFn: async (): Promise<LinhaDoRelatorio[]> =>
      ((unwrap(await supabase.rpc('com_raio_x_relatorio' as never, { p_de: de || null, p_ate: ate || null, p_carteira: carteira || null } as never)) ?? []) as unknown as LinhaDoRelatorio[])
        .map((l) => ({ ...l, compravam: Number(l.compravam) })),
  });
}

export interface DorEmAberto { cliente_codigo: string; motivo: Motivo; motivo_outros: string | null }

/** As dores ainda em aberto, por cliente: "A quem procurar" mostra o motivo sem abrir a ficha. */
export function useDoresEmAberto() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'raio-x-abertas', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<DorEmAberto[]> =>
      (unwrap(await supabase.from('com_cliente_dores' as never)
        .select('cliente_codigo, motivo, motivo_outros')
        .in('status', ['aberta', 'em_tratamento'])
        .order('registrada_em', { ascending: false })) ?? []) as unknown as DorEmAberto[],
  });
}

/** Os clientes de cada carteira, pela leitura da própria Carteira: o relatório não refaz essa conta. */
export function useAcompanhamentoDasCarteiras(carteiras: string[], competencia: string) {
  const { tenantId } = useAuth();
  return useQueries({
    queries: carteiras.map((carteira) => ({
      queryKey: ['comercial', 'acompanhamento-da-carteira', tenantId, carteira, competencia, null, null, ''],
      enabled: !!tenantId,
      queryFn: () => lerAcompanhamento(carteira, competencia),
    })),
  });
}

function useAoGravar(mensagem: string) {
  const qc = useQueryClient();
  return {
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comercial', 'raio-x'] });
      qc.invalidateQueries({ queryKey: ['comercial', 'raio-x-relatorio'] });
      qc.invalidateQueries({ queryKey: ['comercial', 'raio-x-abertas'] });
      if (mensagem) toast.success(mensagem);
    },
    onError: erroNaTela,
  };
}

export type PerfilEmEdicao = Pick<PerfilDoCliente, 'tipo_negocio' | 'quem_decide' | 'melhor_contato' | 'o_que_pesa' | 'situacao'>;

export function useSalvarPerfil(codigo: string) {
  return useMutation({
    ...useAoGravar('Perfil salvo.'),
    mutationFn: async (perfil: PerfilEmEdicao) =>
      expectRows(await supabase.from('com_cliente_perfis' as never).insert({ ...perfil, cliente_codigo: codigo } as never).select('id'), 'o perfil'),
  });
}

export function useRegistrarDor(codigo: string) {
  return useMutation({
    ...useAoGravar('Dor registrada.'),
    mutationFn: async (dor: { motivo: Motivo; motivo_outros: string | null; descricao: string | null }) =>
      expectRows(await supabase.from('com_cliente_dores' as never).insert({ ...dor, cliente_codigo: codigo } as never).select('id'), 'a dor'),
  });
}

export function useMudarDor() {
  return useMutation({
    ...useAoGravar(''),
    mutationFn: async ({ id, ...campos }: { id: string; status?: StatusDaDor; motivo?: Motivo; motivo_outros?: string | null; descricao?: string | null }) =>
      expectRows(await supabase.from('com_cliente_dores' as never).update(campos as never).eq('id', id).select('id'), 'a dor'),
  });
}

export function useRegistrarProposta() {
  return useMutation({
    ...useAoGravar('Proposta registrada.'),
    mutationFn: async (p: { dor_id: string; tipo: TipoDeProposta; proposta: string }) =>
      expectRows(await supabase.from('com_cliente_propostas' as never).insert(p as never).select('id'), 'a proposta'),
  });
}

export function useMudarProposta() {
  return useMutation({
    ...useAoGravar(''),
    mutationFn: async ({ id, ...campos }: { id: string; resultado?: ResultadoDaProposta; proposta?: string }) =>
      expectRows(await supabase.from('com_cliente_propostas' as never).update(campos as never).eq('id', id).select('id'), 'a proposta'),
  });
}

/** A pergunta do lançamento. Repetir não duplica: o banco reconhece o lançamento. */
export function useRegistrarContato() {
  return useMutation({
    ...useAoGravar(''),
    mutationFn: async ({ interacaoId, r }: { interacaoId: string; r: RespostaDoLancamento }) => {
      unwrap(await supabase.rpc('com_registrar_contato_no_raio_x' as never, {
        p_interacao: interacaoId, p_resultado: r.resultado, p_motivo: r.resultado === 'falou' ? r.motivo : null,
        p_motivo_outros: r.motivoOutros, p_descricao: r.descricao, p_proposta_tipo: r.propostaTipo, p_proposta: r.proposta,
      } as never));
    },
  });
}
