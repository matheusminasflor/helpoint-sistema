// Marketing › Benefício de sexta (dono, 2026-10-20; migrations 20270129070000 e 20270129080000). A regra mora no
// banco: retirar (`beneficio_retirar`: até 3 da mesma linha, 2 de linhas diferentes; os lotes saem por FIFO — o que
// vence primeiro —, nunca vencidos; 2 atrasos em 6 meses → espera liberação), liberar (`beneficio_liberar`) e devolver
// (`beneficio_devolver`: fora do prazo, motivo e detalhe obrigatórios). Quem registra e quem cadastra vem da matriz
// (Marketing › Benefício de sexta); quem libera, da aba de configuração do Marketing.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { expectRows, unwrap } from '@/lib/supabase-result';

export interface LoteDoBeneficio { id: string; produto_id: string; lote: string; validade: string | null; condicao: 'lacrado' | 'aberto'; quantidade: number }
export interface ProdutoDoBeneficio { id: string; nome: string; familia_id: string; ativo: boolean; familia: { nome: string } | null; lotes: LoteDoBeneficio[] }
export interface ItemDaRetirada {
  quantidade: number;
  lote_id: string | null;
  produto: { id: string; nome: string; familia: { nome: string } | null } | null;
  lote: { lote: string; validade: string | null; condicao: string } | null;
}
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
export interface ConfigDoBeneficio { liberador_id: string | null }

const chave = (tenantId: string | null | undefined) => ['beneficio-sexta', tenantId];

export function useConfigDoBeneficio() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: [...chave(tenantId), 'config'],
    enabled: !!tenantId,
    queryFn: async (): Promise<ConfigDoBeneficio | null> =>
      unwrap(await supabase.from('mkt_beneficio_config' as never).select('liberador_id').maybeSingle()) as unknown as ConfigDoBeneficio | null,
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
        .select('id, nome, familia_id, ativo, familia:com_familias(nome), lotes:mkt_beneficio_lotes(id, produto_id, lote, validade, condicao, quantidade)')
        .order('nome')) ?? []) as unknown as ProdutoDoBeneficio[])
        .map((p) => ({ ...p, lotes: [...p.lotes].sort((a, b) => (a.validade ?? '9999').localeCompare(b.validade ?? '9999')) })),
  });
}

export function useRetiradas() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: [...chave(tenantId), 'retiradas'],
    enabled: !!tenantId,
    queryFn: async (): Promise<Retirada[]> =>
      ((unwrap(await supabase.from('mkt_beneficio_retiradas' as never)
        .select('*, itens:mkt_beneficio_itens(quantidade, lote_id, produto:mkt_beneficio_produtos(id, nome, familia:com_familias(nome)), lote:mkt_beneficio_lotes(lote, validade, condicao))')
        .order('pedido_em', { ascending: false })
        .limit(500)) ?? []) as unknown as Retirada[]),
  });
}

/** As linhas de produto (as famílias do Comercial: uma lista só). */
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
  return () => {
    qc.invalidateQueries({ queryKey: chave(tenantId) });
    qc.invalidateQueries({ queryKey: ['com-familias-ativas', tenantId] });
  };
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

/** O produto e os lotes dele numa ida: lote novo entra, lote alterado muda, lote tirado sai. */
export function useSalvarProduto() {
  const { tenantId } = useAuth();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (p: { id?: string; nome: string; familia_id: string; ativo: boolean; lotes: Partial<LoteDoBeneficio>[]; lotesTirados: string[] }) => {
      const linha = { tenant_id: tenantId, nome: p.nome.trim(), familia_id: p.familia_id, ativo: p.ativo };
      const salvo = unwrap(
        p.id
          ? await supabase.from('mkt_beneficio_produtos' as never).update(linha as never).eq('id', p.id).select('id')
          : await supabase.from('mkt_beneficio_produtos' as never).insert(linha as never).select('id'),
      ) as unknown as { id: string }[] | null;
      const produtoId = salvo?.[0]?.id;
      if (!produtoId) throw new Error('O produto não foi gravado (sem permissão de cadastrar produtos do benefício?).');
      for (const id of p.lotesTirados) {
        expectRows(await supabase.from('mkt_beneficio_lotes' as never).delete().eq('id', id).select('id'), 'o lote');
      }
      for (const l of p.lotes) {
        const dados = { tenant_id: tenantId, produto_id: produtoId, lote: (l.lote ?? '').trim(), validade: l.validade || null,
          condicao: l.condicao ?? 'lacrado', quantidade: l.quantidade ?? 0 };
        expectRows(
          l.id
            ? await supabase.from('mkt_beneficio_lotes' as never).update(dados as never).eq('id', l.id).select('id')
            : await supabase.from('mkt_beneficio_lotes' as never).insert(dados as never).select('id'),
          `o lote ${dados.lote}`,
        );
      }
    },
    onSuccess: () => { invalidar(); toast.success('Produto salvo.'); },
    onError: (e: Error) => toast.error(`Não salvou: ${e.message}`),
  });
}

export function useCriarLinha() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (nome: string) =>
      unwrap(await supabase.rpc('beneficio_criar_linha' as never, { p_nome: nome } as never)) as unknown as string,
    onSuccess: () => { invalidar(); toast.success('Linha criada.'); },
    onError: (e: Error) => toast.error(e.message),
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
