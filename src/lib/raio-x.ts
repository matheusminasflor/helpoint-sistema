// O Raio-X do Cliente (proposta aprovada pelo dono em 2026-11-05): as listas e as contas puras. Dor é o que o cliente
// conta; "não atendeu" é resultado do contato e fica de fora de propósito.
import { tendenciaDoCliente } from '@/lib/tendencia-do-cliente';

export const RESULTADOS_DO_CONTATO = [
  { valor: 'falou', rotulo: 'Falei com o cliente' },
  { valor: 'nao_atendeu', rotulo: 'Não atendeu' },
  { valor: 'recado', rotulo: 'Deixei recado' },
] as const;
export type ResultadoDoContato = (typeof RESULTADOS_DO_CONTATO)[number]['valor'];

export const MOTIVOS = [
  { valor: 'preco', rotulo: 'Preço' },
  { valor: 'frete', rotulo: 'Frete e logística' },
  { valor: 'estoque', rotulo: 'Estoque parado' },
  { valor: 'credito', rotulo: 'Crédito e pagamento' },
  { valor: 'concorrente', rotulo: 'Concorrente' },
  { valor: 'produto', rotulo: 'Produto ou qualidade' },
  { valor: 'atendimento', rotulo: 'Atendimento' },
  { valor: 'pouca_venda', rotulo: 'Pouca venda na região' },
  { valor: 'outros', rotulo: 'Outros' },
] as const;
export type Motivo = (typeof MOTIVOS)[number]['valor'];

export const TIPOS_DE_PROPOSTA = [
  { valor: 'campanha', rotulo: 'Campanha' },
  { valor: 'preco', rotulo: 'Condição de preço' },
  { valor: 'prazo', rotulo: 'Prazo de pagamento' },
  { valor: 'frete', rotulo: 'Condição de frete' },
  { valor: 'treinamento', rotulo: 'Treinamento' },
  { valor: 'bonificacao', rotulo: 'Bonificação ou cashback' },
  { valor: 'visita', rotulo: 'Visita ou reunião' },
  { valor: 'outros', rotulo: 'Outros' },
] as const;
export type TipoDeProposta = (typeof TIPOS_DE_PROPOSTA)[number]['valor'];

export const STATUS_DA_DOR = [
  { valor: 'aberta', rotulo: 'Aberta', classe: 'badge-danger' },
  { valor: 'em_tratamento', rotulo: 'Em tratamento', classe: 'badge-warning' },
  { valor: 'resolvida', rotulo: 'Resolvida', classe: 'badge-success' },
  { valor: 'sem_solucao', rotulo: 'Sem solução', classe: 'badge-info' },
] as const;
export type StatusDaDor = (typeof STATUS_DA_DOR)[number]['valor'];

export const RESULTADOS_DA_PROPOSTA = [
  { valor: 'aguardando', rotulo: 'Aguardando resposta', classe: 'badge-info' },
  { valor: 'funcionou', rotulo: 'Funcionou', classe: 'badge-success' },
  { valor: 'nao_funcionou', rotulo: 'Não funcionou', classe: 'badge-danger' },
] as const;
export type ResultadoDaProposta = (typeof RESULTADOS_DA_PROPOSTA)[number]['valor'];

export const SITUACOES = [
  { valor: 'crescendo', rotulo: 'Crescendo' },
  { valor: 'estavel', rotulo: 'Estável' },
  { valor: 'em_dificuldade', rotulo: 'Em dificuldade' },
  { valor: 'parado', rotulo: 'Parado' },
  { valor: 'fechou', rotulo: 'Fechou' },
] as const;
export type Situacao = (typeof SITUACOES)[number]['valor'];

export const TIPOS_DE_NEGOCIO = ['Distribuidor', 'Atacadista', 'Revenda', 'Salão ou profissional', 'Loja ou perfumaria', 'Outros'];
export const O_QUE_PESA = ['Preço', 'Prazo', 'Frete', 'Treinamento', 'Marca', 'Atendimento', 'Outros'];

const rotulo = (lista: readonly { valor: string; rotulo: string }[], v: string) => lista.find((x) => x.valor === v)?.rotulo ?? v;
export const rotuloDaSituacao = (v: string | null) => (v ? rotulo(SITUACOES, v) : null);
export const rotuloDoTipoDeProposta = (v: string) => rotulo(TIPOS_DE_PROPOSTA, v);
export const rotuloDoResultado = (v: string) => rotulo(RESULTADOS_DA_PROPOSTA, v);
export const rotuloDoStatus = (v: string) => rotulo(STATUS_DA_DOR, v);
export const rotuloDoMotivo = (d: { motivo: string; motivo_outros?: string | null }) =>
  (d.motivo === 'outros' && d.motivo_outros ? d.motivo_outros : rotulo(MOTIVOS, d.motivo));

