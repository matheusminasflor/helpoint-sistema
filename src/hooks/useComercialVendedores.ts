import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap, expectRows } from '@/lib/supabase-result';

/**
 * Quais códigos de vendedor do Forteplus são PESSOA (2026-09-26, decisão do dono).
 *
 * Pelo contrário, e de propósito: liga-se quem É vendedor, em vez de listar quem
 * não é. Assim o Forteplus pode criar "FINANCEIRO LIBERADO" amanhã e o sistema
 * não precisa de mudança nenhuma — o código novo simplesmente não está ligado.
 *
 * O que isso resolve: medido em 2026-09-26, o código 1638 ("FINANCEIRO APROVADO")
 * assina R$ 5.017.738,47 de 168 clientes, e o 1637 ("FINANCEIRO CONFERENCIA")
 * outros R$ 770.936,66 — 56% do faturamento do histórico em etapas do processo
 * financeiro. Qualquer conta por vendedor pagava mais da metade a ninguém.
 */

export interface CodigoDeVendedor {
  vendedor_codigo: string;
  /** O nome como o Forteplus escreveu — às vezes é login ("lorrany.samara"). */
  vendedor_nome: string;
  valor: number;
  clientes: number;
  ultima_venda: string | null;
  /** Já está em `com_vendedores`, ou seja: alguém disse que é gente. */
  ligado: boolean;
}

export interface Vendedor {
  id: string;
  codigo: string;
  nome: string;
  user_id: string | null;
  ativo: boolean;
}

/** Os códigos que APARECERAM nas notas, com quanto cada um assina. */
export function useCodigosDeVendedor() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'codigos-de-vendedor', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<CodigoDeVendedor[]> => {
      const data = unwrap(await supabase.rpc('com_codigos_de_vendedor'));
      return (data || []) as unknown as CodigoDeVendedor[];
    },
  });
}

/** Os que já foram ligados. */
export function useVendedores() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'vendedores', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Vendedor[]> => {
      const data = unwrap(await supabase
        .from('com_vendedores')
        .select('id, codigo, nome, user_id, ativo')
        .order('nome'));
      return (data || []) as unknown as Vendedor[];
    },
  });
}

function useInvalidarVendedores() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['comercial', 'vendedores'] });
    qc.invalidateQueries({ queryKey: ['comercial', 'codigos-de-vendedor'] });
    // A ficha do cliente mostra `e_vendedor` por nota: ligar um código muda o
    // que ela diz.
    qc.invalidateQueries({ queryKey: ['comercial', 'vendedores-do-cliente'] });
  };
}

export function useLigarVendedor() {
  const { tenantId } = useAuth();
  const invalidar = useInvalidarVendedores();
  return useMutation({
    mutationFn: async ({ codigo, nome, userId }: { codigo: string; nome: string; userId?: string | null }) => {
      expectRows(
        await supabase
          .from('com_vendedores')
          .insert({
            tenant_id: tenantId,
            codigo: codigo.trim(),
            nome: nome.trim(),
            user_id: userId || null,
          } as never)
          .select('id'),
        'o vínculo do vendedor',
      );
    },
    onSuccess: () => { invalidar(); toast.success('Código ligado a uma pessoa'); },
    onError: (e: Error) => {
      const msg = /com_vendedores_unico|duplicate key/i.test(e.message ?? '')
        ? 'Este código já está ligado.'
        : e.message;
      toast.error(`Erro ao ligar: ${msg}`);
    },
  });
}

export function useDesligarVendedor() {
  const invalidar = useInvalidarVendedores();
  return useMutation({
    mutationFn: async (id: string) => {
      expectRows(
        await supabase.from('com_vendedores').delete().eq('id', id).select('id'),
        'a remoção do vínculo',
      );
    },
    onSuccess: () => { invalidar(); toast.success('Vínculo removido'); },
    onError: (e: Error) => toast.error(`Erro ao remover: ${e.message}`),
  });
}
