// `tickets.module` → prefixo da rota do módulo (`/ti/chamados/:id`, `/rh/chamados/:id`…).
// Só TI e Marketing têm prefixo diferente do próprio slug.
const ROUTE_PREFIX: Record<string, string> = {
  tickets: 'ti',
  marketing: 'mkt',
};

export function ticketDetailPath(module: string | null | undefined, ticketId: string): string {
  const prefix = ROUTE_PREFIX[module ?? 'tickets'] ?? module ?? 'ti';
  return `/${prefix}/chamados/${ticketId}`;
}
