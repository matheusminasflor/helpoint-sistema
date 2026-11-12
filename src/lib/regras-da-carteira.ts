// Regras puras da Carteira e da Agenda (sem banco), para o Vitest rodar sem as variáveis do Supabase.
export type CorFarol = 'verde' | 'amarelo' | 'vermelho' | 'sem_meta';

/** O mesmo farol de `com_cor_do_farol` (banco): sem meta, ≥ meta verde, ≥ 70% amarelo, abaixo vermelho. */
export function corDoFarol(realizado: number, meta: number | null): CorFarol {
  if (meta == null || meta <= 0) return 'sem_meta';
  if (realizado >= meta) return 'verde';
  return realizado >= meta * 0.7 ? 'amarelo' : 'vermelho';
}

/**
 * O retorno de quem saiu do Comercial (revisão de 2026-11-12): quem marcou não está mais em carteira nenhuma, e ninguém
 * ia ligar — eram 20 atrasados desde 05/10, todos da Júlia. Ele sai do "O que fazer hoje" e espera o gestor na Agenda.
 * `comCarteira` é o conjunto de quem está em alguma carteira (`com_carteira_membros`); vazio = ainda lendo, ninguém é órfão.
 */
export function retornoSemDono(r: { vendedor_id: string }, comCarteira: ReadonlySet<string>): boolean {
  return comCarteira.size > 0 && !comCarteira.has(r.vendedor_id);
}
