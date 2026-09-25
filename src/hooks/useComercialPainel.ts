// Leitura do Painel Comercial (L6a). Um hook por função SQL — a conta mora
// no banco (§4.7): nenhuma tela lê `com_vendas_itens` direto, o PostgREST
// corta em 1000 linhas em silêncio, e aqui são dezenas de milhares por ano.
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import { buscarComTeto, type ConsultaComLimite } from '@/lib/listas';
import { calcularPeriodoComercial, type PeriodoComercial } from '@/lib/period';
import { useAuth } from '@/contexts/AuthContext';
import type {
  BonificacaoCliente, CfopForaDaCurva, ClienteATrabalhar, ComercialImportacao, CriterioCurva, DetalheProduto,
  EvolucaoPorFaixaCliente, FaixaContagem, FaturamentoMensal, FaturamentoPorCliente, Filial, HistoricoImportacao,
  MatrizProdutoLinha, PainelTotais, PedidoEmCondicao, PeriodoImportado, ProdutoNaCurva, RankingCliente,
  ResumoClientes, Serie, TendenciaProduto,
} from '@/types/comercial';

/**
 * O ano mês a mês — o bloco principal do painel. `p_serie` é eixo próprio
 * (§3.8): nunca se mistura com a classe de CFOP.
 *
 * A RPC aceita `p_de`/`p_ate` (ficaram por simetria com `com_painel_totais`
 * — mesma assinatura, mesma função SQL de apoio), mas nenhuma tela chama
 * este hook com período: o gráfico é o ano inteiro, com o período do
 * seletor apenas destacado nele (§11 do documento do dono), nunca filtrado.
 * Se um dia precisar filtrar o gráfico por período, é aqui que os dois
 * parâmetros — e a `queryKey` deles — voltam a entrar.
 */
export function useFaturamentoMensal(ano: number, filial: Filial | null, serie: Serie | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'faturamento', tenantId, ano, filial, serie],
    enabled: !!tenantId,
    queryFn: async (): Promise<FaturamentoMensal[]> =>
      unwrap(await supabase.rpc('com_faturamento_mensal', {
        p_ano: ano, p_filial: filial, p_serie: serie,
      })) as unknown as FaturamentoMensal[],
  });
}

/**
 * Os quatro KPIs do topo, numa linha só (achado 1 da auditoria): nenhuma
 * tela deve somar `clientes_ativos`/`skus_vendidos` de `FaturamentoMensal` —
 * `count(distinct …)` não se soma entre grupos de mês/filial/série. A RPC
 * devolve no máximo uma linha; o vazio (nenhuma venda no ano) vira zeros.
 *
 * `de`/`ate` opcionais e, aqui sim, passados pela tela — ao contrário de
 * `useFaturamentoMensal` acima, cujo gráfico é sempre o ano inteiro. Este é
 * o topo da página fundida (Vendas + Curva ABC) e tem de responder ao mesmo
 * período que a curva no meio, ou metade da página fica surda ao seletor.
 */
export function usePainelTotais(ano: number, filial: Filial | null, serie: Serie | null, de?: string, ate?: string) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'painel-totais', tenantId, ano, filial, serie, de, ate],
    enabled: !!tenantId,
    queryFn: async (): Promise<PainelTotais> => {
      const linhas = unwrap(await supabase.rpc('com_painel_totais', {
        p_ano: ano, p_filial: filial, p_serie: serie, p_de: de ?? null, p_ate: ate ?? null,
      })) as unknown as PainelTotais[];
      return linhas[0] ?? {
        venda: 0, devolucao: 0, liquido: 0, bonificacao: 0, unidades: 0, clientes_ativos: 0, skus_vendidos: 0,
      };
    },
  });
}

/**
 * Os anos com venda importada, do mais recente ao mais antigo (pedido do
 * dono, 2026-09-21): o seletor de ano do painel não pode ser uma janela
 * fixa — no go-live a importação vai de 2022 até hoje, e uma janela fixa
 * deixaria 2022/2023 gravados e inalcançáveis na tela.
 */
export function useAnosComVenda() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'anos-com-venda', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<number[]> => {
      const linhas = unwrap(await supabase.rpc('com_anos_com_venda')) as unknown as { ano: number }[];
      return linhas.map((l) => l.ano);
    },
  });
}

