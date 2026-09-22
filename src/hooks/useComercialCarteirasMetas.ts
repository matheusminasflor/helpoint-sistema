// Carteiras e metas do Comercial (L6d). Ver
// .scratch/plano-l6d-metas-e-carteiras.md e
// docs/instrucoes-painel-comercial.md (INSTRUCOES v7) §14/§15.
//
// A conta mora no banco (regra do CLAUDE.md): realizado por carteira,
// cobertura e peso vêm de `com_metas_x_realizado`; a conciliação, de
// `com_conciliacao`. `com_metas` e `com_carteiras` são pequenas (uma dúzia de
// linhas por tenant) — leitura direta pela tabela, sem RPC.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { unwrap, expectRows } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import { mensagemDeErro } from '@/hooks/useComercialImport';
import type {
  Carteira, CarteiraMembro, Conciliacao, MetaComercial, MetaXRealizado, Filial, PessoaElegivelCarteira,
} from '@/types/comercial';

/** As carteiras do tenant — dado do dono, pequeno, sem teto. */
export function useCarteiras() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'carteiras', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Carteira[]> =>
      unwrap(await supabase
        .from('com_carteiras')
        .select('id, nome, ativa')
        .order('nome')) as unknown as Carteira[],
  });
}

/**
 * Quem responde por cada carteira (L6d lacuna 1) — join com `profiles` pelo
 * mesmo padrão de embed usado em `useHelpdesk`/`useCRM`
 * (`profiles!fk(colunas)`). Sem isto na tela, ninguém nunca escreve em
 * `com_carteira_membros` e o aviso do sino não tem para quem disparar.
 */
export function useCarteiraMembros() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'carteira-membros', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<CarteiraMembro[]> => {
      const linhas = unwrap(await supabase
        .from('com_carteira_membros')
        .select('id, carteira_id, user_id, pessoa:profiles!com_carteira_membros_user_id_fkey(full_name, email)')
        .order('created_at')) as unknown as Array<{
          id: string; carteira_id: string; user_id: string;
          pessoa: { full_name: string | null; email: string } | null;
        }>;
      return linhas.map((l) => ({
        id: l.id,
        carteira_id: l.carteira_id,
        user_id: l.user_id,
        nome: l.pessoa?.full_name ?? l.pessoa?.email ?? '(sem nome)',
      }));
    },
  });
}

/**
 * O universo de gente que pode ser posta numa carteira: quem tem o módulo
 * Comercial concedido, mais owner/admin (§1 do plano — a mesma régua de
 * `has_comercial_access`, olhada do front). Três leituras em paralelo, cada
 * uma com `unwrap` (regra 1): silenciar aqui devolveria "não há ninguém"
 * onde na verdade é "a consulta falhou".
 */
export function usePessoasElegiveisParaCarteira() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'pessoas-elegiveis-carteira', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<PessoaElegivelCarteira[]> => {
      const [acessoRes, cargoRes, perfisRes] = await Promise.all([
        supabase.from('user_module_access').select('user_id').eq('module', 'comercial'),
        supabase.from('user_roles').select('user_id').in('role', ['owner', 'admin']),
        supabase.from('profiles').select('id, full_name, email').eq('is_active', true),
      ]);
      const comAcesso = unwrap(acessoRes);
      const comCargo = unwrap(cargoRes);
      const perfis = unwrap(perfisRes) as Array<{ id: string; full_name: string | null; email: string }>;
      const idsElegiveis = new Set([
        ...comAcesso.map((r) => r.user_id),
        ...comCargo.map((r) => r.user_id),
      ]);
      return perfis
        .filter((p) => idsElegiveis.has(p.id))
        .map((p) => ({ id: p.id, nome: p.full_name ?? p.email }))
        .sort((a, b) => a.nome.localeCompare(b.nome));
    },
  });
}

/** As metas de um ano — inclui a linha total (carteira_id nulo) e uma por carteira/mês que já foi definida. */
export function useMetasDoAno(ano: number) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'metas', tenantId, ano],
    enabled: !!tenantId,
    queryFn: async (): Promise<MetaComercial[]> =>
      unwrap(await supabase
        .from('com_metas')
        .select('id, ano, mes, carteira_id, valor')
        .eq('ano', ano)) as unknown as MetaComercial[],
  });
}

/** Por (competência, carteira) — realizado, meta, cobertura e peso, os 12 meses do ano. */
export function useMetasXRealizado(ano: number, filial: Filial | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'metas-x-realizado', tenantId, ano, filial],
    enabled: !!tenantId,
    queryFn: async (): Promise<MetaXRealizado[]> =>
      unwrap(await supabase.rpc('com_metas_x_realizado', {
        p_ano: ano, p_filial: filial,
      })) as unknown as MetaXRealizado[],
  });
}

/**
 * O quadro de conciliação (§15) — só calcula quando `apresentacao` é
 * informado (o diretor a digita; a tela nunca a deriva). `enabled` some
 * junto: sem o valor, não há por que consultar.
 */
