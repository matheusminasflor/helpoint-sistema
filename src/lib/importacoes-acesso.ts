// Frente 6 (.scratch/plano-frente6-importacoes.md §3): quem vê o item de
// menu "Importações" e qual cartão fica habilitado dentro da tela — regra
// pura, sem componente, para o Vitest provar sem montar nada (plano §6).
//
// As permissões são as que já existiam (nenhuma nova, por decisão do plano):
// `vendas.importar` gatea Vendas E Clientes — é a MESMA permissão que já
// gateava os dois botões em `ComercialPainel.tsx` (achado 5 da auditoria de
// 2026-09-22: "ver é `has_comercial_access`; importar é outra coisa").
// `metas.definir` gatea Metas, sozinha (docs/inventario-sistema.md: a
// policy de `com_vendas_importacoes` aceita admin, `vendas.importar` OU
// `metas.definir` — nunca as duas juntas para o mesmo cartão).
//
// Regra 2 das cinco, do lado da tela: nunca um botão que responde com erro
// depois do clique — por isso o item de menu só aparece para quem tem
// ALGUMA das duas, e cada cartão só fica habilitado para quem tem a
// permissão daquele cartão especificamente.

export interface PermissoesImportacao {
  /** `vendas.importar` — habilita os cartões Vendas e Clientes. */
  podeImportarVendas: boolean;
  /** `metas.definir` — habilita o cartão Metas. */
  podeDefinirMetas: boolean;
}

export interface AcessoImportacoes {
  /** O item "Importações" só aparece no menu para quem tem alguma das duas. */
  mostrarItemDeMenu: boolean;
  vendas: boolean;
  clientes: boolean;
  metas: boolean;
}

export function resolverAcessoImportacoes(p: PermissoesImportacao): AcessoImportacoes {
  return {
    mostrarItemDeMenu: p.podeImportarVendas || p.podeDefinirMetas,
    vendas: p.podeImportarVendas,
    clientes: p.podeImportarVendas,
    metas: p.podeDefinirMetas,
  };
}