/**
 * O par ano + lista de anos com venda, com o `useEffect` de reajuste quando
 * o ano escolhido sai da lista — a mesma cópia existia em CINCO telas do
 * Insights do Comercial (achado 7 da auditoria da L6c): Painel, Curva ABC,
 * Clientes, Bonificação e Cashback. Extraído para a próxima mudança de
 * regra de ano não errar numa cópia esquecida. Ver `useAnosComVenda` acima
 * (a RPC) e `<FiltrosComerciais>` (os `<Select>` de ano/filial).
 */
export function useAnoComVenda() {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const { data: anosComVenda } = useAnosComVenda();
  const anos = anosComVenda && anosComVenda.length > 0 ? anosComVenda : [anoAtual];
  useEffect(() => {
    if (anosComVenda && anosComVenda.length > 0 && !anosComVenda.includes(ano)) {
      setAno(anosComVenda[0]);
    }
  }, [anosComVenda, ano]);
  return { ano, setAno, anos };
}

/**
 * O seletor de período do §14 ("cada mês, últimos 3, últimos 6, ano todo"),
 * correção da auditoria da L6e (achado D2). Devolve `de`/`ate` já
 * calculados — mesmo motivo de `useAnoComVenda` acima: a próxima tela que
 * precisar do seletor não deriva data por conta própria, chama este hook.
 *
 * Entra nas telas cuja RPC já aceita `p_de`/`p_ate`: Vendas (fundida com a
 * Curva ABC na Frente 3 — `com_painel_totais`/`com_faturamento_mensal`
 * passaram a aceitar os dois), Produtos e Bonificação. As que só aceitam
 * `p_ano` (Clientes, Cashback) não chamam este hook e não passam `periodo`
 * para `<FiltrosComerciais>` — o seletor simplesmente não aparece ali (ver
 * `docs/nao-funciona.md`).
 */
export function usePeriodoComercial(ano: number) {
  const [periodo, setPeriodo] = useState<PeriodoComercial>('ano');
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const { de, ate } = calcularPeriodoComercial(periodo, ano, mes);
  return { periodo, setPeriodo, mes, setMes, de, ate };
}

/** Maiores compradores do período. */
export function useRankingClientes(de: string, ate: string, filial: Filial | null, serie: Serie | null, limite = 20) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'ranking-clientes', tenantId, de, ate, filial, serie, limite],
    enabled: !!tenantId,
    queryFn: async (): Promise<RankingCliente[]> =>
      unwrap(await supabase.rpc('com_ranking_clientes', {
        p_de: de, p_ate: ate, p_filial: filial, p_serie: serie, p_limite: limite,
      })) as unknown as RankingCliente[],
  });
}

/**
 * O quadro de CFOP fora da lista (§3.2) — some da tela quando não há
 * nenhum. Passa por `buscarComTeto`: é uma lista que cresce (um CFOP novo a
 * cada exportação), e o PostgREST corta em 1000 em silêncio (§4.7).
 */
export function useCfopForaDaCurva(de: string, ate: string) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'cfop-fora-da-curva', tenantId, de, ate],
    enabled: !!tenantId,
    queryFn: async (): Promise<{ linhas: CfopForaDaCurva[]; cortou: boolean }> =>
      buscarComTeto<CfopForaDaCurva>(supabase.rpc('com_cfop_fora_da_curva', { p_de: de, p_ate: ate })),
  });
}

/**
 * Competências já reclamadas por uma filial — para a prévia avisar ANTES de
 * a pessoa confirmar (§4.2). Achado 1 (GRAVE) da auditoria de 2026-09-22: a
 * reserva em `com_vendas_competencias` continua valendo enquanto a
 * importação dona está `em_andamento`, inclusive abandonada (navegador
 * fechado no meio) — contar essa reserva aqui travava quem só tem
 * `vendas.importar` para sempre. "Já foi importada?" é pergunta do banco,
 * não do navegador: `com_competencias_importadas` só conta quem a
 * importação dona já concluiu.
 */
