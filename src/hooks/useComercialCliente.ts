import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap, expectRows } from '@/lib/supabase-result';
import { soDigitos } from '@/lib/documento';

/**
 * O cadastro de um cliente do Comercial (leva G, 2026-09-26).
 *
 * Dois lados, e cada um manda no que é dele: os cinco campos do Forteplus
 * (`codigo`, `razao_social`, `fantasia`, `tabela_preco`, `ativo`) voltam a cada
 * importação; `documento`, `telefone`, `email` e `endereco` nasceram aqui e a
 * importação não os toca — `com_importar_clientes` só sobrescreve os cinco.
 *
 * Por que o front lê `com_clientes` direto em vez de uma RPC: a policy de SELECT
 * já é "quem tem o Comercial ou a Diretoria", e o que a tela precisa é a linha
 * inteira. Uma RPC aqui seria uma camada sem regra nenhuma dentro.
 */

export interface ClienteCadastrado {
  id: string;
  codigo: string;
  razao_social: string;
  fantasia: string | null;
  tabela_preco: string | null;
  tabela_base: string | null;
  ativo: boolean;
  em_condicao: boolean | null;
  origem: string;
  documento: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
}

export interface ClienteParaSalvar {
  codigo: string;
  razao_social: string;
  fantasia?: string | null;
  tabela_preco?: string | null;
  ativo: boolean;
  documento?: string | null;
  telefone?: string | null;
  email?: string | null;
  endereco?: string | null;
}

const CAMPOS = `id, codigo, razao_social, fantasia, tabela_preco, tabela_base, ativo,
                em_condicao, origem, documento, telefone, email, endereco`;

export function useCliente(codigo: string | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'cliente', tenantId, codigo],
    enabled: !!tenantId && !!codigo,
    queryFn: async (): Promise<ClienteCadastrado | null> => {
      const data = unwrap(await supabase
        .from('com_clientes')
        .select(CAMPOS)
        .eq('codigo', codigo!)
        .maybeSingle());
      return (data as unknown as ClienteCadastrado) ?? null;
    },
  });
}

/**
 * Cria ou corrige. `codigo` é a chave do Forteplus e é ele que decide qual é:
 * existe → corrige; não existe → cria com `origem = 'cadastro'`.
 *
 * `onConflict` NÃO é usado de propósito: upsert silencioso transformaria "criei
 * um cliente" em "sobrescrevi um cliente que eu não sabia que existia". Quem
 * chama diz o que quer, e o erro de código repetido volta como frase.
 */
