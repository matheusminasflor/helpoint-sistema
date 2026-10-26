// Portal do Distribuidor, parte 2 (etapa 6; migration 20270204020000): salões, contatos, visitas, vendas, estoque e
// Meu dia. O dono vê tudo do distribuidor; o vendedor, os salões dele (a policy). A venda e o ajuste do estoque são
// funções (`dist_registrar_venda`, `dist_ajustar_estoque`); o resto escreve direto, com `.select('id')`.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { expectRows, unwrap } from '@/lib/supabase-result';
import { rpc, useAcaoDoPortal, useEquipeDoDistribuidor } from '@/hooks/useDistribuidor';
import { useNoPortal } from '@/hooks/useNoPortal';
import type { VendaComPrecos } from '@/lib/preco-sugerido';

export type EtapaDoSalao = 'novo' | 'contato' | 'visita' | 'testando' | 'cliente' | 'perdido';
export const ETAPAS_DO_SALAO: { etapa: EtapaDoSalao; rotulo: string }[] = [
  { etapa: 'novo', rotulo: 'Novo' }, { etapa: 'contato', rotulo: 'Contato' }, { etapa: 'visita', rotulo: 'Visita' },
  { etapa: 'testando', rotulo: 'Testando' }, { etapa: 'cliente', rotulo: 'Cliente' }, { etapa: 'perdido', rotulo: 'Perdido' },
];
export const rotuloDaEtapa = (e: EtapaDoSalao) => ETAPAS_DO_SALAO.find((x) => x.etapa === e)?.rotulo ?? e;

export interface Salao {
  id: string; distribuidor_id: string; nome: string; cidade: string | null; uf: string | null; endereco: string | null;
  etapa: EtapaDoSalao; etapa_desde: string; responsavel_id: string; observacao: string | null; created_at: string;
}
export interface ContatoDoSalao { id: string; salao_id: string; nome: string | null; telefone: string | null }
export interface Visita {
  id: string; salao_id: string; quando: string; responsavel_id: string; feita_em: string | null; resultado: string | null;
  salao?: { nome: string; cidade: string | null } | null;
}
export interface VendaAoSalao {
  id: string; salao_id: string; data: string; total: number; vendedor_id: string;
  itens: { produto_codigo: string; produto_nome: string; quantidade: number; valor_unitario: number }[];
}
export interface LinhaDoEstoque {
  produto_codigo: string; produto_nome: string; entrou: number; vendeu: number; ajustou: number; saldo: number;
  ultima_entrada: string | null; vendeu_60_dias: number;
}
export interface MeuDia {
  visitas: { id: string; salao_id: string; salao: string; cidade: string | null; quando: string }[];
  recompras: { salao_id: string; salao: string; cidade: string | null; ultima: string; ciclo: number; atraso: number }[];
  testando: { salao_id: string; salao: string; cidade: string | null; dias: number }[];
  acabando: { produto_codigo: string; produto: string; saldo: number; vendeu_60_dias: number }[];
}

const chave = (...k: unknown[]) => ['distribuidor', 'portal', ...k];
const tab = (t: string) => supabase.from(t as never);

export function useMeuDia() {
  const { user } = useAuth();
  return useQuery({ queryKey: chave('meu-dia', user?.id), enabled: !!user?.id, queryFn: () => rpc<MeuDia>('dist_meu_dia', {}) });
}

export function useSaloes() {
  const { user } = useAuth();
  return useQuery({
    queryKey: chave('saloes', user?.id), enabled: !!user?.id,
    queryFn: async () => unwrap(await tab('dist_saloes').select('*').order('nome')) as unknown as Salao[],
  });
}

export function useSalao(id: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: chave('salao', user?.id, id), enabled: !!user?.id && !!id,
    queryFn: async () => {
      const porSalao = (t: string, colunas: string) => tab(t).select(colunas).eq('salao_id' as never, id as never);
      const salao = unwrap(await tab('dist_saloes').select('*').eq('id' as never, id as never).maybeSingle()) as unknown as Salao | null;
      const contatos = unwrap(await porSalao('dist_saloes_contatos', 'id, salao_id, nome, telefone').order('created_at')) as unknown as ContatoDoSalao[];
      const visitas = unwrap(await porSalao('dist_visitas', 'id, salao_id, quando, responsavel_id, feita_em, resultado')
        .order('quando', { ascending: false })) as unknown as Visita[];
      const vendas = unwrap(await porSalao('dist_vendas',
        'id, salao_id, data, total, vendedor_id, itens:dist_vendas_itens(produto_codigo, produto_nome, quantidade, valor_unitario)')
        .order('data', { ascending: false })) as unknown as VendaAoSalao[];
      return { salao, contatos, visitas, vendas };
    },
  });
}