export function useCompetenciasImportadas(filial: Filial | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'competencias-importadas', tenantId, filial],
    enabled: !!tenantId && !!filial,
    queryFn: async (): Promise<string[]> => {
      const rows = unwrap(await supabase
        .rpc('com_competencias_importadas', { p_filial: filial! })) as unknown as { competencia: string }[];
      return rows.map((r) => r.competencia);
    },
  });
}

/**
 * "O sistema tem vendas de X a Y" (§5 do plano da Frente 1, pedido do
 * dono): a verdade sobre o que está PUBLICADO, não sobre a última
 * importação. `filial = null` (padrão) soma as duas filiais.
 */
export function usePeriodoImportado(filial: Filial | null = null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'periodo-importado', tenantId, filial],
    enabled: !!tenantId,
    queryFn: async (): Promise<PeriodoImportado> => {
      const linhas = unwrap(await supabase.rpc('com_periodo_importado', { p_filial: filial })) as unknown as PeriodoImportado[];
      return linhas[0] ?? { competencia_de: null, competencia_ate: null, competencias: 0 };
    },
  });
}

/**
 * Achado 2 da auditoria de 2026-09-22: sem filtrar `status`, uma importação
 * `em_andamento` (ou que falhou no meio) virava "última importação" no
 * rodapé — o rodapé existe para dizer de onde os números vêm, e uma
 * importação abandonada não é fonte de número nenhum. Só `concluida` entra
 * (clientes/metas nascem e morrem `concluida`, então não perdem nada aqui).
 * Traz também `competencia_de`/`competencia_ate` (achado 6.1): gravadas por
 * `com_importar_vendas_fim` desde a Frente 1, e até agora nenhuma tela lia.
 */
export function useUltimasImportacoes() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'importacoes', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<ComercialImportacao[]> =>
      unwrap(await supabase
        .from('com_vendas_importacoes')
        .select('id, tipo, filial, file_name, linhas_lidas, itens_gravados, competencia_de, competencia_ate, created_at')
        .eq('tenant_id', tenantId!)
        .eq('status', 'concluida')
        .order('created_at', { ascending: false })
        .limit(20)) as unknown as ComercialImportacao[],
  });
}

/**
 * Frente 6 (.scratch/plano-frente6-importacoes.md §1): o histórico central
 * de importações — a mesma tabela de `useUltimasImportacoes`, mas para a
 * tela de Configurações → Importações mostrar (quando, tipo, filial,
 * arquivo, período e QUEM importou), não só o rodapé do Painel Comercial.
 *
 * `imported_by` (uuid) nunca teve `references` (migration
 * 20261014010000_comercial_base_de_vendas.sql) — sem FK não há embed
 * `profiles!fk(...)` para o PostgREST resolver de uma vez (o padrão de
 * `useCarteiraMembros`). Resolve em dois passos: busca os ids únicos e
 * junta na mão.
 *
 * O nome pode faltar por dois motivos, e o traço não os distingue: a
 * importação não tem usuário (nenhuma hoje — `imported_by` tem default
 * `auth.uid()`), ou a pessoa saiu do sistema e o `profiles` foi embora
 * junto (`id references auth.users on delete cascade`). Em qualquer um dos
 * casos a linha do histórico continua valendo pelo resto — arquivo, filial,
 * período —, e é por isso que falta de nome vira "—" e nunca erro.
 *
 * O comentário anterior dizia que a RLS de `profiles` só deixa um member
 * ver o PRÓPRIO perfil. **Dizia errado**: a única policy de SELECT em
 * `profiles` é `tenant_id = get_user_tenant_id()` — a empresa inteira se
 * vê. Achado da auditoria de 2026-09-25; quem lesse o texto velho
 * desenharia em cima de uma regra que não existe.
 */
