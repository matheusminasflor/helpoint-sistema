// "O QUE VOCÊ PRECISA?" (proposta "Helpoint no dia a dia", etapa 4 · Chamados, 2026-10-24): a pessoa escreve o pedido
// e a tela sugere o setor — e a categoria, quando o nome de uma categoria aparece no texto. A grade de setores continua
// embaixo; a sugestão só encurta o caminho. Puro, para a tela e o teste.

export type SetorDoPedido = 'ti' | 'marketing' | 'qualidade' | 'rh' | 'financeiro' | 'compras' | 'comercial'
  | 'educacional' | 'expedicao' | 'producao';

/** O módulo do chamado de cada setor (o da TI é `tickets`). */
export const MODULO_DO_SETOR: Record<SetorDoPedido, string> = {
  ti: 'tickets', marketing: 'marketing', qualidade: 'qualidade', rh: 'rh', financeiro: 'financeiro', compras: 'compras',
  comercial: 'comercial', educacional: 'educacional', expedicao: 'expedicao', producao: 'producao',
};

// ponytail: palavras escritas à mão, sem IA; o teto é o pedido escrito de um jeito que nenhuma palavra pega — aí vale a
// grade. Saída: aprender com o setor que cada pedido acabou atendido (o histórico já está em `tickets`).
const PALAVRAS: Record<SetorDoPedido, string[]> = {
  ti: ['computador', 'notebook', 'impressora', 'internet', 'rede', 'wifi', 'wi-fi', 'senha', 'email', 'e-mail', 'sistema',
    'forteplus', 'mouse', 'teclado', 'monitor', 'celular', 'acesso', 'pasta', 'login', 'programa', 'software', 'tela'],
  marketing: ['arte', 'post', 'instagram', 'evento', 'banner', 'rotulo', 'embalagem', 'catalogo', 'video', 'foto', 'flyer',
    'campanha', 'redes sociais'],
  qualidade: ['sac', 'lote', 'laudo', 'reclamacao', 'nao conformidade', 'anvisa', 'defeito no produto', 'vazando', 'vencido'],
  rh: ['ferias', 'atestado', 'holerite', 'folha', 'ponto', 'banco de horas', 'beneficio', 'vale', 'admissao', 'demissao',
    'contracheque', 'salario'],
  financeiro: ['reembolso', 'pagamento', 'boleto', 'nota fiscal', 'adiantamento', 'pagar', 'cobranca', 'desconto'],
  compras: ['comprar', 'compra', 'orcamento', 'fornecedor', 'material', 'cotacao'],
  comercial: ['pedido', 'cliente', 'devolucao', 'troca', 'tabela de preco', 'representante', 'vendedora'],
  educacional: ['treinamento', 'curso', 'certificado', 'workshop', 'aula'],
  expedicao: ['envio', 'entrega', 'rastreio', 'frete', 'transportadora', 'correios', 'avaria', 'amostra'],
  producao: ['producao', 'materia-prima', 'materia prima', 'envase', 'maquina', 'ordem de producao', 'pcp'],
};

const limpa = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export interface CategoriaDoPedido { id: string; nome: string; modulo: string }
export interface Sugestao { setor: SetorDoPedido; categoria: CategoriaDoPedido | null; peso: number }

const SETOR_DO_MODULO = Object.fromEntries(Object.entries(MODULO_DO_SETOR).map(([s, m]) => [m, s])) as Record<string, SetorDoPedido>;

/** Até três setores, o mais provável primeiro. Nome de categoria no texto pesa mais que palavra solta. */
export function sugerirSetores(texto: string, categorias: CategoriaDoPedido[] = []): Sugestao[] {
  const t = ` ${limpa(texto)} `;
  if (t.trim().length < 3) return [];
  const porSetor = new Map<SetorDoPedido, Sugestao>();
  const soma = (setor: SetorDoPedido, peso: number, categoria: CategoriaDoPedido | null) => {
    const atual = porSetor.get(setor) ?? { setor, categoria: null, peso: 0 };
    atual.peso += peso;
    if (categoria && !atual.categoria) atual.categoria = categoria;
    porSetor.set(setor, atual);
  };
  for (const [setor, palavras] of Object.entries(PALAVRAS) as [SetorDoPedido, string[]][]) {
    for (const p of palavras) if (t.includes(` ${p}`)) soma(setor, 1, null);
  }
  for (const c of categorias) {
    const nome = limpa(c.nome).trim();
    const setor = SETOR_DO_MODULO[c.modulo];
    if (setor && nome.length >= 3 && nome !== 'outros' && t.includes(` ${nome}`)) soma(setor, 3, c);
  }
  return [...porSetor.values()].sort((a, b) => b.peso - a.peso).slice(0, 3);
}
