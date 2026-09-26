/**
 * A mesma porta que `has_comercial_access` abre no banco: módulo `comercial`
 * concedido **OU** gestor para cima (`owner`/`admin`/`manager`, que é o
 * `is_supervisor_or_higher` do banco).
 *
 * Existe pelo mesmo motivo de `podeAcessarDiretoria` — e pela mesma armadilha:
 * **um guarda de tela nunca pode ser mais estreito do que a porta que o banco já
 * abriu.** Se ficar, quem o banco autoriza não chega à tela que o dado existe
 * para servir; se ficar mais largo, a tela mostra zeros sem explicar por quê, que
 * é o que acontecia até 2026-09-25: `comercial/insights` não tinha guarda
 * nenhuma, então qualquer pessoa logada chegava lá pela URL. Quem não tem o
 * módulo lia "Faturamento R$ 0,00" — a RLS de `com_vendas_itens` devolvia zero
 * linha, sem erro. Número errado sem erro na tela é a pior das duas saídas.
 *
 * **Mora aqui, e não em `useVisibleModules.ts`, por causa do teste.** Aquele
 * arquivo importa `useAuth`, que arrasta o cliente do Supabase, que exige
 * `VITE_SUPABASE_URL` no import. A máquina de quem desenvolve tem `.env`; o CI
 * não tem. Regra pura fica em módulo sem dependência — ver o comentário de
 * `acesso-diretoria.ts`, que aprendeu isso primeiro.
 *
 * O DIRETOR PURO FICA DE FORA, e é decisão, não descuido (leva B do
 * docs/plano-geral.md): `has_comercial_access` é falso para ele, o menu já não
 * mostra o item, e o que ele precisa ver de faturamento está no painel da
 * Diretoria — que tem os mesmos números, pela mesma função (`com_caixas`).
 */
export function podeAcessarComercial(showComercial: boolean, isManagerOrHigher: boolean): boolean {
  return showComercial || isManagerOrHigher;
}