export function useHistoricoImportacoes() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'historico-importacoes', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<HistoricoImportacao[]> => {
      const linhas = unwrap(await supabase
        .from('com_vendas_importacoes')
        .select('id, tipo, filial, file_name, linhas_lidas, itens_gravados, competencia_de, competencia_ate, created_at, imported_by')
        .eq('tenant_id', tenantId!)
        .eq('status', 'concluida')
        .order('created_at', { ascending: false })
        .limit(50)) as unknown as Array<ComercialImportacao & { imported_by: string | null }>;

      const idsUnicos = [...new Set(linhas.map((l) => l.imported_by).filter((id): id is string => !!id))];
      const nomePorId = new Map<string, string>();
      if (idsUnicos.length > 0) {
        const perfis = unwrap(await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', idsUnicos)) as unknown as Array<{ id: string; full_name: string | null; email: string }>;
        for (const p of perfis) nomePorId.set(p.id, p.full_name ?? p.email);
      }

      return linhas.map(({ imported_by, ...resto }) => ({
        ...resto,
        importado_por: imported_by ? (nomePorId.get(imported_by) ?? '—') : null,
      }));
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// L6b — curva ABC, clientes a trabalhar, bonificação e pedidos em condição.
// Mesma regra do topo do arquivo: a conta mora no banco, um hook por RPC.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A curva ABC (Pareto) por produto. Passa por `buscarComTeto`: "todos os
 * produtos por faixa" é, por definição, a base inteira do período — cresce
 * com o catálogo, e o PostgREST corta em 1000 em silêncio (§4.7).
 */
export function useCurvaAbc(de: string, ate: string, filial: Filial | null, criterio: CriterioCurva) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'curva-abc', tenantId, de, ate, filial, criterio],
    enabled: !!tenantId,
    queryFn: async (): Promise<{ linhas: ProdutoNaCurva[]; cortou: boolean }> =>
      // `faixa` é `'A' | 'B' | 'C' | '-'` aqui e `string` no tipo gerado do
      // Supabase (a RPC devolve texto livre) — o cast é só para casar as
      // duas visões do mesmo dado; o banco é quem garante os quatro valores.
      buscarComTeto<ProdutoNaCurva>(supabase.rpc('com_curva_abc', {
        p_de: de, p_ate: ate, p_filial: filial, p_criterio: criterio,
      }) as unknown as ConsultaComLimite<ProdutoNaCurva>),
  });
}

/**
 * Contagem e valor por faixa (achado A3 da auditoria, correção): reusa
 * `com_curva_abc_faixas`, que agrega no banco sobre a base INTEIRA do
 * período — os cartões da tela não podem mais contar sobre `linhas`, que
 * `buscarComTeto` corta em 500. Sem `buscarComTeto`: no máximo 4 linhas
 * (A/B/C/`-`), nunca corta.
 */
export function useCurvaAbcFaixas(de: string, ate: string, filial: Filial | null, criterio: CriterioCurva) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'curva-abc-faixas', tenantId, de, ate, filial, criterio],
    enabled: !!tenantId,
    queryFn: async (): Promise<FaixaContagem[]> =>
      unwrap(await supabase.rpc('com_curva_abc_faixas', {
        p_de: de, p_ate: ate, p_filial: filial, p_criterio: criterio,
      })) as unknown as FaixaContagem[],
  });
}

/** Bonificação por cliente e o quanto ela representa do que ele comprou. */
export function useBonificacaoPorCliente(de: string, ate: string, filial: Filial | null, serie: Serie | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'bonificacao-por-cliente', tenantId, de, ate, filial, serie],
    enabled: !!tenantId,
    queryFn: async (): Promise<{ linhas: BonificacaoCliente[]; cortou: boolean }> =>
      buscarComTeto<BonificacaoCliente>(supabase.rpc('com_bonificacao_por_cliente', {
        p_de: de, p_ate: ate, p_filial: filial, p_serie: serie,
      })),
  });
}

/** Pedidos em condição: série 75 e cliente `em_condicao`, as duas coisas (§13 do INSTRUCOES v7). */
export function usePedidosEmCondicao(de: string, ate: string, filial: Filial | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'pedidos-em-condicao', tenantId, de, ate, filial],
    enabled: !!tenantId,
    queryFn: async (): Promise<{ linhas: PedidoEmCondicao[]; cortou: boolean }> =>
      buscarComTeto<PedidoEmCondicao>(supabase.rpc('com_pedidos_em_condicao', {
        p_de: de, p_ate: ate, p_filial: filial,
      })),
  });
}