export interface NovoSalao {
  distribuidor_id: string; nome: string; cidade: string; uf: string; endereco: string; etapa: EtapaDoSalao;
  contato_nome: string; contato_telefone: string;
  /** Quem atende o salão (R5): o responsável escolhe; sem escolha, quem cadastrou (o padrão do banco). */
  responsavel_id?: string;
}

/** As pessoas da equipe que já entraram, para o responsável distribuir os salões (R5). O vendedor recebe lista vazia. */
export function usePessoasDaEquipe() {
  const { distribuidor, papel } = useNoPortal();
  const equipe = useEquipeDoDistribuidor(papel === 'dono' ? distribuidor.id : undefined);
  return (equipe.data ?? []).filter((m) => m.user_id);
}

export const useCriarSalao = () => useAcaoDoPortal(async (n: NovoSalao) => {
  const [s] = expectRows(await tab('dist_saloes').insert({
    distribuidor_id: n.distribuidor_id, nome: n.nome.trim(), cidade: n.cidade.trim() || null,
    uf: n.uf.trim().toUpperCase() || null, endereco: n.endereco.trim() || null, etapa: n.etapa,
    ...(n.responsavel_id ? { responsavel_id: n.responsavel_id } : {}),
  } as never).select('id') as never, 'o salão') as unknown as { id: string }[];
  if (n.contato_nome.trim() || n.contato_telefone.trim()) {
    expectRows(await tab('dist_saloes_contatos').insert({
      salao_id: s.id, distribuidor_id: n.distribuidor_id, nome: n.contato_nome.trim() || null,
      telefone: n.contato_telefone.trim() || null,
    } as never).select('id') as never, 'o contato');
  }
  return s;
}, 'Salão cadastrado.', 'Não cadastrou o salão');

export const useMudarSalao = () => useAcaoDoPortal(
  async ({ id, ...campos }: Partial<Omit<Salao, 'id'>> & { id: string }) =>
    expectRows(await tab('dist_saloes').update(campos as never).eq('id' as never, id as never).select('id') as never, 'o salão'),
  'Salão atualizado.', 'Não gravou o salão');

// Só o responsável apaga (policy), e salão com venda o banco recusa: vira "Perdido" (R5, decisão do dono).
export const useApagarSalao = () => useAcaoDoPortal(
  async (id: string) => expectRows(await tab('dist_saloes').delete().eq('id' as never, id as never).select('id') as never, 'o salão'),
  'Salão apagado.', 'Não apagou o salão');

export const useSalvarContato = () => useAcaoDoPortal(
  async (c: { id?: string; salao_id: string; distribuidor_id: string; nome: string; telefone: string }) => {
    const campos = { nome: c.nome.trim() || null, telefone: c.telefone.trim() || null };
    const escrita = c.id
      ? tab('dist_saloes_contatos').update(campos as never).eq('id' as never, c.id as never)
      : tab('dist_saloes_contatos').insert({ ...campos, salao_id: c.salao_id, distribuidor_id: c.distribuidor_id } as never);
    return expectRows(await escrita.select('id') as never, 'o contato');
  }, 'Contato salvo.', 'Não salvou o contato');

export function useAgenda() {
  const { user } = useAuth();
  return useQuery({
    queryKey: chave('agenda', user?.id), enabled: !!user?.id,
    queryFn: async () => unwrap(await tab('dist_visitas')
      .select('id, salao_id, quando, responsavel_id, feita_em, resultado, salao:dist_saloes(nome, cidade)')
      .is('feita_em' as never, null).order('quando')) as unknown as Visita[],
  });
}

export const useAgendarVisita = () => useAcaoDoPortal(
  async (v: { distribuidor_id: string; salao_id: string; quando: string }) =>
    expectRows(await tab('dist_visitas').insert(v as never).select('id') as never, 'a visita'),
  'Visita agendada.', 'Não agendou');

export const useConcluirVisita = () => useAcaoDoPortal(
  async ({ id, resultado }: { id: string; resultado: string }) =>
    expectRows(await tab('dist_visitas').update({ feita_em: new Date().toISOString(), resultado: resultado.trim() || null } as never)
      .eq('id' as never, id as never).select('id') as never, 'a visita'),
  'Visita registrada.', 'Não registrou a visita');

export const useRemarcarVisita = () => useAcaoDoPortal(
  async ({ id, quando }: { id: string; quando: string }) =>
    expectRows(await tab('dist_visitas').update({ quando } as never).eq('id' as never, id as never).select('id') as never, 'a visita'),
  'Visita remarcada.', 'Não remarcou');

