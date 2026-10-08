// Viagens de quem atende (dono, 2026-10-08; migration 20261219020000). O gestor do setor registra quem
// vai viajar, com ida e volta; o chamado que NASCE durante a viagem conta o prazo da volta (o banco faz).
// Quem pode registrar também é o banco que decide (`viagens_de_atendimento_gestor`).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { expectRows, mensagemDeErro, unwrap } from '@/lib/supabase-result';

export interface Viagem { id: string; user_id: string; inicio: string; fim: string }

// A tabela é nova e ainda não está nos tipos gerados.
const viagens = () => supabase.from('viagens_de_atendimento' as 'profiles');

/** As viagens que ainda não acabaram, das pessoas da lista. */
export function useViagens(pessoas: string[]) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const chave = ['viagens', tenantId];

  const { data = [], isLoading } = useQuery({
    queryKey: ['viagens', tenantId, pessoas],
    enabled: !!tenantId && pessoas.length > 0,
    queryFn: async () => unwrap(await viagens()
      .select('id, user_id, inicio, fim')
      .in('user_id' as 'id', pessoas)
      .gt('fim' as 'id', new Date().toISOString())
      .order('inicio' as 'id')) as unknown as Viagem[],
  });

  const registrar = useMutation({
    mutationFn: async (v: { user_id: string; inicio: string; fim: string }) =>
      expectRows(await viagens().insert({ tenant_id: tenantId!, ...v } as never).select('id'), 'a viagem'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: chave }); toast.success('Viagem registrada. Chamado novo para quem viaja conta o prazo da volta.'); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const tirar = useMutation({
    mutationFn: async (id: string) => expectRows(await viagens().delete().eq('id', id).select('id'), 'a viagem'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: chave }); toast.success('Viagem removida'); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  return { viagens: data, isLoading, registrar, tirar };
}
