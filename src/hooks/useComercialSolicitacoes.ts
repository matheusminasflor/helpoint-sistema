// A fila de cadastro de cliente novo (LEVA O, parte 3) — as abas "Cadastro - <vendedor>" da
// planilha de Gestão Comercial, dentro do sistema. As regras moram no banco (migration
// `20261114030000`): quem pede, quem decide, quem aplica, e que aprovar abre o chamado na mesma
// transação. Este arquivo só as chama.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { unwrap, expectRows } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import { mensagemDeErro } from '@/hooks/useComercialImport';
import { soDigitos } from '@/lib/documento';

export type StatusSolicitacao = 'pendente' | 'ajustar' | 'aprovado' | 'reprovado' | 'aplicado';
export type Prioridade = 'alta' | 'media' | 'baixa';

export const ROTULO_STATUS: Record<StatusSolicitacao, string> = {
  pendente: 'Pendente',
  ajustar: 'Ajustar',
  aprovado: 'Aprovado — a aplicar',
  reprovado: 'Reprovado',
  aplicado: 'Aplicado',
};

export interface Solicitacao {
  id: string;
  vendedor_id: string;
  vendedor_nome: string;
  razao_social: string;
  documento: string | null;
  uf: string | null;
  cidade: string | null;
  telefone: string | null;
  telefone_2: string | null;
  email: string | null;
  endereco: string | null;
  cep: string | null;
  inscricao_estadual: string | null;
  condicao_fiscal: string | null;
  grupo: string | null;
  prioridade: Prioridade;
  motivo: string | null;
  status: StatusSolicitacao;
  parecer: string | null;
  decidido_em: string | null;
  ticket_id: string | null;
  cliente_codigo: string | null;
  created_at: string;
}

export type PedidoInput = Pick<Solicitacao,
  'razao_social' | 'documento' | 'uf' | 'cidade' | 'telefone' | 'telefone_2' | 'email' | 'endereco' |
  'cep' | 'inscricao_estadual' | 'condicao_fiscal' | 'grupo' | 'prioridade' | 'motivo'> & { id?: string };

const CHAVES = ['solicitacoes-cadastro', 'contagem-solicitacoes'];

function invalidar(qc: ReturnType<typeof useQueryClient>, tenantId?: string | null) {
  for (const c of CHAVES) qc.invalidateQueries({ queryKey: ['comercial', c, tenantId] });
}

/** A fila. O RLS decide: a vendedora vê os pedidos dela; o gestor, todos. */
export function useSolicitacoesCadastro() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'solicitacoes-cadastro', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Solicitacao[]> => {
      const linhas = unwrap(await supabase
        .from('com_solicitacoes_cadastro')
        .select(`id, vendedor_id, razao_social, documento, uf, cidade, telefone, telefone_2, email, endereco,
                 cep, inscricao_estadual, condicao_fiscal, grupo, prioridade, motivo, status, parecer,
                 decidido_em, ticket_id, cliente_codigo, created_at,
                 vendedora:profiles!com_solicitacoes_cadastro_vendedor_id_fkey(full_name, email)`)
        .order('created_at', { ascending: false })) as unknown as Array<Omit<Solicitacao, 'vendedor_nome'> & {
          vendedora: { full_name: string | null; email: string } | null;
        }>;
      return linhas.map(({ vendedora, ...l }) => ({
        ...l,
        vendedor_nome: vendedora?.full_name || vendedora?.email || '(sem nome)',
      }));
    },
  });
}

/** Os quatro números do painel da planilha (Pendentes, Aprovadas a aplicar, Aplicadas, Reprovadas/Ajustar). */
export function contarSolicitacoes(lista: Pick<Solicitacao, 'status'>[]) {
  return {
    pendentes: lista.filter((s) => s.status === 'pendente').length,
    aAplicar: lista.filter((s) => s.status === 'aprovado').length,
    aplicadas: lista.filter((s) => s.status === 'aplicado').length,
    reprovadasOuAjustar: lista.filter((s) => s.status === 'reprovado' || s.status === 'ajustar').length,
  };
}

