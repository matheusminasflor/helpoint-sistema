// Para onde um aviso leva (o que o sino fazia; desde 2026-10-02 é o bloco "Lyra avisa" da tela
// inicial). O dono tirou o sino: "ninguém usaria — com as notificações por e-mail e o menu Home
// ficou bem melhor". O bloco passou a mostrar TODOS os avisos, e cada um abre a tela certa.
//
// Função pura, sem React: o mesmo resultado decide o clique E se o item promete que navega
// (leva F, item 8: aviso que não leva a lugar nenhum não fica com cara de link).

import { estaPausada, TELAS_EM_BREVE } from '@/config/telas-pausadas';

/** Avisos sem id de registro: o tipo de referência leva a uma tela fixa. */
const TELA_DO_TIPO: Record<string, string> = {
  ticket: '/ti/chamados',
  // Pedido de cadastro de cliente novo (LEVA O). A fila saiu da tela em 2026-10-01 (cliente novo
  // se pede por chamado); um aviso antigo que sobrar leva ao cadastro.
  com_solicitacao_cadastro: '/comercial/clientes',
  contract: '/ti/contratos',
  license: '/ti/licencas',
  card: '/kanban',
  calendar_event: '/agenda',
  // Decisão de RH sem chamado espelho, holerite e documento do cofre.
  rh_request: '/meu-rh',
  // Férias e atestado com o Meu RH ligado (20270205010000): quem decide no RH vai às Aprovações.
  rh_aprovacao: '/rh/aprovacoes',
  // Conta a pagar vencendo (check-alerts).
  fin_entry: '/financeiro/contas-a-pagar',
  // Meta definida (L6d): o painel do diretor — só para quem entra lá (ver abaixo).
  com_meta: '/diretoria',
  // Suprimento abaixo do mínimo (20270118010000): o Estoque de Compras.
  estoque: '/compras/estoque',
  // Benefício de sexta (20270129070000): liberar a retirada de quem atrasa, e a decisão.
  beneficio: '/mkt/beneficio',
};

/** Avisos com id: a tela do próprio registro. */
const TELA_DO_REGISTRO: Record<string, (id: string) => string> = {
  ticket: (id) => `/helpdesk/${id}`,
  sac_ticket: (id) => `/qualidade/sacs/${id}`,
  crm_deal: (id) => `/crm/negocios/${id}`,
  chat_channel: (id) => `/chat/${id}`,
  // Férias aprovadas: o gestor escolhe quem assume as demandas (20261127020000).
  ferias: (id) => `/ferias/${id}/repassar`,
  // Projetos por setor (20261215020000): todo aviso de projeto abre o projeto.
  project: (id) => `/projetos/${id}`,
  // Atualização do sistema (2026-10-14): o mural do Jornal.
  jornal: () => '/jornal?aba=atualizacoes',
  // Solicitação (etapa 4b): todo aviso dela abre o pedido.
  solicitacao: (id) => `/solicitacoes/${id}`,
  // Distribuidor pediu acesso ao portal (etapa 6): a lista da TI.
  distribuidor: () => '/ti/distribuidores',
};

export interface AvisoComReferencia {
  reference_type: string;
  reference_id: string | null;
}

/**
 * O endereço (sem o prefixo da empresa) que o aviso abre, ou null quando ele não leva a lugar
 * nenhum. `entraNaDiretoria`: a meta definida avisa o vendedor da carteira, e `/diretoria` o
 * mandaria de volta para o início sem explicar — para ele o aviso não navega (a mensagem já traz
 * a meta inteira).
 */
export function destinoDoAviso(aviso: AvisoComReferencia, entraNaDiretoria: boolean, emBreve: Record<string, string> = TELAS_EM_BREVE): string | null {
  if (aviso.reference_type === 'com_meta' && !entraNaDiretoria) return null;
  const doRegistro = TELA_DO_REGISTRO[aviso.reference_type];
  const destino = doRegistro && aviso.reference_id ? doRegistro(aviso.reference_id) : TELA_DO_TIPO[aviso.reference_type] ?? null;
  // Tela pausada ou "em breve" manda para o Início sem explicar (defeito 2, 2026-10-24): o aviso não navega, e a
  // mensagem já traz a decisão. Quando a tela voltar (sair de telas-pausadas), o link volta sozinho.
  if (destino && (estaPausada(destino) || Object.keys(emBreve).some((p) => destino === p || destino.startsWith(`${p}/`)))) return null;
  return destino;
}