export const useCancelarVisita = () => useAcaoDoPortal(
  async (id: string) => expectRows(await tab('dist_visitas').delete().eq('id' as never, id as never).select('id') as never, 'a visita'),
  'Visita cancelada.', 'Não cancelou');

// "Fiz a visita" na ficha do salão: sem visita marcada, registra uma já feita agora.
export const useRegistrarVisitaFeita = () => useAcaoDoPortal(
  async (v: { distribuidor_id: string; salao_id: string; resultado: string }) => {
    const agora = new Date().toISOString();
    return expectRows(await tab('dist_visitas').insert({ distribuidor_id: v.distribuidor_id, salao_id: v.salao_id, quando: agora,
      feita_em: agora, resultado: v.resultado.trim() || null } as never).select('id') as never, 'a visita');
  }, 'Visita registrada.', 'Não registrou a visita');

export function useProdutosDoPortal() {
  const { user } = useAuth();
  return useQuery({
    queryKey: chave('produtos', user?.id), enabled: !!user?.id, staleTime: 10 * 60 * 1000,
    queryFn: () => rpc<{ codigo: string; nome: string }[]>('dist_produtos', {}),
  });
}

export interface ItemDaVenda { produto_codigo: string; quantidade: number; valor_unitario: number }

export const useRegistrarVenda = () => useAcaoDoPortal(
  (v: { salao_id: string; data: string; itens: ItemDaVenda[]; observacao: string }) => rpc<string>('dist_registrar_venda', {
    p_salao: v.salao_id, p_data: v.data, p_itens: v.itens, p_observacao: v.observacao }),
  'Venda registrada.', 'Não registrou a venda');

export const useCorrigirVenda = () => useAcaoDoPortal(
  (v: { venda_id: string; data: string; itens: ItemDaVenda[]; observacao: string }) => rpc('dist_corrigir_venda', {
    p_venda: v.venda_id, p_data: v.data, p_itens: v.itens, p_observacao: v.observacao }),
  'Venda corrigida.', 'Não corrigiu a venda');

// Quem vendeu, ou o responsável (policy). O estoque volta sozinho: é calculado.
export const useApagarVenda = () => useAcaoDoPortal(
  async (id: string) => expectRows(await tab('dist_vendas').delete().eq('id' as never, id as never).select('id') as never, 'a venda'),
  'Venda apagada.', 'Não apagou a venda');

export interface VendaParaCorrigir extends VendaComPrecos {
  id: string; observacao: string | null; vendedor_id: string;
  itens: { produto_codigo: string; produto_nome: string; quantidade: number; valor_unitario: number }[];
}

// As vendas que ele vê, com os preços: delas sai o preço sugerido (`precoSugerido`) e a venda que se corrige.
// ponytail: as 300 mais recentes bastam para o "último preço"; se um distribuidor passar disso por produto raro,
// a saída é uma função no banco com `distinct on (salao, produto)`.
export function useVendasComPrecos() {
  const { user } = useAuth();
  return useQuery({
    queryKey: chave('vendas-com-precos', user?.id), enabled: !!user?.id,
    queryFn: async () => unwrap(await tab('dist_vendas')
      .select('id, salao_id, data, created_at, observacao, vendedor_id, itens:dist_vendas_itens(produto_codigo, produto_nome, quantidade, valor_unitario)')
      .order('data', { ascending: false }).order('created_at', { ascending: false }).limit(300)) as unknown as VendaParaCorrigir[],
  });
}

export function useEstoqueDoPortal(distribuidorId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: chave('estoque', user?.id, distribuidorId ?? 'meu'), enabled: !!user?.id,
    queryFn: () => rpc<LinhaDoEstoque[]>('dist_estoque', { p_distribuidor: distribuidorId ?? null }),
  });
}

export const useAjustarEstoque = () => useAcaoDoPortal(
  ({ produto, tenho }: { produto: string; tenho: number }) => rpc('dist_ajustar_estoque', { p_produto_codigo: produto, p_tenho: tenho }),
  'Estoque ajustado.', 'Não ajustou');

export const useImportarEstoque = () => useAcaoDoPortal(
  (linhas: { produto_codigo: string; tenho: number }[]) => rpc<number>('dist_importar_estoque', { p_linhas: linhas }),
  'Estoque atualizado pela planilha.', 'Não importou a planilha');

// Para os primeiros passos: ele já informou o estoque alguma vez?
export function useJaInformouEstoque() {
  const { user } = useAuth();
  return useQuery({
    queryKey: chave('ja-informou-estoque', user?.id), enabled: !!user?.id,
    queryFn: async () => {
      const { count, error } = await tab('dist_estoque_ajustes').select('id', { count: 'exact', head: true });
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });
}
