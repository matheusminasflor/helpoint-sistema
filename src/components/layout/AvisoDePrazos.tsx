// O aviso de prazos (dono, 2026-10-15; faixa no topo desde 2026-10-24),
// só para quem atende chamado com prazo vencido ou prestes a vencer. A regra é `prazosQuePedemAtencao`.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantPath } from '@/hooks/useTenantPath';
import { unwrap } from '@/lib/supabase-result';
import { todayISO } from '@/lib/dates';
import { prazosQuePedemAtencao, type ChamadoDoAviso, type Motivo } from '@/lib/prazos-do-aviso';

const CAMPOS = 'id, ticket_number, title, status, sla_due_at, first_response_due_at, first_response_at, agendou_vencido';
const ABERTOS = ['open', 'in_progress', 'scheduled'] as const;

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

// "Ver depois" vale para o dia (proposta "Helpoint no dia a dia", Início, 2026-10-24: "o aviso de prazo vira uma faixa
// no topo, uma vez por dia, com Abrir em cada item"). Era uma janela que voltava a cada recarga. O dia fica guardado no
// navegador da pessoa; sem acesso ao armazenamento (aba anônima), vale até recarregar.
const fechadoNestaCarga = new Set<string>();
const chaveDoDia = (user: string) => `aviso-de-prazos:${user}:${todayISO()}`;
const fechadoHoje = (user: string) => {
  if (fechadoNestaCarga.has(user)) return true;
  try { return localStorage.getItem(chaveDoDia(user)) === '1'; } catch { return false; }
};
const fecharHoje = (user: string) => {
  fechadoNestaCarga.add(user);
  try { localStorage.setItem(chaveDoDia(user), '1'); } catch { /* sem armazenamento: vale a carga */ }
};

export function AvisoDePrazos() {
  const { user, tenantId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const tenantPath = useTenantPath();
  const [fechadoAgora, setFechadoAgora] = useState(false);
  const fechado = fechadoAgora || (!!user?.id && fechadoHoje(user.id));
  const setFechado = (v: boolean) => { if (v && user?.id) fecharHoje(user.id); setFechadoAgora(v); };

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
      for (const t of [...((unwrap(meus) ?? []) as unknown as ChamadoDoAviso[]), ...(deJunto as unknown as ChamadoDoAviso[])]) todos.set(t.id, t);
      return prazosQuePedemAtencao([...todos.values()], new Date());
    },
  });

  // Rodada 3 (desenho aprovado): só no Início, numa linha — antes se repetia no topo de TODA tela e comia 1/4 do
  // celular. A linha diz quantos e abre o mais urgente; a lista inteira está logo abaixo, no próprio Início.
  const noInicio = /\/inicio\/?$/.test(location.pathname) || location.pathname === '/';
  if (!noInicio || fechado || itens.length === 0) return null;
  const vencidos = itens.filter((i) => i.motivo === 'vencido').length;
  const primeiro = itens[0];
  const texto = vencidos > 0
    ? `${vencidos} chamado${vencidos === 1 ? '' : 's'} com prazo vencido`
    : `${itens.length} chamado${itens.length === 1 ? '' : 's'} com prazo perto de vencer`;

  return (
    <div role="status" className="mx-4 sm:mx-6 mt-3 rounded-xl bg-[hsl(var(--estado-atraso-bg))] text-[hsl(var(--estado-atraso-fg))] pl-3.5 pr-1.5 py-1.5 flex items-center gap-2">
      <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
      <p className="flex-1 min-w-0 text-[14px] font-semibold truncate" title={`#${primeiro.chamado.ticket_number} · ${primeiro.chamado.title} · ${FRASE[primeiro.motivo](quandoEmTexto(primeiro.quando))}`}>
        {texto}
      </p>
      <Button size="sm" variant="ghost" className="h-8 px-2 shrink-0 font-semibold text-inherit hover:bg-[hsl(var(--estado-atraso-ponto)/0.12)]"
        onClick={() => navigate(tenantPath(`/helpdesk/${primeiro.chamado.id}`))}>Abrir ›</Button>
      <Button size="icon" variant="ghost" aria-label="Ver depois" title="Ver depois (volta amanhã)"
        className="h-8 w-8 shrink-0 text-inherit hover:bg-[hsl(var(--estado-atraso-ponto)/0.12)]" onClick={() => setFechado(true)}>
        <X className="w-4 h-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
