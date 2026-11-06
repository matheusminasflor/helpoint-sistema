// Faturado + Condição = Venda total (dono, 2026-11-05). Só aparece quando há venda em condição no recorte: quem não tem
// esse cliente vê a tela como sempre. As contas são do banco (`com_composicao_da_venda`).
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';
import { formatBRL } from '@/types/financeiro';

interface Composicao { faturado: number; condicao: number; venda_total: number; clientes: number; a_confirmar: number }

export function ComposicaoDaVenda({ de, ate, carteira, filial, codigo }: {
  de: string; ate: string; carteira?: string | null; filial?: string | null; codigo?: string;
}) {
  const { tenantId } = useAuth();
  const { data } = useQuery({
    queryKey: ['comercial', 'composicao-da-venda', tenantId, de, ate, carteira ?? null, filial ?? null, codigo ?? null],
    enabled: !!tenantId,
    queryFn: async (): Promise<Composicao | null> => {
      const linhas = unwrap(await supabase.rpc('com_composicao_da_venda' as never, {
        p_de: de, p_ate: ate, p_carteira: carteira || null, p_filial: filial || null, p_codigo: codigo ?? null,
      } as never)) as unknown as Composicao[] | null;
      const l = linhas?.[0];
      return l ? { faturado: Number(l.faturado), condicao: Number(l.condicao), venda_total: Number(l.venda_total), clientes: l.clientes, a_confirmar: Number(l.a_confirmar) } : null;
    },
  });
  if (!data || (data.condicao === 0 && data.a_confirmar === 0)) return null;
  return (
    <p className="text-[13px] rounded-md badge-purple px-2 py-1.5">
      Faturado <strong className="font-mono">{formatBRL(data.faturado)}</strong> + Condição <strong className="font-mono">{formatBRL(data.condicao)}</strong>
      {' '}= Venda total <strong className="font-mono">{formatBRL(data.venda_total)}</strong>
      {data.a_confirmar > 0 && <> · <strong className="font-mono">{formatBRL(data.a_confirmar)}</strong> a confirmar na importação</>}
    </p>
  );
}
