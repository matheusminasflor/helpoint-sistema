// `tickets.module` → prefixo da rota do módulo (`/ti/chamados/:id`, `/rh/chamados/:id`…).
// Só TI e Marketing têm prefixo diferente do próprio slug.
const ROUTE_PREFIX: Record<string, string> = {
  tickets: 'ti',
  marketing: 'mkt',
};

/** A fila de chamados do módulo — para onde o "Voltar" do chamado leva quem atende. Compras não
 *  tem `/compras/chamados`: a fila dela é a própria tela de solicitações, `/compras`. */
export function ticketQueuePath(module: string | null | undefined): string {
  if (module === 'compras') return '/compras';
  return ticketDetailPath(module, '').replace(/\/$/, '');
}

export function ticketDetailPath(module: string | null | undefined, ticketId: string): string {
  const prefix = ROUTE_PREFIX[module ?? 'tickets'] ?? module ?? 'ti';
  return `/${prefix}/chamados/${ticketId}`;
}
