// Marketing › Benefício de sexta (dono, 2026-10-20; migration 20270129070000). A regra mora no banco: retirar
// (`beneficio_retirar`: até 3 da mesma linha, 2 de linhas diferentes; 2 atrasos em 6 meses → espera liberação),
// liberar (`beneficio_liberar`) e devolver (`beneficio_devolver`: fora do prazo, motivo e detalhe obrigatórios).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { expectRows, unwrap } from '@/lib/supabase-result';

export interface ProdutoDoBeneficio { id: string; nome: string; familia_id: string; quantidade: number; ativo: boolean; familia: { nome: string } | null }
export interface ItemDaRetirada { quantidade: number; produto: { id: string; nome: string; familia: { nome: string } | null } | null }
export interface Retirada {
  id: string;
  colaborador_id: string;
  registrado_por: string | null;
  status: 'aguardando_liberacao' | 'recusada' | 'retirada' | 'devolvida';
  pedido_em: string;
  retirado_em: string | null;
  prazo: string | null;
  liberado_por: string | null;
  liberacao_motivo: string | null;
  devolvido_em: string | null;
  atraso: boolean;
  motivo_atraso: string | null;
  estado_na_volta: 'normal' | 'uso_acima' | 'danificado' | null;
  detalhe_da_volta: string | null;
  ma_fe: boolean;
  itens: ItemDaRetirada[];
}
export interface ConfigDoBeneficio { responsavel_id: string | null; liberador_id: string | null }

const chave = (tenantId: string | null | undefined) => ['beneficio-sexta', tenantId];

export function useConfigDoBeneficio() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: [...chave(tenantId), 'config'],
    enabled: !!tenantId,
    queryFn: async (): Promise<ConfigDoBeneficio | null> =>
      unwrap(await supabase.from('mkt_beneficio_config' as never).select('responsavel_id, liberador_id').maybeSingle()) as unknown as ConfigDoBeneficio | null,
  });
}

/** Quem libera (gestor do Marketing ou o liberador da configuração): a mesma pergunta do banco. */
export function useEhLiberador() {
  const { tenantId, user } = useAuth();
  return useQuery({
    queryKey: [...chave(tenantId), 'liberador', user?.id],
    enabled: !!tenantId && !!user?.id,
    queryFn: async () => !!unwrap(await supabase.rpc('beneficio_e_liberador' as never)),
  });
}

export function useProdutosDoBeneficio() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: [...chave(tenantId), 'produtos'],
    enabled: !!tenantId,
    queryFn: async (): Promise<ProdutoDoBeneficio[]> =>
      ((unwrap(await supabase.from('mkt_beneficio_produtos' as never)
        .select('id, nome, familia_id, quantidade, ativo, familia:com_familias(nome)').order('nome')) ?? []) as unknown as ProdutoDoBeneficio[]),
  });
}

export function useRetiradas() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: [...chave(tenantId), 'retiradas'],
    enabled: !!tenantId,
    queryFn: async (): Promise<Retirada[]> =>
      ((unwrap(await supabase.from('mkt_beneficio_retiradas' as never)
        .select('*, itens:mkt_beneficio_itens(quantidade, produto:mkt_beneficio_produtos(id, nome, familia:com_familias(nome)))')
        .order('pedido_em', { ascending: false })
        .limit(500)) ?? []) as unknown as Retirada[]),
  });
}

/** As linhas de produto (as famílias do Comercial). */
export function useLinhas() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['com-familias-ativas', tenantId],
    enabled: !!tenantId,
    queryFn: async () =>
      ((unwrap(await supabase.from('com_familias' as never).select('id, nome').eq('ativo', true).order('nome')) ?? []) as unknown as { id: string; nome: string }[]),
  });
}

function useInvalidar() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: chave(tenantId) });
}

export function useRetirar() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ colaborador, itens }: { colaborador: string; itens: { produto_id: string; quantidade: number }[] }) =>
      unwrap(await supabase.rpc('beneficio_retirar' as never, { p_colaborador: colaborador, p_itens: itens } as never)) as unknown as string,
    onSuccess: () => { invalidar(); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useLiberar() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ id, aprova, motivo }: { id: string; aprova: boolean; motivo: string }) => {
      unwrap(await supabase.rpc('beneficio_liberar' as never, { p_retirada: id, p_aprova: aprova, p_motivo: motivo } as never));
    },
    onSuccess: (_d, v) => { invalidar(); toast.success(v.aprova ? 'Retirada liberada.' : 'Retirada recusada.'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDevolver() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (v: { id: string; estado: string; motivo: string; detalhe: string }) => {
      unwrap(await supabase.rpc('beneficio_devolver' as never,
        { p_retirada: v.id, p_estado: v.estado, p_motivo_atraso: v.motivo, p_detalhe: v.detalhe } as never));
    },
    onSuccess: () => { invalidar(); toast.success('Devolução registrada: os produtos voltaram ao estoque do benefício.'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useSalvarProduto() {
  const { tenantId } = useAuth();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (p: { id?: string; nome: string; familia_id: string; quantidade: number; ativo: boolean }) => {
      const linha = { tenant_id: tenantId, nome: p.nome.trim(), familia_id: p.familia_id, quantidade: p.quantidade, ativo: p.ativo };
      expectRows(
        p.id
          ? await supabase.from('mkt_beneficio_produtos' as never).update(linha as never).eq('id', p.id).select('id')
          : await supabase.from('mkt_beneficio_produtos' as never).insert(linha as never).select('id'),
        'o produto',
      );
    },
    onSuccess: () => { invalidar(); toast.success('Produto salvo.'); },
    onError: (e: Error) => toast.error(`Não salvou: ${e.message}`),
  });
}

export function useSalvarConfigDoBeneficio() {
  const { tenantId } = useAuth();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (c: ConfigDoBeneficio) => {
      expectRows(
        await supabase.from('mkt_beneficio_config' as never)
          .upsert({ tenant_id: tenantId, ...c, updated_at: new Date().toISOString() } as never).select('tenant_id'),
        'a configuração',
      );
    },
    onSuccess: () => { invalidar(); toast.success('Configuração salva.'); },
    onError: (e: Error) => toast.error(`Não salvou: ${e.message}`),
  });
}
