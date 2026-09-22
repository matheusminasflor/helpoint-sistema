/**
 * A mesma porta que `has_diretoria_access` abre no banco (migration
 * `20261017010000`): módulo `diretoria` concedido **OU** gestor para cima.
 *
 * `RequireDiretoria` usa esta função para nunca ficar mais estreito do que o
 * que o banco já abre com essa régua: a RLS de `metas_carteira`/`metas_ano`
 * (`has_comercial_access OR has_diretoria_access`) e as funções `security
 * definer` `com_conciliacao`/`com_pessoas_do_comercial` — correção da
 * auditoria da leva metas-e-carteiras, item 3: a versão anterior exigia as
 * duas coisas com `&&`, e ninguém do caminho que o banco abriu chegava à
 * tela.
 *
 * **Mora aqui, e não em `useVisibleModules.ts`, por causa do teste.** Aquele
 * arquivo importa `useAuth`, que arrasta o cliente do Supabase, que exige
 * `VITE_SUPABASE_URL` no momento do import. A máquina de quem desenvolve tem
 * `.env`; o CI não tem — então o teste passava aqui e reprovava lá, que é a
 * mesma armadilha da regra 10 do pgTAP (o `current_date` do servidor) do
 * lado do front. Regra pura fica em módulo sem dependência.
 */
export function podeAcessarDiretoria(showDiretoria: boolean, isManagerOrHigher: boolean): boolean {
  return showDiretoria || isManagerOrHigher;
}
