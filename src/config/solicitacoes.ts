// Os tipos de solicitação (proposta "Helpoint no dia a dia", etapa 4b; migration 20270201010000). O banco tem a regra
// (quem age em cada etapa); aqui moram os nomes, os campos de cada pedido e as etapas que a barra mostra.

export type TipoDeSolicitacao =
  | 'arte' | 'acesso' | 'reembolso' | 'adiantamento'
  | 'rh_dados' | 'rh_beneficio' | 'rh_documento' | 'rh_duvida' | 'rh_confidencial';

export type EtapaDaSolicitacao =
  | 'pedido' | 'aceita' | 'aprovada' | 'em_andamento' | 'paga' | 'prestando_contas'
  | 'entregue' | 'liberada' | 'concluida' | 'recusada' | 'cancelada';

export type SetorDaSolicitacao = 'marketing' | 'ti' | 'financeiro' | 'rh';

export interface ConfigDoTipo {
  rotulo: string;
  /** A frase do cartão de escolha. */
  descricao: string;
  setor: SetorDaSolicitacao;
  /** O caminho feliz, para a barra de etapas: [etapa, rótulo]. */
  etapas: [EtapaDaSolicitacao, string][];
  /** Campos além do título e dos detalhes. */
  valor?: boolean;
  precisoAte?: boolean;
  tipoDeAcesso?: boolean;
  /** Anexo pedido já no envio (o reembolso não sai sem o comprovante). */
  anexoObrigatorio?: string;
  rotuloDoTitulo: string;
  dicaDoTitulo: string;
}

export const TIPOS: Record<TipoDeSolicitacao, ConfigDoTipo> = {
  arte: {
    rotulo: 'Pedido de arte', descricao: 'Post, banner, rótulo, apresentação — o Marketing aceita e entrega o arquivo',
    setor: 'marketing', precisoAte: true,
    etapas: [['pedido', 'Pedido'], ['aceita', 'Aceita'], ['entregue', 'Entregue']],
    rotuloDoTitulo: 'O que você precisa', dicaDoTitulo: 'Ex.: banner da feira de novembro',
  },
  acesso: {
    rotulo: 'Pedido de acesso', descricao: 'Sistema, pasta, e-mail — o gestor aprova e a TI libera',
    setor: 'ti', tipoDeAcesso: true,
    etapas: [['pedido', 'Pedido'], ['aprovada', 'Gestor aprovou'], ['liberada', 'TI liberou']],
    rotuloDoTitulo: 'Acesso a quê', dicaDoTitulo: 'Ex.: pasta Comercial no servidor',
  },
  reembolso: {
    rotulo: 'Reembolso', descricao: 'Você pagou algo da empresa — com o comprovante; o gestor aprova e o Financeiro paga',
    setor: 'financeiro', valor: true, anexoObrigatorio: 'O comprovante (foto ou PDF)',
    etapas: [['pedido', 'Pedido'], ['aprovada', 'Gestor aprovou'], ['paga', 'Pago']],
    rotuloDoTitulo: 'O que você pagou', dicaDoTitulo: 'Ex.: Uber até o cliente',
  },
  adiantamento: {
    rotulo: 'Adiantamento', descricao: 'Dinheiro antes de uma despesa (viagem) — depois você presta contas e devolve a sobra',
    setor: 'financeiro', valor: true,
    etapas: [['pedido', 'Pedido'], ['aprovada', 'Gestor aprovou'], ['paga', 'Pago'], ['prestando_contas', 'Contas prestadas'], ['concluida', 'Conferido']],
    rotuloDoTitulo: 'Para quê', dicaDoTitulo: 'Ex.: viagem a BH, 3 dias',
  },
  rh_dados: {
    rotulo: 'Atualizar meus dados', descricao: 'Endereço, banco, dependente — só o que mudou e o comprovante',
    setor: 'rh', etapas: [['pedido', 'Pedido'], ['em_andamento', 'Conferindo'], ['concluida', 'Atualizado']],
    rotuloDoTitulo: 'O que mudou', dicaDoTitulo: 'Ex.: novo endereço',
  },
  rh_beneficio: {
    rotulo: 'Benefício', descricao: 'Incluir, mudar ou cancelar VT, VR, plano de saúde',
    setor: 'rh', etapas: [['pedido', 'Pedido'], ['em_andamento', 'Em análise'], ['concluida', 'Feito']],
    rotuloDoTitulo: 'Qual benefício e o que fazer', dicaDoTitulo: 'Ex.: incluir dependente no plano',
  },
  rh_documento: {
    rotulo: 'Pedir documento', descricao: 'Declaração de vínculo, informe de rendimentos, 2ª via',
    setor: 'rh', etapas: [['pedido', 'Pedido'], ['em_andamento', 'Preparando'], ['concluida', 'Pronto']],
    rotuloDoTitulo: 'Qual documento', dicaDoTitulo: 'Ex.: informe de rendimentos 2026',
  },
  rh_duvida: {
    rotulo: 'Dúvida de folha', descricao: 'Sobre o holerite ou a folha de um mês',
    setor: 'rh', etapas: [['pedido', 'Pedido'], ['em_andamento', 'Em análise'], ['concluida', 'Respondida']],
    rotuloDoTitulo: 'Qual a dúvida', dicaDoTitulo: 'Ex.: hora extra de setembro',
  },
  rh_confidencial: {
    rotulo: 'Conversa com o RH', descricao: 'Assunto confidencial: só o RH vê, nem o seu gestor',
    setor: 'rh', etapas: [['pedido', 'Recebida'], ['em_andamento', 'Em conversa'], ['concluida', 'Encerrada']],
    rotuloDoTitulo: 'Assunto', dicaDoTitulo: 'Pode ser só uma palavra',
  },
};