/**
 * O CNPJ/CPF já é de algum cliente? Pergunta ao banco por uma função que enxerga a base inteira
 * — com "cada vendedor só vê a sua carteira" ligado, a leitura normal esconderia o cliente de
 * outra carteira, e o pedido duplicado passaria.
 */
export function useDocumentoJaCadastrado(documento: string) {
  const { tenantId } = useAuth();
  const digitos = soDigitos(documento);
  return useQuery({
    queryKey: ['comercial', 'documento-ja-cadastrado', tenantId, digitos],
    enabled: !!tenantId && (digitos.length === 11 || digitos.length === 14),
    queryFn: async () =>
      (unwrap(await supabase.rpc('com_documento_ja_cadastrado', { p_documento: digitos })) as unknown as
        { codigo: string; razao_social: string; carteira: string | null }[])[0] ?? null,
  });
}

export function usePedirCadastro() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: PedidoInput) => {
      const dados = {
        razao_social: p.razao_social.trim(),
        documento: soDigitos(p.documento) || null,
        uf: p.uf?.trim().toUpperCase() || null,
        cidade: p.cidade?.trim() || null,
        telefone: p.telefone?.trim() || null,
        telefone_2: p.telefone_2?.trim() || null,
        email: p.email?.trim() || null,
        endereco: p.endereco?.trim() || null,
        cep: p.cep?.trim() || null,
        inscricao_estadual: p.inscricao_estadual?.trim() || null,
        condicao_fiscal: p.condicao_fiscal?.trim() || null,
        grupo: p.grupo?.trim() || null,
        prioridade: p.prioridade,
        motivo: p.motivo?.trim() || null,
        // Editar um pedido devolvido para "Ajustar" o reenvia: volta a Pendente.
        status: 'pendente' as const,
      };
      return p.id
        ? expectRows(await supabase.from('com_solicitacoes_cadastro')
            .update({ ...dados, updated_at: new Date().toISOString() }).eq('id', p.id).select('id'), 'o pedido de cadastro')
        : expectRows(await supabase.from('com_solicitacoes_cadastro')
            .insert({ ...dados, tenant_id: tenantId! }).select('id'), 'o pedido de cadastro');
    },
    onSuccess: (_r, p) => {
      invalidar(qc, tenantId);
      toast.success(p.id ? 'Pedido reenviado ao gestor.' : 'Pedido enviado ao gestor.');
    },
    onError: (e: unknown) => toast.error(mensagemDeErro(e)),
  });
}

export function useDecidirSolicitacao() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: { id: string; decisao: 'aprovado' | 'reprovado' | 'ajustar'; parecer: string }) =>
      unwrap(await supabase.rpc('com_decidir_solicitacao_cadastro', {
        p_id: i.id, p_decisao: i.decisao, p_parecer: i.parecer,
      })),
    onSuccess: (_r, i) => {
      invalidar(qc, tenantId);
      toast.success(i.decisao === 'aprovado'
        ? 'Aprovado — o chamado para cadastrar no Forteplus foi aberto.'
        : i.decisao === 'ajustar' ? 'Devolvido à vendedora para ajuste.' : 'Pedido reprovado.');
    },
    onError: (e: unknown) => toast.error(mensagemDeErro(e)),
  });
}

export function useAplicarSolicitacao() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: { id: string; codigo: string }) =>
      unwrap(await supabase.rpc('com_aplicar_solicitacao_cadastro', { p_id: i.id, p_codigo: i.codigo })) as unknown as string,
    onSuccess: (codigo) => {
      invalidar(qc, tenantId);
      qc.invalidateQueries({ queryKey: ['comercial', 'clientes'] });
      toast.success(`Cliente ${codigo} criado na carteira de quem pediu.`);
    },
    onError: (e: unknown) => toast.error(mensagemDeErro(e)),
  });
}
