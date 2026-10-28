import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';
import { cn } from '@/lib/utils';
import { montarRegua, type PrazoDoDia } from '@/lib/regua-do-dia';

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);

/**
 * A régua do dia (Início "Meu dia", etapa 3, 2026-10-24): o expediente numa linha, o almoço (o prazo pausa nele), o
 * agora e cada prazo de hoje. O expediente é o mais largo entre os setores (`sla_regras_do_setor`, padrão 8h–18h);
 * o almoço é o da pessoa no RH, quando cadastrado.
 */
export function ReguaDoDia({ prazos }: { prazos: PrazoDoDia[] }) {
  const { user, tenantId } = useAuth();
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { data: horario, isError } = useQuery({
    queryKey: ['regua-do-dia', tenantId, user?.id],
    enabled: !!tenantId && !!user?.id,
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const regras = unwrap(await supabase.from('sla_regras_do_setor' as never)
        .select('inicio_expediente, fim_expediente')) as unknown as { inicio_expediente: string | null; fim_expediente: string | null }[];
      const eu = unwrap(await supabase.from('rh_employee_profiles' as never)
        .select('inicio_almoco, fim_almoco').eq('user_id' as never, user!.id as never).maybeSingle()) as unknown as
        { inicio_almoco: string | null; fim_almoco: string | null } | null;
      const inicios = regras.map((r) => hhmm(r.inicio_expediente)).filter(Boolean) as string[];
      const fins = regras.map((r) => hhmm(r.fim_expediente)).filter(Boolean) as string[];
      return {
        inicio: inicios.sort()[0] ?? '08:00',
        fim: fins.sort().at(-1) ?? '18:00',
        almoco: eu?.inicio_almoco && eu?.fim_almoco ? { inicio: hhmm(eu.inicio_almoco)!, fim: hhmm(eu.fim_almoco)! } : null,
      };
    },
  });

  if (isError || !horario) return null;
  const r = montarRegua({ ...horario, agora, prazos });

  return (
    <div className="mt-4" aria-label={`Seu dia: ${r.marcas.length} prazo(s) hoje`}>
      <div className="relative h-8">
        <div className="absolute inset-x-0 top-3 h-2 rounded-full bg-muted" />
        {r.almoco && (
          <div className="absolute top-3 h-2 rounded bg-border" title="Almoço: o prazo pausa"
            style={{ left: `${r.almoco.de}%`, width: `${Math.max(0, r.almoco.ate - r.almoco.de)}%` }} />
        )}
        {r.marcas.map((m) => (
          <div key={m.id} className="absolute top-1.5 -translate-x-1/2 group" style={{ left: `${m.pos}%` }}>
            <span className={cn('block w-3 h-5 rounded-full', m.atrasado ? 'bg-status-danger' : 'bg-primary')}
              title={`${m.rotulo} · ${m.atrasado ? 'venceu' : 'vence'} às ${m.hora}`} />
          </div>
        ))}
        {r.agora !== null && (
          <div className="absolute top-0 bottom-0 -translate-x-1/2 w-0.5 bg-aviso" style={{ left: `${r.agora}%` }} title="Agora" />
        )}
      </div>
      <div className="relative h-4 text-[12px] text-muted-foreground tabular-nums">
        {r.horas.map((h) => (
          <span key={h.rotulo} className="absolute -translate-x-1/2" style={{ left: `${h.pos}%` }}>{h.rotulo}</span>
        ))}
      </div>
    </div>
  );
}
