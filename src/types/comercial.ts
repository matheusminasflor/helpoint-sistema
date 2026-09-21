// Tipos do domínio do Painel Comercial (L6a). Ver `.scratch/plano-painel-comercial.md`.

/** Texto, nunca 1/2 — o HTML antigo usa números e a inversão já aconteceu duas vezes na leitura do plano. */
export type Filial = 'INBRAS' | 'MF';

/** Eixo independente do CFOP (§3.8 do plano): 1 = venda faturada, 75 = o talão especial. */
export type Serie = '1' | '75';

/** Quatro classes de verdade, mais `outros` para o que não se reconhece (§3.1, §3.2). */
export type ClasseCfop = 'venda' | 'devolucao' | 'bonificacao' | 'industrializacao' | 'outros';

export interface FaturamentoMensal {
  competencia: string;
  filial: Filial;
  serie: Serie;
  venda: number;
  devolucao: number;
  liquido: number;
  bonificacao: number;
  unidades: number;
  clientes_ativos: number;
  skus_vendidos: number;
}

/**
 * Os quatro KPIs do topo do painel, numa linha só — nunca somados a partir
 * de `FaturamentoMensal` (achado 1 da auditoria: `count(distinct …)` não se
 * soma entre grupos de mês/filial/série. Somar os meses dava 129 clientes e
 * 307 SKUs onde os arquivos reais do dono, 2026, as duas filiais, têm 58 e
 * 182). `venda`/`bonificacao` continuam iguais aos de `FaturamentoMensal`
 * somados (são aditivos); só `clientes_ativos` e `skus_vendidos` mudam.
 */
export interface PainelTotais {
  venda: number;
  devolucao: number;
  liquido: number;
  bonificacao: number;
  unidades: number;
  clientes_ativos: number;
  skus_vendidos: number;
}

export interface RankingCliente {
  cliente_codigo: string;
  nome: string;
  tabela_preco: string | null;
  faturamento: number;
  participacao: number;
}

export interface CfopForaDaCurva {
  cfop: string;
  linhas: number;
  valor: number;
}

/** Uma competência (mês) que uma importação de vendas reclamou. */
export interface CompetenciaReclamada {
  competencia: string;
  linhas: number;
  total_venda: number;
}

/** O que a RPC `com_importar_vendas` devolve — a tela confere antes de dizer "importado". */
export interface ResumoImportacaoVendas {
  gravadas: number;
  /**
   * Eco do `p_descartes` que o navegador mandou, não uma recontagem do banco
   * (achado 11.4 da auditoria). Confiável porque `com_importar_vendas`
   * recusa a importação inteira quando `linhas_lidas ≠ itens + descartes`
   * (§4.3) — mas não confunda com uma contagem feita no banco.
   */
  descartes: Record<string, number>;
  competencias: CompetenciaReclamada[];
  outros_linhas: number;
  outros_valor: number;
  cfops_outros: string[];
  substituiu: boolean;
}

/** O que a RPC `com_importar_clientes` devolve. */
export interface ResumoImportacaoClientes {
  criados: number;
  atualizados: number;
  tabelas_alteradas: number;
}

/**
 * A última importação de cada tipo — para o rodapé fixo (§3.9): de qual
 * importação os números vêm. Domínio do módulo, por isso mora aqui (achado
 * 10.5 da auditoria) e não em `useComercialPainel.ts`, ao lado de todo o
 * resto do tipo do Comercial.
 */
export interface ComercialImportacao {
  id: string;
  tipo: 'vendas' | 'clientes' | 'metas';
  filial: Filial | null;
  file_name: string;
  linhas_lidas: number;
  itens_gravados: number;
  created_at: string;
}
