// Setor fora (dono, 2026-10-27; migration 20270212030000): os dias em que o setor inteiro está fora (evento, apoio,
// treinamento). Nesses dias o prazo de todos os chamados do setor para, inclusive os já abertos; registrar ou tirar
// recalcula no banco. Quem pode é o banco que decide (`registrar_setor_fora`: a caixinha "Registrar viagem").
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { mensagemDeErro, unwrap } from '@/lib/supabase-result';

export interface PeriodoFora { id: string; module: string; de: string; ate: string; motivo: string }

// A tabela é nova e ainda não está nos tipos gerados.
const tabela = () => supabase.from('setor_fora' as 'profiles');

/** Os períodos do setor (`tickets.module`), do mais recente ao mais antigo. */
export function useSetorFora(module: string | null | undefined) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ['setor-fora', tenantId, module],
    enabled: !!tenantId && !!module,
    queryFn: async () => unwrap(await tabela()
      .select('id, module, de, ate, motivo')
      .eq('module' as 'id', module!)
      .order('de' as 'id', { ascending: false })
      .limit(50)) as unknown as PeriodoFora[],
  });

  const depois = () => {
    qc.invalidateQueries({ queryKey: ['setor-fora'] });
    // Os prazos mudaram: a fila, os indicadores e a performance releem.
    qc.invalidateQueries({ queryKey: ['tickets'] });
    qc.invalidateQueries({ queryKey: ['aviso-de-prazos'] });
  };

  const registrar = useMutation({
    mutationFn: async (p: { de: string; ate: string; motivo: string }) =>
      unwrap(await supabase.rpc('registrar_setor_fora' as never,
        { p_module: module, p_de: p.de, p_ate: p.ate, p_motivo: p.motivo } as never)) as number,
    onSuccess: (n) => {
      depois();
      toast.success(n ? `Registrado. O prazo de ${n} chamado${n === 1 ? '' : 's'} foi recalculado.` : 'Registrado.');
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const tirar = useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.rpc('tirar_setor_fora' as never, { p_id: id } as never)) as number,
    onSuccess: () => { depois(); toast.success('Período removido; os prazos voltaram a contar esses dias.'); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  return { periodos: data, isLoading, registrar, tirar };
}
