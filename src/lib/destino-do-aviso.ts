// Para onde um aviso leva (o que o sino fazia; desde 2026-10-02 é o bloco "Lyra avisa" da tela
// inicial). O dono tirou o sino: "ninguém usaria — com as notificações por e-mail e o menu Home
// ficou bem melhor". O bloco passou a mostrar TODOS os avisos, e cada um abre a tela certa.
//
// Função pura, sem React: o mesmo resultado decide o clique E se o item promete que navega
// (leva F, item 8: aviso que não leva a lugar nenhum não fica com cara de link).

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
  // Conta a pagar vencendo (check-alerts).
  fin_entry: '/financeiro/contas-a-pagar',
  // Meta definida (L6d): o painel do diretor — só para quem entra lá (ver abaixo).
  com_meta: '/diretoria',
};

/** Avisos com id: a tela do próprio registro. */
const TELA_DO_REGISTRO: Record<string, (id: string) => string> = {
  ticket: (id) => `/helpdesk/${id}`,
  sac_ticket: (id) => `/qualidade/sacs/${id}`,
  crm_deal: (id) => `/crm/negocios/${id}`,
  chat_channel: (id) => `/chat/${id}`,
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
export function destinoDoAviso(aviso: AvisoComReferencia, entraNaDiretoria: boolean): string | null {
  if (aviso.reference_type === 'com_meta' && !entraNaDiretoria) return null;
  const doRegistro = TELA_DO_REGISTRO[aviso.reference_type];
  if (doRegistro && aviso.reference_id) return doRegistro(aviso.reference_id);
  return TELA_DO_TIPO[aviso.reference_type] ?? null;
}
