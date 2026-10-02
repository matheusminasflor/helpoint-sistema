// Os contadores de avisos do menu (decisão do dono, 2026-10-02): "ter o contador nos menus — ele
// vê tanto pelo contador quanto pela Lyra no menu inicial; assim não fica só numa página, e não
// fica tão poluído". O número do Início é o total de não lidos (o mesmo do "Lyra avisa"); o do
// setor e o da fila dele contam os avisos de chamados daquele setor. Lê a mesma lista dos avisos
// (`useNotifications`); o setor de cada chamado vem de uma consulta pequena, só dos avisados.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';
import { useNotifications } from '@/hooks/useNotifications';

export interface ContadoresDeAvisos {
  /** Todos os avisos não lidos. */
  total: number;
  /** Avisos não lidos de chamados, por `tickets.module` ('tickets' é a TI). */
  porModulo: Record<string, number>;
}

export function useContadoresDeAvisos(): ContadoresDeAvisos {
  const { user } = useAuth();
  const { notifications = [] } = useNotifications();
  const naoLidos = notifications.filter((n) => !n.is_read);
  const idsDeChamado = [...new Set(
    naoLidos.filter((n) => n.reference_type === 'ticket' && n.reference_id).map((n) => n.reference_id),
  )].sort();

  const { data: moduloDoChamado = {} } = useQuery({
    queryKey: ['modulo-dos-chamados-avisados', user?.id, idsDeChamado],
    enabled: idsDeChamado.length > 0,
    queryFn: async () => {
      const linhas = unwrap(await supabase.from('tickets').select('id, module').in('id', idsDeChamado)) ?? [];
      return Object.fromEntries(linhas.map((l) => [l.id, l.module as string])) as Record<string, string>;
    },
  });

  const porModulo: Record<string, number> = {};
  for (const n of naoLidos) {
    if (n.reference_type !== 'ticket') continue;
    const modulo = moduloDoChamado[n.reference_id];
    if (modulo) porModulo[modulo] = (porModulo[modulo] ?? 0) + 1;
  }
  return { total: naoLidos.length, porModulo };
}

/** O grupo do menu e a fila de chamados de cada módulo de chamado. */
export function lugarNoMenuDoModulo(modulo: string): { grupo: string; fila: string } {
  if (modulo === 'tickets') return { grupo: 'ti', fila: '/ti/chamados' };
  if (modulo === 'marketing') return { grupo: 'mkt', fila: '/mkt/chamados' };
  return { grupo: modulo, fila: `/${modulo}/chamados` };
}
