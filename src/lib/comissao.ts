// As porcentagens de comissão valem de um mês em diante (dono, 2026-11-12): a que vale num mês é a de `vale_de` mais
// recente até ele. A mesma conta de `com_percentual_da_comissao` no banco — aqui só para a tela mostrar.

export interface PercentualComVigencia { tipo: 'carteira' | 'crm'; origem: string; percentual: number; vale_de: string }

/** O % que vale no mês (`AAAA-MM-01`), ou `null` se nenhum vale ainda (= sem comissão). */
export function percentualVigente<P extends PercentualComVigencia>(lista: P[], tipo: P['tipo'], origem: string, mes: string): P | null {
  return lista
    .filter((p) => p.tipo === tipo && p.origem === origem && p.vale_de <= mes)
    .sort((a, b) => b.vale_de.localeCompare(a.vale_de))[0] ?? null;
}

/** Os segmentos do Atendimento do CRM, na ordem da tela, com o nome que a equipe usa. */
export const SEGMENTOS_DO_CRM = [
  { origem: 'consumidor', rotulo: 'Consumidor final' },
  { origem: 'salao', rotulo: 'Salão' },
  { origem: 'distribuidor', rotulo: 'Novo distribuidor (1º pedido faturado)' },
] as const;
