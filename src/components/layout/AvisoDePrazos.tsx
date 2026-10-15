// O aviso de prazos ao entrar (dono, 2026-10-15): abre uma vez a cada entrada no sistema ou atualização da página,
// só para quem atende chamado com prazo vencido ou prestes a vencer. A regra é `prazosQuePedemAtencao`.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantPath } from '@/hooks/useTenantPath';
import { unwrap } from '@/lib/supabase-result';
import { prazosQuePedemAtencao, type ChamadoDoAviso, type Motivo } from '@/lib/prazos-do-aviso';

const CAMPOS = 'id, ticket_number, title, status, sla_due_at, first_response_due_at, first_response_at';
const ABERTOS = ['open', 'in_progress'] as const;

const quandoEmTexto = (d: Date) => {
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return mesmoDia ? `hoje às ${hora}` : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} às ${hora}`;
};
const FRASE: Record<Motivo, (q: string) => string> = {
  vencido: (q) => `prazo venceu ${q}`,
  primeira_resposta: (q) => `ainda sem resposta — a 1ª resposta vence ${q}`,
  vence_logo: (q) => `prazo vence ${q}`,
};

export function AvisoDePrazos() {
  const { user, tenantId } = useAuth();
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const [fechado, setFechado] = useState(false);

  const { data: itens = [] } = useQuery({
    queryKey: ['aviso-de-prazos', tenantId, user?.id],
    enabled: !!tenantId && !!user?.id,
    staleTime: Infinity,
    queryFn: async () => {
      const [meus, juntos] = await Promise.all([
        supabase.from('tickets').select(CAMPOS).eq('assigned_to', user!.id).in('status', ABERTOS),
        supabase.from('ticket_participantes' as never).select('ticket_id').eq('user_id', user!.id),
      ]);
      const idsJuntos = ((unwrap(juntos) ?? []) as unknown as { ticket_id: string }[]).map((j) => j.ticket_id);
      const deJunto = idsJuntos.length
        ? (unwrap(await supabase.from('tickets').select(CAMPOS).in('id', idsJuntos).in('status', ABERTOS)) ?? [])
        : [];
      const todos = new Map<string, ChamadoDoAviso>();
      for (const t of [...((unwrap(meus) ?? []) as ChamadoDoAviso[]), ...(deJunto as ChamadoDoAviso[])]) todos.set(t.id, t);
      return prazosQuePedemAtencao([...todos.values()], new Date());
    },
  });

  if (fechado || itens.length === 0) return null;
  const vencidos = itens.filter((i) => i.motivo === 'vencido').length;
  const abrir = (id: string) => { setFechado(true); navigate(tenantPath(`/helpdesk/${id}`)); };

  return (
    <Dialog open onOpenChange={(o) => !o && setFechado(true)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-status-danger" aria-hidden="true" />
            {vencidos > 0
              ? `Você tem ${vencidos} chamado${vencidos === 1 ? '' : 's'} com prazo vencido`
              : `Você tem ${itens.length} chamado${itens.length === 1 ? '' : 's'} com prazo perto de vencer`}
          </DialogTitle>
          <DialogDescription>Responda ou resolva estes chamados primeiro. Clique num deles para abrir.</DialogDescription>
        </DialogHeader>
        <ul className="max-h-[50vh] overflow-y-auto divide-y rounded-md border">
          {itens.map((i) => (
            <li key={i.chamado.id}>
              <button type="button" onClick={() => abrir(i.chamado.id)} className="w-full text-left px-3 py-2 hover:bg-muted">
                <span className="block text-sm font-medium">#{i.chamado.ticket_number} · {i.chamado.title}</span>
                <span className={`block text-[13px] ${i.motivo === 'vencido' ? 'text-status-danger font-semibold' : 'text-status-warning'}`}>
                  {FRASE[i.motivo](quandoEmTexto(i.quando))}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => setFechado(true)}>Ver depois</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
