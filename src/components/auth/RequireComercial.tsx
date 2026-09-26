import { Navigate } from 'react-router-dom';
import { useVisibleModules } from '@/hooks/useVisibleModules';
import { podeAcessarComercial } from '@/lib/acesso-comercial';
import { useTenantPath } from '@/hooks/useTenantPath';

/**
 * O guarda que faltava no Insights do Comercial (leva B, segundo item).
 *
 * Esconder o item do menu nunca foi fronteira: a URL continua aberta. Até
 * 2026-09-25, `comercial/insights` e `comercial/configuracoes` eram as únicas
 * telas de módulo sem guarda nenhuma — qualquer pessoa logada chegava lá
 * digitando o endereço.
 *
 * O ESTRAGO NÃO ERA VAZAMENTO, era número mentiroso. A RLS de `com_vendas_itens`
 * exige o módulo Comercial ou a Diretoria, então quem não tem nenhum dos dois
 * lia a tela inteira zerada: "Faturamento R$ 0,00", "Clientes ativos 0", a curva
 * vazia. Sem erro nenhum, porque policy não levanta erro — ela filtra linha. A
 * pessoa concluiria que a empresa não vendeu nada. É a mesma família do defeito
 * que a regra 1 das cinco existe para matar, e o mesmo raciocínio que
 * `RequireDiretoria` já registrou para os chamados por setor.
 *
 * A régua é `podeAcessarComercial` (módulo concedido OU gestor para cima), a
 * mesma de `has_comercial_access` no banco — nunca mais estreita do que a porta
 * que o banco abriu, que foi o erro corrigido em `RequireDiretoria`. Quem é
 * recusado vai para `/inicio`, não para uma tela de erro: a pessoa não fez nada
 * errado, ela só abriu um endereço que não é dela.
 */
export function RequireComercial({ children }: { children: React.ReactNode }) {
  const { showComercial, isManagerOrHigher, isLoading } = useVisibleModules();
  const tenantPath = useTenantPath();

  // Enquanto a concessão não chegou, ninguém é redirecionado: sem isto, quem tem
  // acesso seria jogado para a home no primeiro quadro e voltaria sozinho.
  if (isLoading) return null;
  if (!podeAcessarComercial(showComercial, isManagerOrHigher)) return <Navigate to={tenantPath('/inicio')} replace />;
  return <>{children}</>;
}