/** Clientes que compraram e pararam — ver `com_clientes_a_trabalhar` no banco para a regra exata. */
export function useClientesATrabalhar(ano: number, filial: Filial | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'clientes-a-trabalhar', tenantId, ano, filial],
    enabled: !!tenantId,
    queryFn: async (): Promise<{ linhas: ClienteATrabalhar[]; cortou: boolean }> =>
      buscarComTeto<ClienteATrabalhar>(supabase.rpc('com_clientes_a_trabalhar', {
        p_ano: ano, p_filial: filial,
      })),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// L6c — a busca de cliente que alimenta a ficha (`?cliente=CODIGO` na visão
// Clientes). Ver `useFichaCliente` em `useComercialCashback.ts`.
// ═══════════════════════════════════════════════════════════════════════════

export interface ClienteBusca {
  codigo: string;
  razao_social: string;
}

/**
 * As tabelas de preço que existem de verdade em `com_clientes` — alimenta o
 * seletor da grade de cashback (§1 da leva L6c): nada de lista fixa no
 * código, as tabelas são dado do dono.
 *
 * Achado 5 da auditoria da L6c: antes disto, `select('tabela_base')` trazia
 * `com_clientes` inteira (sem teto) para o navegador só para tirar o
 * `distinct` em JS — o PostgREST corta em 1000 em silêncio, e numa empresa
 * com mais de mil clientes as tabelas somem do seletor sem aviso. A conta
 * (`distinct`) mora no banco agora, em `com_tabelas_base()`.
 */
export function useTabelasBase() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'tabelas-base', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<string[]> => {
      const rows = unwrap(await supabase.rpc('com_tabelas_base')) as unknown as { tabela_base: string }[];
      return rows.map((r) => r.tabela_base);
    },
  });
}

/**
 * Escapa um valor para dentro da sintaxe do `.or()` do PostgREST — vírgula e
 * parênteses são delimitadores dela; sem escape, um termo com "LTDA, ME"
 * quebra o filtro e devolve 400 sem mensagem na tela (achado 6.2 da
 * auditoria da L6c). Aspas duplas escapam o valor inteiro; a aspa dupla e a
 * barra invertida do próprio termo também precisam de escape, senão fecham
 * a citação antes da hora.
 */
function valorParaFiltroOr(valor: string): string {
  return `"${valor.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Nome ou código, até 10 resultados — o suficiente para um campo de busca. Vazio não consulta o banco. */
export function useBuscarClientes(termo: string) {
  const { tenantId } = useAuth();
  const termoLimpo = termo.trim();
  return useQuery({
    queryKey: ['comercial', 'buscar-clientes', tenantId, termoLimpo],
    enabled: !!tenantId && termoLimpo.length >= 2,
    queryFn: async (): Promise<ClienteBusca[]> => {
      const padrao = valorParaFiltroOr(`%${termoLimpo}%`);
      return unwrap(await supabase
        .from('com_clientes')
        .select('codigo, razao_social')
        .or(`razao_social.ilike.${padrao},codigo.ilike.${padrao}`)
        .order('razao_social')
        .limit(10)) as unknown as ClienteBusca[];
    },
  });
}

/**
 * Frente 6 (.scratch/plano-frente6-importacoes.md §1): "o que já existe" no
 * cadastro de clientes, para o cartão Clientes mostrar ANTES de abrir o
 * diálogo — total cadastrado e quantos têm `tabela_preco`. `count: 'exact',
 * head: true` é o PostgREST contando no banco sem trazer nenhuma linha para
 * o navegador (mesmo espírito de `com_tabelas_base()`: a conta mora no
 * banco, nunca em `com_clientes` inteira baixada para tirar `distinct`/
 * `length` em JS).
 */
export function useResumoClientes() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'resumo-clientes', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<ResumoClientes> => {
      const { count: total, error: erroTotal } = await supabase
        .from('com_clientes')
        .select('*', { count: 'exact', head: true });
      if (erroTotal) throw erroTotal;

      const { count: comTabela, error: erroTabela } = await supabase
        .from('com_clientes')
        .select('*', { count: 'exact', head: true })
        .not('tabela_preco', 'is', null);
      if (erroTabela) throw erroTabela;

      return { total: total ?? 0, comTabela: comTabela ?? 0 };
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// L6e — tendência produto a produto e detalhe do produto (Painel Diretor,
// §14 itens 2 e 3). A classificação, a ordem de avaliação e as duas
// ressalvas (mês único, concentração) moram no banco (`com_tendencia_
// produtos`) — esta tela nunca reclassifica nada em TypeScript.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A tendência de todos os produtos no período/filial/critério. Passa por
 * `buscarComTeto`: "todos os produtos" cresce com o catálogo, e o
 * PostgREST corta em 1000 em silêncio (§4.7), mesmo motivo de `useCurvaAbc`.
 */
export function useTendenciaProdutos(de: string, ate: string, filial: Filial | null, criterio: CriterioCurva) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'tendencia-produtos', tenantId, de, ate, filial, criterio],
    enabled: !!tenantId,
    queryFn: async (): Promise<{ linhas: TendenciaProduto[]; cortou: boolean }> =>
      buscarComTeto<TendenciaProduto>(supabase.rpc('com_tendencia_produtos', {
        p_de: de, p_ate: ate, p_filial: filial, p_criterio: criterio,
      }) as unknown as ConsultaComLimite<TendenciaProduto>),
  });
}

