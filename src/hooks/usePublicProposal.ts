import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';

/** O que `crm_public_proposal` devolve (migration 20260914010000). */
export interface PublicProposal {
  number: number;
  status: string;
  company: { name: string; logo_url: string | null };
  contact: { name: string; company: string | null };
  seller: string | null;
  items: { description: string; quantity: number; unit_price: number; total: number }[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  notes: string | null;
  valid_until: string | null;
  sent_at: string | null;
  link_url: string | null;
}

/**
 * A proposta pelo link público (CRM-1c). Sem login: quem tem o token é o
 * cliente. `null` = não existe ou ainda não foi enviada. Não leva `tenantId`
 * na chave porque o token já identifica o pedido e a página é pública.
 */
export function usePublicProposal(token: string | undefined) {
  return useQuery({
    // eslint-disable-next-line no-restricted-syntax -- página pública, sem login: o token é a identidade (regra 3 não se aplica)
    queryKey: ['public-proposal', token],
    enabled: !!token,
    queryFn: async (): Promise<PublicProposal | null> =>
      unwrap(await supabase.rpc('crm_public_proposal', { p_token: token! })) as unknown as PublicProposal | null,
  });
}
