// Carteiras e metas do Comercial/Diretor. Ver
// docs/metas-e-carteiras-fonte-da-verdade.md (manda sobre tudo aqui) e
// .scratch/plano-frente2-metas-e-carteiras.md.
//
// Duas fontes, complementares, nunca fundidas: `metas_carteira`/`metas_ano`
// são o que o diretor JÁ MEDIU, importado do HISTORICO_METAS.json — leitura
// direta pela tabela, nunca RPC que soma venda (o erro que esta leva
// desfez). `com_metas`/`com_carteira_membros` são o que ele DEFINE daqui
// pra frente na grade do sistema (meta por carteira ou total), e disparam
// o aviso pelo sino.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { unwrap, expectRows } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import { mensagemDeErro } from '@/hooks/useComercialImport';
import type { Json } from '@/integrations/supabase/types';
import type {
  CarteiraMembro, Conciliacao, MetaAno, MetaCarteira, MetaComercial, PessoaElegivelCarteira,
} from '@/types/comercial';

/**
 * As carteiras conhecidas do tenant (VIP, MG, Demais Estados, Berçário —
 * dado do dono) — união de `metas_carteira` (importado), `com_metas` (meta
 * definida) e `com_carteira_membros` (responsável atribuído), lida por
 * `com_carteiras_conhecidas()`. Nunca uma lista fixa: uma carteira nova
 * entra sozinha na próxima importação (§2 do anexo).
 *
 * Nomes de carteira, direto — sem embrulhar em `{ nome: string }` (item 6.3
 * da correção da auditoria de 2026-09-22: o objeto só existia para carregar
 * essa única propriedade).
 */
export function useCarteiras() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'carteiras', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<string[]> =>
      (unwrap(await supabase.rpc('com_carteiras_conhecidas')) as unknown as { carteira: string }[])
        .map((l) => l.carteira),
  });
}

/**
 * Os anos disponíveis para as telas de metas — união de `metas_ano`
 * (importado) e das competências com venda na BASE (`metas_anos_
 * disponiveis()`, que já reusa `com_anos_com_venda`). Nunca fixo no
 * código (item 6 do anexo — a causa do bug do ano).
 */
export function useMetasAnosDisponiveis() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'metas-anos-disponiveis', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<number[]> =>
      (unwrap(await supabase.rpc('metas_anos_disponiveis')) as unknown as { ano: number }[]).map((l) => l.ano),
  });
}

/**
 * Quem responde por cada carteira — join com `profiles` pelo mesmo padrão
 * de embed usado em `useHelpdesk`/`useCRM` (`profiles!fk(colunas)`). Sem
 * isto na tela, ninguém nunca escreve em `com_carteira_membros` e o aviso
 * do sino não tem para quem disparar.
 */
export function useCarteiraMembros() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'carteira-membros', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<CarteiraMembro[]> => {
      const linhas = unwrap(await supabase
        .from('com_carteira_membros')
        .select('id, carteira, user_id, pessoa:profiles!com_carteira_membros_user_id_fkey(full_name, email)')
        .order('created_at')) as unknown as Array<{
          id: string; carteira: string; user_id: string;
          pessoa: { full_name: string | null; email: string } | null;
        }>;
      return linhas.map((l) => ({
        id: l.id,
        carteira: l.carteira,
        user_id: l.user_id,
        nome: l.pessoa?.full_name ?? l.pessoa?.email ?? '(sem nome)',
      }));
    },
  });
}

/**
 * O universo de gente que pode ser posta numa carteira: quem tem o módulo
 * Comercial concedido, mais owner/admin — a mesma régua de
 * `has_comercial_access`, olhada do front. Passa pela RPC
 * `com_pessoas_do_comercial` (security definer com porta própria: admin,
 * `carteiras.gerir` ou Diretoria) e não por leitura direta de
 * `user_module_access` (RLS só deixa admin/owner verem a linha de outra
 * pessoa).
 */
export function usePessoasElegiveisParaCarteira() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'pessoas-elegiveis-carteira', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<PessoaElegivelCarteira[]> => {
      const linhas = unwrap(await supabase.rpc('com_pessoas_do_comercial')) as unknown as Array<{
        user_id: string; nome: string; email: string;
      }>;
      return linhas.map((l) => ({ id: l.user_id, nome: l.nome }));
    },
  });
}

/** As metas DEFINIDAS de um ano — inclui a linha total (carteira nula) e uma por carteira/mês que já foi definida. */
export function useMetasDoAno(ano: number) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'metas', tenantId, ano],
    enabled: !!tenantId,
    queryFn: async (): Promise<MetaComercial[]> =>
      unwrap(await supabase
        .from('com_metas')
        .select('id, ano, mes, carteira, valor')
        .eq('ano', ano)) as unknown as MetaComercial[],
  });
}

/**
 * O realizado por carteira, INFORMADO pelo diretor — leitura direta de
 * `metas_carteira`, nunca soma de `com_vendas_itens` (regra de ouro do
 * anexo). `null` em `realizado` é "sem dado", nunca R$ 0,00.
 */
export function useMetasCarteiraDoAno(ano: number) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'metas-carteira', tenantId, ano],
    enabled: !!tenantId,
    queryFn: async (): Promise<MetaCarteira[]> =>
      unwrap(await supabase
        .from('metas_carteira')
        .select('ano, mes, carteira, realizado')
        .eq('ano', ano)
        .order('mes')) as unknown as MetaCarteira[],
  });
}

