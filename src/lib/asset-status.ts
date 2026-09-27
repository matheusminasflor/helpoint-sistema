/**
 * A situação do ativo de inventário — uma leitura só, num lugar só.
 *
 * POR QUE EXISTE (2026-09-27). O tipo `AssetStatus` tem **seis** valores, e eles
 * são **dois pares de sinônimos** mais dois estados de verdade:
 *
 *   em uso     → `in_use`  **ou** `active`    (o par antigo e o novo)
 *   em estoque → `in_stock` **ou** `inactive`
 *   manutenção → `maintenance`
 *   descartado → `decommissioned`
 *
 * Nada no sistema tratava isso num lugar só, e o resultado foram **três leituras
 * concorrentes da mesma pergunta**:
 *
 *   - `useAssets`/`useMyAssets` filtravam `status = 'active'` para montar o
 *     seletor de ativo do chamado. O formulário de cadastro grava `in_stock` e
 *     oferece `in_use` — então **ativo cadastrado pela tela nunca aparecia no
 *     chamado**, inclusive o que estava atribuído à própria pessoa;
 *   - `InventoryKPIs` contava "Em uso" como `active` e "Em estoque" como
 *     `inactive`, ignorando `in_use` e `in_stock` — os dois valores que a tela
 *     realmente grava;
 *   - `TIRelatorios` contava "Em uso" por `assigned_to` preenchido, que é outra
 *     pergunta: ativo pode estar em uso sem estar atribuído a alguém.
 *
 * Como em `rh-status.ts` e `setores.ts`: a pergunta se escreve uma vez. E como
 * naquele caso, o sintoma não era erro — era um seletor vazio e um contador
 * plausível.
 *
 * **Lê tolerante, escreve canônico.** As funções aceitam os seis valores porque o
 * banco tem os seis (hoje os 6 ativos do teste são `active`); telas novas gravam
 * `in_use`/`in_stock`. Unificar os valores no banco é migration de dado, e não faz
 * parte desta correção — o que importava era parar de perder ativo na leitura.
 */
import type { AssetStatus } from '@/types/helpdesk';

/** Em uso por alguém. Os dois nomes que o sistema já gravou querem dizer isto. */
export function ativoEmUso(status: string | null | undefined): boolean {
  return status === 'in_use' || status === 'active';
}

/** Disponível no estoque. Idem: dois nomes, uma situação. */
export function ativoEmEstoque(status: string | null | undefined): boolean {
  return status === 'in_stock' || status === 'inactive';
}

/**
 * O ativo pode ser vinculado a um chamado?
 *
 * Tudo menos **descartado**. Em manutenção entra de propósito: ativo em
 * manutenção é justamente o que mais gera chamado, e deixá-lo fora foi metade do
 * defeito original.
 */
export function ativoEntraEmChamado(status: string | null | undefined): boolean {
  return status !== 'decommissioned';
}

/** O rótulo de cada situação, com os sinônimos caindo no mesmo texto. */
export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  active: 'Em uso',
  in_use: 'Em uso',
  inactive: 'Em estoque',
  in_stock: 'Em estoque',
  maintenance: 'Em manutenção',
  decommissioned: 'Descartado',
};

/** O que telas novas devem gravar — um nome por situação, sem sinônimo. */
export const ASSET_STATUS_CANONICO = {
  emUso: 'in_use',
  emEstoque: 'in_stock',
  manutencao: 'maintenance',
  descartado: 'decommissioned',
} as const;
