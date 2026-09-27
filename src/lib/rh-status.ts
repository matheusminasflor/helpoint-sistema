/**
 * A situação do colaborador — uma lista só, num lugar só.
 *
 * POR QUE EXISTE (2026-09-27). A lista morava dentro de `RHColaboradores.tsx`,
 * sem ser exportada, e quem precisava dela em outra tela escrevia de novo. Foi
 * assim que nasceu o defeito que descobriu isto: `DetailedRHTable` contava os
 * ativos com `e.status === 'active'` — **a palavra em inglês**, que nada neste
 * sistema escreve. O banco grava `ativo`. O cartão "Ativos" do relatório de RH
 * mostrava **zero** com a empresa inteira trabalhando, e zero é um número
 * plausível: ninguém estranha, ninguém investiga. É o mesmo padrão que
 * `docs/nao-funciona.md` chama de "sem dado virando zero".
 *
 * É o mesmo raciocínio de `setores.ts` e `documento.ts`: valor que o banco
 * conhece não se redigita em tela nenhuma.
 *
 * Os três valores são os que `rh_employee_profiles.status` aceita e os que a
 * tela de colaboradores oferece. Não há `active`, `inactive` nem `terminated`.
 */
export const RH_STATUS = ['ativo', 'afastado', 'desligado'] as const;

export type RHStatus = (typeof RH_STATUS)[number];

/** O rótulo e a cor de cada situação, como a tela de colaboradores mostra. */
export const RH_STATUS_OPCOES: { value: RHStatus; label: string; class: string }[] = [
  { value: 'ativo', label: 'Ativo', class: 'badge-success text-status-success' },
  { value: 'afastado', label: 'Afastado', class: 'badge-warning text-status-warning' },
  { value: 'desligado', label: 'Desligado', class: 'badge-danger text-status-danger' },
];

/**
 * A pessoa ainda faz parte da empresa?
 *
 * `afastado` conta como SIM — quem está de licença continua empregado, aparece
 * no quadro e faz aniversário. Só `desligado` sai. É a pergunta que
 * aniversariantes, tempo de casa e o quadro de pessoal fazem, e escrevê-la aqui
 * evita que cada tela invente a própria resposta.
 */
export function estaNaEmpresa(status: string | null | undefined): boolean {
  return status !== 'desligado';
}

/** Está trabalhando hoje — mais estreito que `estaNaEmpresa`: exclui afastado. */
export function estaAtivo(status: string | null | undefined): boolean {
  return status === 'ativo';
}