/** Os pedidos da porta geral (os do RH ficam no Meu RH). */
export const TIPOS_DA_PORTA: TipoDeSolicitacao[] = ['arte', 'acesso', 'reembolso', 'adiantamento'];

export const ROTULO_DA_ETAPA: Record<EtapaDaSolicitacao, string> = {
  pedido: 'Pedido', aceita: 'Aceita', aprovada: 'Aprovada', em_andamento: 'Em andamento', paga: 'Paga',
  prestando_contas: 'Contas prestadas', entregue: 'Entregue', liberada: 'Liberada', concluida: 'Concluída',
  recusada: 'Recusada', cancelada: 'Cancelada',
};

export const TIPOS_DE_ACESSO = [
  { valor: 'sistema', rotulo: 'Sistema' }, { valor: 'pasta', rotulo: 'Pasta' }, { valor: 'email', rotulo: 'E-mail' },
  { valor: 'equipamento', rotulo: 'Equipamento' }, { valor: 'outro', rotulo: 'Outro' },
];

export const ROTULO_DO_SETOR_DA_SOLICITACAO: Record<SetorDaSolicitacao, string> = {
  marketing: 'Pedidos de arte', ti: 'Pedidos de acesso', financeiro: 'Reembolsos e adiantamentos', rh: 'Solicitações ao RH',
};

/**
 * De quem é a vez (Zeigarnik: cada pedido diz em que etapa está e com quem). Puro, para o teste.
 */
export function deQuemEAVez(tipo: TipoDeSolicitacao, etapa: EtapaDaSolicitacao): string | null {
  const setor = TIPOS[tipo].setor;
  const nomeDoSetor = { marketing: 'o Marketing', ti: 'a TI', financeiro: 'o Financeiro', rh: 'o RH' }[setor];
  if (etapa === 'pedido') return tipo === 'acesso' || tipo === 'reembolso' || tipo === 'adiantamento' ? 'com o gestor' : `com ${nomeDoSetor}`;
  if (etapa === 'aceita' || etapa === 'em_andamento') return `com ${nomeDoSetor}`;
  if (etapa === 'aprovada') return tipo === 'acesso' ? 'com a TI' : 'com o Financeiro, para pagar';
  if (etapa === 'paga') return tipo === 'adiantamento' ? 'com você: preste contas' : null;
  if (etapa === 'prestando_contas') return 'com o Financeiro, para conferir';
  return null;
}

/** Terminou (não tem mais vez de ninguém). */
export const ETAPAS_FINAIS: EtapaDaSolicitacao[] = ['entregue', 'liberada', 'concluida', 'recusada', 'cancelada'];
export const terminou = (tipo: TipoDeSolicitacao, etapa: EtapaDaSolicitacao) =>
  ETAPAS_FINAIS.includes(etapa) || (etapa === 'paga' && tipo === 'reembolso');

/**
 * As categorias de chamado que viraram pedido (decisão do dono, 2026-10-25: "sai da grade e leva ao pedido"). Quem
 * escolhe ou procura por elas no abrir chamado cai no pedido. Os chamados antigos dessas categorias seguem até o fim.
 * As do RH entram quando o Meu RH ligar.
 */
const VIROU_PEDIDO: Array<{ modulo: string; nome: string; tipo: TipoDeSolicitacao }> = [
  { modulo: 'marketing', nome: 'criacao de arte', tipo: 'arte' },
  { modulo: 'tickets', nome: 'acesso/permissoes', tipo: 'acesso' },
  { modulo: 'financeiro', nome: 'reembolso', tipo: 'reembolso' },
  { modulo: 'financeiro', nome: 'adiantamento', tipo: 'adiantamento' },
];
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function categoriaVirouPedido(modulo: string, nome: string): TipoDeSolicitacao | null {
  return VIROU_PEDIDO.find((v) => v.modulo === modulo && v.nome === semAcento(nome))?.tipo ?? null;
}