export function useConciliacao(ano: number, filial: Filial | null, apresentacao: number | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'conciliacao', tenantId, ano, filial, apresentacao],
    enabled: !!tenantId,
    queryFn: async (): Promise<Conciliacao> => {
      const linhas = unwrap(await supabase.rpc('com_conciliacao', {
        p_ano: ano, p_filial: filial, p_apresentacao: apresentacao,
      })) as unknown as Conciliacao[];
      return linhas[0] ?? { venda_liquida: 0, bonificacao: 0, soma: 0, diferenca: null };
    },
  });
}

function invalidarCarteirasEMetas(qc: ReturnType<typeof useQueryClient>, tenantId?: string) {
  qc.invalidateQueries({ queryKey: ['comercial', 'carteiras', tenantId] });
  qc.invalidateQueries({ queryKey: ['comercial', 'metas', tenantId] });
  qc.invalidateQueries({ queryKey: ['comercial', 'metas-x-realizado', tenantId] });
  qc.invalidateQueries({ queryKey: ['comercial', 'buscar-clientes', tenantId] });
  qc.invalidateQueries({ queryKey: ['comercial', 'clientes-a-trabalhar', tenantId] });
  qc.invalidateQueries({ queryKey: ['comercial', 'carteira-membros', tenantId] });
}

/**
 * Adiciona alguém a uma carteira — a porta que a tela "Quem responde por
 * cada carteira" usa. `unique (tenant_id, user_id)` no banco garante uma
 * pessoa por carteira; aqui a violação (23505) vira mensagem em português
 * em vez do "duplicate key" cru do Postgres (§1 do plano).
 */
export function useAdicionarMembroCarteira() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { carteiraId: string; userId: string }) =>
      expectRows(
        await supabase.from('com_carteira_membros').insert({
          tenant_id: tenantId!,
          carteira_id: input.carteiraId,
          user_id: input.userId,
        }).select('id'),
        'o membro da carteira',
      ),
    onSuccess: () => {
      invalidarCarteirasEMetas(qc, tenantId ?? undefined);
      toast.success('Pessoa adicionada à carteira.');
    },
    onError: (e: unknown) => {
      const codigo = (e as { code?: string } | null)?.code;
      toast.error(
        codigo === '23505'
          ? 'Esta pessoa já responde por outra carteira — tire de lá antes de trocar.'
          : mensagemDeErro(e),
      );
    },
  });
}

/** Tira alguém de uma carteira. */
export function useRemoverMembroCarteira() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (membroId: string) =>
      expectRows(
        await supabase.from('com_carteira_membros').delete().eq('id', membroId).select('id'),
        'o membro da carteira',
      ),
    onSuccess: () => {
      invalidarCarteirasEMetas(qc, tenantId ?? undefined);
      toast.success('Pessoa removida da carteira.');
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
}

export interface AtribuirCarteiraInput {
  carteiraId: string | null;
  codigos?: string[];
  tabelaBase?: string;
}

/** Atribuição em lote (§4 da migration) — por código ou por tabela de preço, nunca derivada sozinha. */
export function useAtribuirCarteira() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AtribuirCarteiraInput): Promise<number> =>
      unwrap(await supabase.rpc('com_atribuir_carteira', {
        p_carteira_id: input.carteiraId,
        p_codigos: input.codigos ?? null,
        p_tabela_base: input.tabelaBase ?? null,
      })) as unknown as number,
    onSuccess: (quantidade) => {
      invalidarCarteirasEMetas(qc, tenantId ?? undefined);
      toast.success(`${quantidade} ${quantidade === 1 ? 'cliente' : 'clientes'} atualizado(s).`);
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
}

export interface SalvarMetaInput {
  id?: string;
  ano: number;
  mes: number;
  carteiraId: string | null;
  valor: number;
}

/**
 * Cria ou edita uma meta. `com_metas_unica` é um índice de EXPRESSÃO
 * (`coalesce(carteira_id, sentinela)`) — o `.upsert()` do PostgREST só
 * mira coluna, não expressão, então o caminho é o mesmo de `com_faixas_
 * cashback` (`useSalvarFaixaCashback`): sabendo o `id` (a tela já leu a
 * meta existente), edita; sem `id`, insere. Escrita provada com
 * `.select('id')` + `expectRows` (regra 2 das cinco).
 */
export function useSalvarMeta() {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SalvarMetaInput): Promise<string> => {
      if (input.id) {
        expectRows(
          await supabase.from('com_metas').update({ valor: input.valor }).eq('id', input.id).select('id'),
          'a meta',
        );
        return input.id;
      }
      const rows = expectRows(
        await supabase.from('com_metas').insert({
          tenant_id: tenantId!,
          ano: input.ano,
          mes: input.mes,
          carteira_id: input.carteiraId,
          valor: input.valor,
          definida_por: user?.id ?? null,
        }).select('id'),
        'a meta',
      );
      return rows[0].id;
    },
    onSuccess: () => {
      invalidarCarteirasEMetas(qc, tenantId ?? undefined);
      toast.success('Meta salva.');
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
}
