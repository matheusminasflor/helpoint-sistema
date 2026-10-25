// O interruptor do Meu RH (migration 20270205010000): ligado nas Configurações do RH, o Meu RH e as Solicitações do
// RH saem do "em breve", o card RH sai da grade de abrir chamado e férias/atestado deixam de abrir chamado no banco.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { mensagemDeErro, unwrap } from '@/lib/supabase-result';
import { TELAS_EM_BREVE } from '@/config/telas-pausadas';

/** As telas que só abrem com o Meu RH ligado. */
const DO_MEU_RH = ['/meu-rh', '/rh/solicitacoes'];

export function useMeuRHLigado() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['meu-rh-ligado', tenantId], enabled: !!tenantId, staleTime: 5 * 60 * 1000,
    queryFn: async () => unwrap(await supabase.rpc('meu_rh_ligado' as never, { p_tenant: tenantId } as never)) as unknown as boolean,
  });
}

/** O "em breve" de agora: sem as telas do Meu RH quando ele está ligado. */
export function useTelasEmBreve(): Record<string, string> {
  const { data: ligado } = useMeuRHLigado();
  if (!ligado) return TELAS_EM_BREVE;
  return Object.fromEntries(Object.entries(TELAS_EM_BREVE).filter(([tela]) => !DO_MEU_RH.includes(tela)));
}

export function useLigarMeuRH() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ligado: boolean) => unwrap(await supabase.rpc('rh_ligar_meu_rh' as never, { p_ligado: ligado } as never)),
    onSuccess: (_d, ligado) => {
      qc.invalidateQueries({ queryKey: ['meu-rh-ligado'] });
      toast.success(ligado ? 'Meu RH ligado para todos.' : 'Meu RH desligado: férias e atestado voltam a abrir chamado.');
    },
    onError: (e) => toast.error('Não mudou o Meu RH', { description: mensagemDeErro(e) }),
  });
}
