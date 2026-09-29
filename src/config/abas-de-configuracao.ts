// As abas da configuração de cada setor, cada uma liberada no perfil de acesso com ABRIR e ALTERAR
// (LEVA P, parte 7 — o dono escolheu o "Jeito 1" em 2026-09-29, depois de ver a simulação).
//
// A chave no perfil é `config_<aba>`, com `view` (abrir) e `edit` (alterar). Esta lista é o
// espelho de `public.abas_de_configuracao` (migration `20261116020000`); o Vitest em
// `abas-de-configuracao.test.ts` lê a migration e reprova se as duas divergirem — uma aba que
// existisse aqui e não lá apareceria no perfil sem que o banco a conferisse.
import type { Department } from '@/config/access-profile-schemas';

export interface AbaDeConfiguracao {
  /** Vira `config_<aba>` no perfil. */
  aba: string;
  rotulo: string;
  /** Aba que só se lê (não grava nada): o perfil oferece só "Abrir". */
  soAbrir?: boolean;
}

const CHAMADOS: AbaDeConfiguracao = { aba: 'chamados', rotulo: 'Chamados (categorias, formulários, prazos, automações)' };

export const ABAS_DE_CONFIGURACAO: Record<Department, AbaDeConfiguracao[]> = {
  ti: [
    CHAMADOS,
    { aba: 'cadastros', rotulo: 'Inventário e cadastros' },
    { aba: 'checklists', rotulo: 'Checklists' },
    { aba: 'alertas', rotulo: 'Alertas' },
  ],
  qualidade: [
    CHAMADOS,
    { aba: 'sac_link', rotulo: 'SAC: link público', soAbrir: true },
    { aba: 'sac_produtos', rotulo: 'SAC: produtos e lotes' },
    { aba: 'sac_categorias', rotulo: 'SAC: categorias' },
    { aba: 'sac_campos', rotulo: 'SAC: campos do formulário' },
  ],
  rh: [
    CHAMADOS,
    { aba: 'empresas', rotulo: 'Empresas' },
    { aba: 'departamentos', rotulo: 'Departamentos' },
    { aba: 'folha', rotulo: 'Parâmetros da folha' },
  ],
  marketing: [CHAMADOS],
  financeiro: [
    CHAMADOS,
    { aba: 'importacoes', rotulo: 'Planilhas importadas' },
    { aba: 'conferencia', rotulo: 'Conferência de pedidos (itens e motivos de recusa)' },
  ],
  compras: [CHAMADOS, { aba: 'teto', rotulo: 'Teto de gasto' }],
  comercial: [
    CHAMADOS,
    { aba: 'equipe', rotulo: 'Equipe e carteiras' },
    { aba: 'indicadores', rotulo: 'Indicadores' },
    { aba: 'cashback', rotulo: 'Cashback' },
  ],
  educacional: [CHAMADOS],
};

/** A chave do perfil de uma aba. */
export const chaveDaAba = (aba: string) => `config_${aba}`;
