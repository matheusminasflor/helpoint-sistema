// "Meus pedidos e chamados" (rodada 3, etapa B): o que eu pedi, num lugar só — os chamados (`tickets`) e os pedidos
// (`solicitacoes`) — já traduzidos para quem pediu (`estado-para-quem-pediu`). Quem vê cada linha é o RLS de cada tabela.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';
import { SLA_PAUSED_STATUSES } from '@/types/helpdesk';
import {
  ehPedido, estadoDoChamadoParaQuemPediu, estadoDoPedidoParaQuemPediu, type EstadoParaQuemPediu,
} from '@/lib/estado-para-quem-pediu';

export interface MeuItem {
  chave: string;
  tipo: 'chamado' | 'pedido';
  numero: number;
  titulo: string;
  /** O módulo do chamado ou o setor do pedido — a cor do setor. */
  setor: string;
  estado: EstadoParaQuemPediu;
  /** O que falta de quem pediu, quando é a vez dele. */
  falta: string | null;
  prazo: string | null;
  criadoEm: string;
  rota: string;
}

const PAUSADOS: readonly string[] = SLA_PAUSED_STATUSES;

export function useMeusPedidosEChamados() {
  const { tenantId, user } = useAuth();
  return useQuery({
    queryKey: ['meus-pedidos-e-chamados', tenantId, user?.id],
    enabled: !!tenantId && !!user?.id,
    queryFn: async (): Promise<MeuItem[]> => {
      const [chamados, pedidos] = await Promise.all([
        supabase.from('tickets').select('id, ticket_number, title, status, module, sla_due_at, created_at')
          .eq('requester_id', user!.id).order('created_at', { ascending: false }).limit(200).then(unwrap),
        supabase.from('solicitacoes' as never).select('id, numero, tipo, etapa, setor, titulo, created_at')
          .eq('solicitante_id', user!.id).order('created_at', { ascending: false }).limit(200).then(unwrap),
      ]);
      const agora = Date.now();
      const deChamados: MeuItem[] = (chamados ?? []).map((t) => {
        const atrasado = !!t.sla_due_at && new Date(t.sla_due_at).getTime() < agora && !PAUSADOS.includes(t.status);
        const estado = estadoDoChamadoParaQuemPediu(t.status, t.module, atrasado);
        return {
          chave: `c-${t.id}`, tipo: ehPedido(t.module) ? 'pedido' : 'chamado', numero: t.ticket_number, titulo: t.title,
          setor: t.module ?? 'tickets', estado, falta: estado.familia === 'espera' ? 'Responda na conversa' : null,
          prazo: estado.etapa < 2 ? t.sla_due_at : null, criadoEm: t.created_at, rota: `/helpdesk/${t.id}`,
        };
      });
      type Linha = { id: string; numero: number; tipo: string; etapa: string; setor: string; titulo: string; created_at: string };
      const dePedidos: MeuItem[] = ((pedidos ?? []) as unknown as Linha[]).map((p) => {
        const estado = estadoDoPedidoParaQuemPediu(p.tipo, p.etapa, p.setor);
        return {
          chave: `p-${p.id}`, tipo: 'pedido', numero: p.numero, titulo: p.titulo, setor: p.setor, estado,
          falta: estado.familia === 'espera' ? 'Preste contas do adiantamento' : null,
          prazo: null, criadoEm: p.created_at, rota: `/solicitacoes/${p.id}`,
        };
      });
      return [...deChamados, ...dePedidos].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
    },
  });
}