export interface PerfilDoCliente {
  id: string; tipo_negocio: string | null; quem_decide: string | null; melhor_contato: string | null;
  o_que_pesa: string | null; situacao: Situacao | null; created_at: string; autor: string | null;
}
export interface PropostaDoCliente {
  id: string; tipo: TipoDeProposta; proposta: string; resultado: ResultadoDaProposta; created_at: string; autor: string | null;
}
export interface DorDoCliente {
  id: string; motivo: Motivo; motivo_outros: string | null; descricao: string | null; status: StatusDaDor;
  registrada_em: string; autor: string | null; propostas: PropostaDoCliente[];
}
export interface RaioXDoCliente {
  ultima_compra: string | null; valor_ultima_compra: number | null; tentativas_sem_falar: number;
  perfis: PerfilDoCliente[]; dores: DorDoCliente[];
}
export interface LinhaDoRelatorio {
  dor_id: string; cliente_codigo: string; cliente: string; carteira: string | null; motivo: Motivo; motivo_outros: string | null;
  descricao: string | null; status: StatusDaDor; registrada_em: string; autor: string | null; compravam: number;
  voltou_em: string | null; propostas: { tipo: TipoDeProposta; proposta: string; resultado: ResultadoDaProposta }[];
  perfil: Pick<PerfilDoCliente, 'tipo_negocio' | 'quem_decide' | 'melhor_contato' | 'o_que_pesa' | 'situacao'> | null;
}

/** A situação anterior à de hoje: a versão mais recente com situação diferente. Os perfis vêm do mais novo ao mais antigo. */
export function situacaoAnterior(perfis: PerfilDoCliente[]): { situacao: Situacao; ate: string } | null {
  const atual = perfis[0]?.situacao;
  const i = perfis.findIndex((p) => p.situacao && p.situacao !== atual);
  return i > 0 ? { situacao: perfis[i].situacao!, ate: perfis[i - 1].created_at } : null;
}

const CAMPOS_DO_PERFIL = ['tipo_negocio', 'quem_decide', 'melhor_contato', 'o_que_pesa', 'situacao'] as const;
/** Quantos dos campos que o vendedor preenche estão preenchidos. "Situação antes" vem sozinha do histórico. */
export const camposPreenchidos = (p: PerfilDoCliente | undefined) => CAMPOS_DO_PERFIL.filter((c) => p?.[c]).length;
export const TOTAL_DE_CAMPOS = CAMPOS_DO_PERFIL.length;

/** Parado ou em queda: as mesmas regras e a mesma conta da Carteira (120 dias; "Esfriando"). */
export function alertaDoCliente(l: { situacao: string; media_3m: number; media_12m: number }): 'parado' | 'queda' | null {
  const t = tendenciaDoCliente(l);
  return t === 'inativo' ? 'parado' : t === 'esfriando' ? 'queda' : null;
}

export interface RespostaDoLancamento {
  resultado: ResultadoDoContato | null; motivo: Motivo | null; motivoOutros: string;
  descricao: string; propostaTipo: TipoDeProposta; proposta: string;
}
export const respostaVazia = (): RespostaDoLancamento => ({
  resultado: null, motivo: null, motivoOutros: '', descricao: '', propostaTipo: 'campanha', proposta: '',
});
/** O que ainda falta para salvar. Quem não falou com o cliente só informa o resultado. */
export function faltaNaResposta(r: RespostaDoLancamento): boolean {
  if (!r.resultado) return true;
  if (r.resultado !== 'falou') return false;
  return !r.motivo || (r.motivo === 'outros' && !r.motivoOutros.trim());
}

export interface MotivoSomado { rotulo: string; clientes: number; compravam: number }
/** Por motivo, do que mais pesa em R$ ao que menos. Cada cliente soma uma vez em cada motivo, com a dor ainda em aberto. */
export function somarMotivos(linhas: LinhaDoRelatorio[]): MotivoSomado[] {
  const grupos = new Map<string, Map<string, number>>();
  for (const l of linhas) {
    if (l.status === 'resolvida' || l.status === 'sem_solucao') continue;
    const r = rotuloDoMotivo(l);
    if (!grupos.has(r)) grupos.set(r, new Map());
    grupos.get(r)!.set(l.cliente, Math.max(grupos.get(r)!.get(l.cliente) ?? 0, l.compravam));
  }
  return [...grupos].map(([nome, clientes]) => ({
    rotulo: nome, clientes: clientes.size, compravam: [...clientes.values()].reduce((s, v) => s + v, 0),
  })).sort((a, b) => b.compravam - a.compravam || b.clientes - a.clientes);
}

export interface PropostaSomada { rotulo: string; oferecidas: number; funcionaram: number; taxa: number | null }
/** A taxa só conta as propostas já respondidas: "aguardando" ainda não funcionou nem deixou de funcionar. */
export function somarPropostas(linhas: LinhaDoRelatorio[]): PropostaSomada[] {
  const grupos = new Map<string, { oferecidas: number; funcionaram: number; respondidas: number }>();
  for (const p of linhas.flatMap((l) => l.propostas)) {
    const r = rotuloDoTipoDeProposta(p.tipo);
    const g = grupos.get(r) ?? { oferecidas: 0, funcionaram: 0, respondidas: 0 };
    g.oferecidas += 1;
    if (p.resultado === 'funcionou') g.funcionaram += 1;
    if (p.resultado !== 'aguardando') g.respondidas += 1;
    grupos.set(r, g);
  }
  return [...grupos].map(([nome, g]) => ({
    rotulo: nome, oferecidas: g.oferecidas, funcionaram: g.funcionaram, taxa: g.respondidas ? g.funcionaram / g.respondidas : null,
  })).sort((a, b) => b.oferecidas - a.oferecidas);
}

export const descreverPerfil = (p: LinhaDoRelatorio['perfil']) =>
  (p ? [p.tipo_negocio, p.quem_decide, p.melhor_contato, rotuloDaSituacao(p.situacao)].filter(Boolean).join(' · ') : '');
export const descreverPropostas = (l: LinhaDoRelatorio) =>
  l.propostas.map((p) => `${p.proposta} (${rotuloDoResultado(p.resultado)})`).join('; ');
