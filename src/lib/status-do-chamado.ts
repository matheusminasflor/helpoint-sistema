/**
 * O status do chamado como a pessoa vê e como o indicador conta.
 *
 * DECISÃO DO DONO (2026-10-04): "está resolvido, está resolvido". Os status que aparecem são só
 * Aberto, Em andamento, Pendente (aguardando) e Resolvido; a avaliação do solicitante é opcional e
 * não muda o status. O `closed` ("Fechado") deixou de ser escrito — a migration
 * 20261203020000_chamado_resolvido_nao_fecha passou os que existiam para `resolved` —, mas continua
 * no enum do banco. Qualquer `closed` que aparecer (dado antigo, outra porta) conta e aparece como
 * Resolvido: medido na produção, os 7 chamados da TI estavam `closed` e o painel dizia
 * "Resolvidos = 0".
 */

/** Os status que contam como "resolvido" nos indicadores. `closed` só por defesa. */
export const STATUS_RESOLVIDOS = ['resolved', 'closed'] as const;

export function contaComoResolvido(status: string | null | undefined): boolean {
  return status === 'resolved' || status === 'closed';
}

/** O status que a tela mostra: o `closed` antigo aparece como `resolved`. */
export function statusVisivel<T extends string>(status: T): T | 'resolved' {
  return status === 'closed' ? 'resolved' : status;
}
