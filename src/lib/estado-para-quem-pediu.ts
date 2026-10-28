// Como QUEM PEDIU vê o andamento (rodada 3, decisão 4, docs/proposta-rodada-3.md): três etapas — Recebido → Com o setor
// → Concluído — e "Esperando você" quando falta algo dele. A aprovação do gestor fica DENTRO de "Com o setor": quem pede
// não vê se passa pelo gestor (o dono: mostrar induz a escolher a categoria errada para fugir da aprovação). É o que o
// portal do Jira faz ao dar o mesmo nome a dois estados internos. A equipe que atende continua vendo o status interno.
import type { FamiliaDoEstado } from '@/config/ticket-status';

export interface EstadoParaQuemPediu {
  familia: FamiliaDoEstado;
  rotulo: string;
  /** 0 Recebido, 1 Com o setor, 2 Concluído — a barra de etapas. */
  etapa: 0 | 1 | 2;
}

export const ETAPAS_PARA_QUEM_PEDIU = ['Recebido', 'Com o setor', 'Concluído'] as const;

/** RH, Financeiro e Compras recebem PEDIDO; os outros setores, CHAMADO (decisão 1, revista). */
export const SETORES_DE_PEDIDO = ['rh', 'financeiro', 'compras'] as const;
export const ehPedido = (modulo: string | null | undefined) =>
  (SETORES_DE_PEDIDO as readonly string[]).includes((modulo ?? '').toLowerCase());

const COM_O_SETOR: Record<string, string> = {
  tickets: 'Com a TI', ti: 'Com a TI', marketing: 'Com o Marketing', qualidade: 'Com a Qualidade', rh: 'Com o RH',
  financeiro: 'Com o Financeiro', compras: 'Com Compras', comercial: 'Com o Comercial', educacional: 'Com o Educacional',
  expedicao: 'Com a Expedição', producao: 'Com a Produção',
};
export const comOSetor = (modulo: string | null | undefined) => COM_O_SETOR[(modulo ?? '').toLowerCase()] ?? 'Com o setor';

const PARA_O_SETOR: Record<string, string> = {
  tickets: 'à TI', marketing: 'ao Marketing', qualidade: 'à Qualidade', rh: 'ao RH', financeiro: 'ao Financeiro',
  compras: 'a Compras', comercial: 'ao Comercial', educacional: 'ao Educacional', expedicao: 'à Expedição',
  producao: 'à Produção',
};
/** "Solicitação ao RH", "Solicitação à TI"… — o título do passo de assuntos e do formulário do "Novo". Era "Pedido" ou
 * "Chamado" conforme o setor; o dono (2026-10-28): confunde — para quem pede, é tudo solicitação. */
export const tituloDaPorta = (modulo: string) => `Solicitação ${PARA_O_SETOR[modulo] ?? ''}`.trim();

const FINAIS_DO_CHAMADO = ['resolved', 'closed', 'cancelled', 'rejected'];

/** O chamado (tabela `tickets`). `atrasado`: o prazo passou e ele não terminou (quem chama já sabe calcular). */
export function estadoDoChamadoParaQuemPediu(status: string, modulo: string | null | undefined, atrasado = false): EstadoParaQuemPediu {
  if (status === 'resolved' || status === 'closed') return { familia: 'concluido', rotulo: 'Concluído', etapa: 2 };
  if (status === 'cancelled') return { familia: 'recebido', rotulo: 'Cancelado', etapa: 2 };
  if (status === 'rejected') return { familia: 'atraso', rotulo: 'Recusado', etapa: 2 };
  if (status === 'waiting_user') return { familia: 'espera', rotulo: 'Esperando você', etapa: 1 };
  if (atrasado && !FINAIS_DO_CHAMADO.includes(status)) return { familia: 'atraso', rotulo: 'Atrasado', etapa: 1 };
  if (status === 'open') return { familia: 'recebido', rotulo: 'Recebido', etapa: 0 };
  // Em andamento, agendado e "aguardando aprovação" (a compra): tudo é "com o setor" para quem pediu.
  return { familia: 'setor', rotulo: comOSetor(modulo), etapa: 1 };
}

/** O pedido (tabela `solicitacoes`): reembolso, adiantamento, compra… `setor` é a coluna gerada do pedido. */
export function estadoDoPedidoParaQuemPediu(tipo: string, etapa: string, setor: string | null | undefined): EstadoParaQuemPediu {
  if (etapa === 'recusada') return { familia: 'atraso', rotulo: 'Recusado', etapa: 2 };
  if (etapa === 'cancelada') return { familia: 'recebido', rotulo: 'Cancelado', etapa: 2 };
  // O adiantamento pago espera a prestação de contas de quem pediu.
  if (etapa === 'paga' && tipo === 'adiantamento') return { familia: 'espera', rotulo: 'Esperando você', etapa: 1 };
  if (['paga', 'entregue', 'liberada', 'concluida'].includes(etapa)) return { familia: 'concluido', rotulo: 'Concluído', etapa: 2 };
  // "pedido" (inclusive com o gestor), aceita, aprovada, em andamento, prestando contas: com o setor.
  return { familia: 'setor', rotulo: comOSetor(setor), etapa: 1 };
}