/** O detalhe de um produto: gráfico mensal e a lista de quem compra (§14 item 3). `null` de código não consulta. */
export function useDetalheProduto(codigo: string | null, de: string, ate: string, filial: Filial | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'detalhe-produto', tenantId, codigo, de, ate, filial],
    enabled: !!tenantId && !!codigo,
    queryFn: async (): Promise<DetalheProduto> =>
      unwrap(await supabase.rpc('com_detalhe_produto', {
        p_codigo: codigo!, p_de: de, p_ate: ate, p_filial: filial,
      })) as unknown as DetalheProduto,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Frente 3 — §14 itens 4, 5 e 6 do Painel Diretor: faturamento por cliente,
// evolução por faixa e a matriz produto × cliente (.scratch/plano-frente3-
// organizacao.md, item 3). Passam por `buscarComTeto`: "todos os clientes"/
// "todos os produtos" cresce, mesmo motivo de `useCurvaAbc`.
// ═══════════════════════════════════════════════════════════════════════════

/** Faturamento por cliente, sem filtro de faixa, com histórico mensal (§14 item 4). */
export function useFaturamentoPorCliente(de: string, ate: string, filial: Filial | null, criterio: CriterioCurva) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'faturamento-por-cliente', tenantId, de, ate, filial, criterio],
    enabled: !!tenantId,
    queryFn: async (): Promise<{ linhas: FaturamentoPorCliente[]; cortou: boolean }> =>
      buscarComTeto<FaturamentoPorCliente>(supabase.rpc('com_faturamento_por_cliente', {
        p_de: de, p_ate: ate, p_filial: filial, p_criterio: criterio,
      }) as unknown as ConsultaComLimite<FaturamentoPorCliente>),
  });
}

/** Evolução por faixa A/B/C, mês a mês, por cliente (§14 item 5). */
export function useEvolucaoPorFaixa(de: string, ate: string, filial: Filial | null, criterio: CriterioCurva) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'evolucao-por-faixa', tenantId, de, ate, filial, criterio],
    enabled: !!tenantId,
    queryFn: async (): Promise<{ linhas: EvolucaoPorFaixaCliente[]; cortou: boolean }> =>
      buscarComTeto<EvolucaoPorFaixaCliente>(supabase.rpc('com_evolucao_por_faixa', {
        p_de: de, p_ate: ate, p_filial: filial, p_criterio: criterio,
      }) as unknown as ConsultaComLimite<EvolucaoPorFaixaCliente>),
  });
}

/** A matriz produto × cliente completa (§14 item 6) — cores e corte de coluna são a Frente 4. */
export function useMatrizProdutoCliente(de: string, ate: string, filial: Filial | null, criterio: CriterioCurva) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'matriz-produto-cliente', tenantId, de, ate, filial, criterio],
    enabled: !!tenantId,
    queryFn: async (): Promise<{ linhas: MatrizProdutoLinha[]; cortou: boolean }> =>
      buscarComTeto<MatrizProdutoLinha>(supabase.rpc('com_matriz_produto_cliente', {
        p_de: de, p_ate: ate, p_filial: filial, p_criterio: criterio,
      }) as unknown as ConsultaComLimite<MatrizProdutoLinha>),
  });
}
