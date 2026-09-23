// Lista única das funções pgTAP que produzem uma linha de TAP — a lista
// existia em duas cópias (pgtap-acumular.mjs e pgtap-conferir-embrulho.mjs);
// se uma mudasse sem a outra, o conferidor (que compara "quantas chamadas
// existem" com "quantas foram embrulhadas") passaria a mentir sobre o
// próprio número que existe para checar (achado 6.2 da auditoria de
// 2026-09-22). Uma lista, duas importações.
export const ASSERTS = [
  'plan', 'finish',
  'ok', 'is', 'isnt', 'matches', 'imatches', 'alike', 'cmp_ok',
  'throws_ok', 'lives_ok', 'throws_like', 'performs_ok',
  'results_eq', 'results_ne', 'set_eq', 'bag_eq', 'is_empty',
  'has_table', 'has_column', 'has_function', 'has_view', 'has_index',
  'hasnt_table', 'hasnt_column', 'hasnt_function', 'hasnt_view', 'hasnt_index',
  'col_is_pk', 'col_is_fk', 'enum_has_labels', 'policies_are', 'pass', 'fail',
];