export function useSalvarCliente() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ cliente, criando }: { cliente: ClienteParaSalvar; criando: boolean }) => {
      const documento = soDigitos(cliente.documento) || null;
      const comum = {
        razao_social: cliente.razao_social.trim(),
        fantasia: cliente.fantasia?.trim() || null,
        tabela_preco: cliente.tabela_preco?.trim() || null,
        ativo: cliente.ativo,
        documento,
        telefone: cliente.telefone?.trim() || null,
        email: cliente.email?.trim() || null,
        endereco: cliente.endereco?.trim() || null,
      };

      if (criando) {
        expectRows(
          await supabase
            .from('com_clientes')
            .insert({
              tenant_id: tenantId,
              codigo: cliente.codigo.trim(),
              origem: 'cadastro',
              ...comum,
            } as never)
            .select('id'),
          'o cadastro do cliente',
        );
      } else {
        expectRows(
          await supabase
            .from('com_clientes')
            .update(comum as never)
            .eq('codigo', cliente.codigo.trim())
            .select('id'),
          'a alteração do cliente',
        );
      }
      return cliente.codigo.trim();
    },
    onSuccess: (codigo, { criando }) => {
      qc.invalidateQueries({ queryKey: ['comercial', 'cliente'] });
      qc.invalidateQueries({ queryKey: ['comercial', 'clientes'] });
      qc.invalidateQueries({ queryKey: ['comercial', 'busca-clientes'] });
      toast.success(criando ? `Cliente ${codigo} cadastrado` : 'Cadastro atualizado');
    },
    onError: (e: Error) => {
      // As duas recusas do banco que a pessoa pode causar digitando, traduzidas.
      // Sem isto ela lê "duplicate key value violates unique constraint
      // com_clientes_documento_unico", que não diz o que fazer.
      const msg = e.message ?? '';
      if (/com_clientes_documento_unico/i.test(msg)) {
        toast.error('Já existe um cliente com esse CNPJ/CPF nesta empresa.');
      } else if (/com_clientes_documento_so_digitos/i.test(msg)) {
        toast.error('CNPJ precisa de 14 dígitos e CPF de 11.');
      } else if (/com_clientes_tenant_codigo|duplicate key/i.test(msg)) {
        toast.error('Já existe um cliente com esse código.');
      } else {
        toast.error(`Erro ao salvar: ${msg}`);
      }
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Quem vendeu para este cliente
// ═══════════════════════════════════════════════════════════════════════════

export interface VendedorDoCliente {
  vendedor_codigo: string;
  vendedor_nome: string;
  valor: number;
  notas: number;
  ultima_venda: string | null;
}

/**
 * De onde sai "de quem é este cliente" sem campo novo: de quem vendeu
 * (decisão do dono — carteira é do atendente, não do cliente).
 *
 * RESSALVA MEDIDA (2026-09-26), e é por isso que a tela não chama isto de
 * "quem atende": o `vendedor` do Forteplus nem sempre é gente. O código 1638
 * é "FINANCEIRO APROVADO" e responde por R$ 5.017.738 de 168 clientes; 1637 é
 * "FINANCEIRO CONFERENCIA". Juntos, 56% do faturamento do histórico. Enquanto
 * isso não for decidido com o dono, o rótulo diz o que o dado é — vendedor da
 * nota — e não o que a gente queria que ele fosse.
 */
export function useVendedoresDoCliente(codigo: string | null, de: string, ate: string, filial: string | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'vendedores-do-cliente', tenantId, codigo, de, ate, filial],
    enabled: !!tenantId && !!codigo,
    queryFn: async (): Promise<VendedorDoCliente[]> => {
      const data = unwrap(await supabase.rpc('com_quem_atende_cliente', {
        p_codigo: codigo!, p_de: de, p_ate: ate, p_filial: filial,
      }));
      return (data || []) as unknown as VendedorDoCliente[];
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Os chamados do SAC deste cliente
// ═══════════════════════════════════════════════════════════════════════════

export interface SacDoCliente {
  id: string;
  ticket_number: number | null;
  subject: string | null;
  status: string;
  created_at: string;
}

/**
 * Casa pelo DOCUMENTO, só dígitos dos dois lados. Sem documento no cadastro não
 * há o que casar — e a tela tem de dizer "CNPJ não informado", e não "nenhum
 * chamado": as duas frases são verdade em situações diferentes, e confundi-las
 * é o padrão "lista vazia por RLS é indistinguível de lista vazia por não
 * existir" que a L8 registrou.
 *
 * Lê pela RPC `com_sacs_do_cliente`, e não pela tabela. Por quê: `sac_tickets`
 * foi fechado por módulo em 2026-09-26 (pedido do dono, migration
 * `20261106010000`) — quem tem só o Comercial não lê mais a tabela, e este bloco
 * mostraria "nenhum chamado" com o chamado existindo, que é a mentira exata que
 * ele foi escrito para evitar.
 *
 * A RPC é `security definer` e devolve **só o resumo**: número, assunto, status e
 * data. Não devolve comentário, anexo nem laudo — para isso a pessoa precisa do
 * módulo Qualidade. É mais estreito do que o acesso à tabela que este bloco
 * tinha, e a normalização do documento (dígitos dos dois lados) passou a morar no
 * banco, onde ela não pode divergir da comparação.
 */
export function useSacsDoCliente(documento: string | null) {
  const { tenantId } = useAuth();
  const digitos = soDigitos(documento);
  return useQuery({
    queryKey: ['comercial', 'sacs-do-cliente', tenantId, digitos],
    enabled: !!tenantId && digitos.length > 0,
    queryFn: async (): Promise<SacDoCliente[]> => {
      const data = unwrap(await supabase.rpc('com_sacs_do_cliente', { p_documento: digitos }));
      return (data || []) as unknown as SacDoCliente[];
    },
  });
}
