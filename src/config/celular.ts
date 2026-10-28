// O que o celular mostra (dono, 2026-10-28; proposta aprovada "Helpoint no celular"): o celular é para o dia a dia.
//  - RELATÓRIO (análise: indicadores, carteira, relatórios): some do menu do celular; aberto por link, vira a versão
//    resumida — os números ficam, as tabelas e os gráficos não (`.resumo-no-celular` em index.css).
//  - SÓ NO COMPUTADOR (cadastro e conferência): some do menu do celular.
// O celular é a mesma largura da barra de baixo: até 860 px (`BarraDeBaixo`, `min-[861px]:hidden`).
// ponytail: a lista é por padrão de rota; uma tela nova de relatório fora destes padrões entra aqui à mão.

export const LARGURA_DO_CELULAR = 861;

const RELATORIOS: RegExp[] = [
  /\/indicadores$/,
  /^\/qualidade\/dashboard$/,
  /\/relatorios\//,
  /^\/financeiro\/(relatorio-de-compras|fluxo-de-caixa|previsao-de-caixa)$/,
  /^\/comercial\/(vendas|clientes-parados|bonificacao|cashback|beneficios|atendimento|carteiras|insights)$/,
];

const SO_NO_COMPUTADOR: RegExp[] = [
  /^\/configuracoes(\/|$)/,
  /\/configuracoes$/,
  /^\/financeiro\/contas-a-(pagar|receber)$/,
];

const sem = (rota: string) => rota.split('?')[0].replace(/\/+$/, '') || '/';

/** Tela de análise: no celular sai do menu e, aberta, mostra só os números. */
export const ehRelatorio = (rota: string) => RELATORIOS.some((r) => r.test(sem(rota)));

/** Tela de cadastro/conferência: no celular sai do menu. */
export const soNoComputador = (rota: string) => SO_NO_COMPUTADOR.some((r) => r.test(sem(rota)));

/** Fica no menu do celular? */
export const ficaNoCelular = (rota: string) => !ehRelatorio(rota) && !soNoComputador(rota);