/**
 * Total do mês e meta importada — também informados pelo diretor, lidos
 * direto de `metas_ano`. `meta_total` sai do select de propósito (item 3 da
 * correção da auditoria de 2026-09-22): é a segunda série de meta do JSON
 * do dono, ainda sem tela nenhuma que a leia — ver `MetaAno` em
 * `src/types/comercial.ts` e `docs/nao-funciona.md`.
 */
export function useMetasAnoDoAno(ano: number) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'metas-ano', tenantId, ano],
    enabled: !!tenantId,
    queryFn: async (): Promise<MetaAno[]> =>
      unwrap(await supabase
        .from('metas_ano')
        .select('ano, mes, total_realizado, meta')
        .eq('ano', ano)
        .order('mes')) as unknown as MetaAno[],
  });
}

/**
 * O quadro de conciliação (§15) — o valor informado vem de
 * `metas_ano.total_realizado` (importado, Frente 2), nunca digitado de
 * novo (Frente 5b). Sem filial: `metas_ano` é da empresa inteira, e a
 * comparação só existe nesse nível.
 */
export function useConciliacao(ano: number) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'conciliacao', tenantId, ano],
    enabled: !!tenantId,
    queryFn: async (): Promise<Conciliacao> => {
      const linhas = unwrap(await supabase.rpc('com_conciliacao', {
        p_ano: ano,
      })) as unknown as Conciliacao[];
      return linhas[0] ?? { informado: null, venda_liquida: 0, bonificacao: 0, soma: 0, diferenca: null, meses_comparados: 0 };
    },
  });
}

function invalidarCarteirasEMetas(qc: ReturnType<typeof useQueryClient>, tenantId?: string) {
  qc.invalidateQueries({ queryKey: ['comercial', 'carteiras', tenantId] });
  qc.invalidateQueries({ queryKey: ['comercial', 'metas', tenantId] });
  qc.invalidateQueries({ queryKey: ['comercial', 'metas-carteira', tenantId] });
  qc.invalidateQueries({ queryKey: ['comercial', 'metas-ano', tenantId] });
  qc.invalidateQueries({ queryKey: ['comercial', 'metas-anos-disponiveis', tenantId] });
  qc.invalidateQueries({ queryKey: ['comercial', 'carteira-membros', tenantId] });
}

/**
 * Adiciona alguém a uma carteira — a porta que a tela "Quem responde por
 * cada carteira" usa. `unique (tenant_id, user_id)` no banco garante uma
 * pessoa por carteira; aqui a violação (23505) vira mensagem em português
 * em vez do "duplicate key" cru do Postgres.
 */
export function useAdicionarMembroCarteira() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { carteira: string; userId: string }) =>
      expectRows(
        await supabase.from('com_carteira_membros').insert({
          tenant_id: tenantId!,
          carteira: input.carteira,
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

export interface SalvarMetaInput {
  id?: string;
  ano: number;
  mes: number;
  carteira: string | null;
  valor: number;
  /**
   * O simulador de metas (`SimuladorMetas.tsx`) chama esta mutação até doze
   * vezes em série — um mês por vez — e salta o toast/invalidação de CADA
   * chamada. Quem chama em lote passa `true` aqui e faz o toast e a
   * invalidação UMA vez, no fim. Sem isto, a edição de uma célula (grade de
   * metas) continua avisando normalmente — o padrão é `undefined`/`false`.
   */
  silencioso?: boolean;
}

/**
 * Cria ou edita uma meta DEFINIDA (`com_metas`). `com_metas_unica` é um
 * índice de EXPRESSÃO (`coalesce(carteira, '')`) — o `.upsert()` do
 * PostgREST só mira coluna, não expressão, então o caminho é sabendo o
 * `id` (a tela já leu a meta existente): edita; sem `id`, insere. Escrita
 * provada com `.select('id')` + `expectRows` (regra 2 das cinco).
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
          carteira: input.carteira,
          valor: input.valor,
          definida_por: user?.id ?? null,
        }).select('id'),
        'a meta',
      );
      return rows[0].id;
    },
    onSuccess: (_data, variables) => {
      invalidarCarteirasEMetas(qc, tenantId ?? undefined);
      if (!variables.silencioso) toast.success('Meta salva.');
    },
    onError: (e, variables) => {
      if (!variables.silencioso) toast.error(mensagemDeErro(e));
    },
  });
}

export interface ImportarMetasInput {
  fileName: string;
  json: unknown;
}

/**
 * Importa o HISTORICO_METAS.json — delete+insert por ano, campo a campo,
 * na RPC `com_importar_metas` (a normalização 0.0/null→ausência mora lá,
 * em SQL; a prévia da tela usa `src/lib/metas-import.ts`).
 */
export function useImportarMetas() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ImportarMetasInput) =>
      unwrap(await supabase.rpc('com_importar_metas', { p_file_name: input.fileName, p_json: input.json as unknown as Json })),
    onSuccess: () => {
      invalidarCarteirasEMetas(qc, tenantId ?? undefined);
      toast.success('Metas importadas.');
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
}

export interface ImportarMetasDoAnoInput {
  ano: number;
  metas: Array<number | null>;
}

/** Importa o METAS_<ano>.json — sobrepõe só `meta`, nunca `total_realizado`/`meta_total`. */
export function useImportarMetasDoAno() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ImportarMetasDoAnoInput) =>
      unwrap(await supabase.rpc('com_importar_metas_do_ano', { p_ano: input.ano, p_metas: input.metas })),
    onSuccess: () => {
      invalidarCarteirasEMetas(qc, tenantId ?? undefined);
      toast.success('Metas do ano importadas.');
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
}
