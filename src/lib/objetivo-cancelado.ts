// Objetivo cancelado não conta — nem na tela, nem na média.
//
// Leva F, item 6 (2026-09-26). `goals.status` aceita `active`, `done` e
// `cancelled` (CHECK da tabela), mas a tela de Metas nunca olhava para ele:
//
//   • o cartão do objetivo não tinha marca nenhuma — cancelado e ativo eram
//     visualmente idênticos;
//   • e, pior, o percentual do objetivo era
//     `filhos.filter(f => f.progress !== null)` — então **um resultado-chave
//     cancelado continuava entrando na média**. Cancelar um filho não tirava o
//     peso dele do número que o dono lê.
//
// A segunda parte é a que importa: a primeira é estética, a segunda MOVE um
// número. Um objetivo com dois filhos, um em 100% e um cancelado em 0%, mostrava
// 50% — e a leitura certa é 100%.
//
// A Diretoria já fazia certo (`ObjetivosEChamados.tsx:34` filtra
// `status !== 'cancelled'`). Era só a tela de gestão que não.
//
// POR QUE A TELA DE METAS NÃO FILTRA, E SIM MARCA: é a tela onde se administra o
// objetivo. Esconder o cancelado dali tiraria o único lugar de onde se pode
// reativá-lo ou entender por que ele saiu das contas. Some do painel (Diretoria),
// aparece marcado na gestão (Metas).
//
// Mora em módulo sem dependência por causa do teste: `Metas.tsx` arrasta os
// diálogos, o roteador e o cliente do Supabase.

/** O mínimo que a conta precisa saber de um filho. */
export interface FilhoMensuravel {
  status?: string | null;
  progress?: number | string | null;
}

/** Um objetivo/filho cancelado sai de toda conta e leva marca na tela. */
export function estaCancelado(m: { status?: string | null }): boolean {
  return m.status === 'cancelled';
}

/**
 * O quanto o objetivo andou: a média do progresso dos filhos **não cancelados**
 * que já foram medidos.
 *
 * `null` quando não há nenhum filho mensurável — e isso é diferente de zero.
 * Objetivo sem nada embaixo ainda não é mensurável, e mostrar 0% seria dizer que
 * fracassou (a razão já estava escrita na tela; aqui ela ganhou teste).
 *
 * Cada filho entra no máximo com 1 (100%): quem passou da meta não compensa quem
 * não chegou — dois filhos, um em 200% e um em 0%, é 50% e não 100%.
 */
export function mediaDoObjetivo(filhos: FilhoMensuravel[]): number | null {
  const medidos = filhos.filter((f) => !estaCancelado(f) && f.progress !== null && f.progress !== undefined);
  if (medidos.length === 0) return null;
  const soma = medidos.reduce((s, f) => s + Math.min(Number(f.progress), 1), 0);
  return soma / medidos.length;
}
