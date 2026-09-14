/**
 * O vocabulário do Lead Ads (CRM-4c) — a parte que é regra pura, fora do hook,
 * para poder ser provada por Vitest.
 *
 * Ele é mantido em **três** lugares: esta lista, o trigger
 * `crm_lead_ads_confere_mapeamento` (que recusa o que não conhece) e a função
 * `crm_lead_ads_aplicar` (que cumpre). Já divergiu duas vezes nesta família de
 * leva, e as duas custaram migration de correção.
 */

/** Uma pergunta do formulário. `key` é o que volta no lead, e é por ela que se mapeia. */
export interface PerguntaDaMeta {
  key: string;
  label?: string;
  type?: string;
}

/** Um formulário como a Meta o tem. Ela é a dona: aqui só se lê. */
export interface FormularioDaMeta {
  id: string;
  name?: string;
  status?: string;
  questions?: { data?: PerguntaDaMeta[] } | PerguntaDaMeta[];
}

/**
 * Para onde pode ir a resposta de uma pergunta do anúncio. É o mesmo vocabulário
 * que o trigger aceita e que a função sabe executar — se as três listas
 * divergirem, a tela deixa salvar algo que o banco recusa, ou pior: aceita e não
 * cumpre.
 */
export const DESTINOS_EMBUTIDOS = [
  { valor: 'name', rotulo: 'Nome do contato' },
  { valor: 'email', rotulo: 'E-mail' },
  { valor: 'phone', rotulo: 'Telefone / WhatsApp' },
  { valor: 'company', rotulo: 'Empresa' },
] as const;

/**
 * "Vira anotação no negócio" é a **ausência** da pergunta no mapeamento, não um
 * destino vazio: o banco recusa string vazia como destino desconhecido. A tela
 * usa esta constante como valor do seletor e a apaga antes de salvar.
 */
export const DESTINO_ANOTACAO = '__nota__';

/**
 * As que o Facebook nomeia igual em todo formulário e que o sistema já lê
 * sozinho. Não entram no mapeamento: escolher destino para elas não muda nada.
 */
export const PERGUNTAS_PADRAO = ['full_name', 'first_name', 'last_name', 'email', 'phone_number', 'phone'];

/** Só o que tem destino escolhido vai para o banco. */
export function limparMapeamento(bruto: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(bruto).filter(([, v]) => v && v !== DESTINO_ANOTACAO),
  );
}

/**
 * As perguntas de um formulário, de qualquer um dos dois formatos que a Graph
 * API usa (lista crua, ou embrulhada em `{data: [...]}` quando vem por `fields`).
 */
export function perguntasDoFormulario(f: FormularioDaMeta | undefined): PerguntaDaMeta[] {
  const q = f?.questions;
  if (!q) return [];
  return Array.isArray(q) ? q : (q.data ?? []);
}
