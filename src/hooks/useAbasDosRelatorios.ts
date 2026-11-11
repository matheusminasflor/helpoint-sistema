// As abas dos Relatórios do Comercial (revisão de 2026-11-12): a lista e quem vê cada uma. O desenho é AbasDosRelatorios.
import { useConfiguracaoDosSetores } from '@/hooks/useAccessProfiles';
import { abreATela, telaDoPerfil } from '@/config/telas-do-perfil';

/** A ordem é a das abas. O primeiro que a pessoa abre é para onde "Relatórios" do menu leva. */
export const ABAS_DOS_RELATORIOS = [
  { to: '/comercial/vendas', rotulo: 'Faturamento e Curva ABC' },
  { to: '/comercial/clientes-parados', rotulo: 'Clientes' },
  { to: '/comercial/relatorios/motivos-e-dores', rotulo: 'Retenção de clientes' },
  { to: '/comercial/bonificacao', rotulo: 'Bonificação' },
  { to: '/comercial/cashback', rotulo: 'Cashback' },
  { to: '/comercial/beneficios', rotulo: 'Benefícios a conceder' },
  { to: '/comercial/relatorios/venda-por-familia', rotulo: 'Vendas por linha e região' },
  { to: '/comercial/atendimento', rotulo: 'Atendimento de chamados' },
] as const;

/** As abas que a pessoa abre (o mesmo mapa do menu lateral, telas-do-perfil). */
export function useAbasDosRelatorios() {
  const perfil = useConfiguracaoDosSetores();
  return ABAS_DOS_RELATORIOS.filter((a) => {
    const tela = telaDoPerfil(a.to);
    return !tela || perfil.isLoading || perfil.isError || abreATela(tela, perfil.pode);
  });
}
