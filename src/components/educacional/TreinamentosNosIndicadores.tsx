// Os treinamentos nos Indicadores do Educacional (rodada 2, R6): as turmas que começaram no período, com inscritos,
// concluídos (quem pode receber o certificado), faltas, presença e horas. A conta é `indicadoresDeTreinamento`.
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantPath } from '@/hooks/useTenantPath';
import { unwrap } from '@/lib/supabase-result';
import { indicadoresDeTreinamento, type TurmaComInscritos } from '@/lib/indicadores-de-treinamento';
import { fromLocalISODate } from '@/lib/dates';

export function TreinamentosNosIndicadores({ de, ate }: { de: string; ate: string }) {
  const { tenantId } = useAuth();
  const tenantPath = useTenantPath();
  const { data: turmas = [], isLoading } = useQuery({
    queryKey: ['educacional', 'indicadores', tenantId, de, ate], enabled: !!tenantId,
    queryFn: async () => {
      const fim = fromLocalISODate(ate); fim.setDate(fim.getDate() + 1);
      return unwrap(await supabase.from('training_sessions')
        .select('starts_at, training:trainings(title, hours), inscritos:training_enrollments(status, profile_id, customer_profile_id)')
        .gte('starts_at', fromLocalISODate(de).toISOString()).lt('starts_at', fim.toISOString())) as unknown as TurmaComInscritos[];
    },
  });
  const r = indicadoresDeTreinamento(turmas);
  const numeros: [string, string | number][] = [
    ['Turmas no período', r.turmas], ['Inscritos', `${r.inscritos} (${r.internos} da equipe, ${r.clientes} clientes)`],
    ['Concluíram (certificado)', r.concluidos], ['Faltas', r.faltas],
    ['Presença', r.presenca == null ? '—' : `${r.presenca}%`], ['Horas concluídas', r.horasConcluidas.toLocaleString('pt-BR')],
  ];
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><GraduationCap className="h-4 w-4 text-primary" aria-hidden="true" /> Treinamentos</h3>
        <Link to={tenantPath('/educacional/treinamentos')} className="text-xs text-primary hover:underline">Abrir →</Link>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : r.turmas === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma turma começou no período.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {numeros.map(([rotulo, valor]) => (
              <div key={rotulo} className="rounded-lg border border-border p-3">
                <div className="text-lg font-bold font-mono">{valor}</div>
                <div className="text-[12px] uppercase tracking-wider text-muted-foreground">{rotulo}</div>
              </div>
            ))}
          </div>
          <ul className="mt-3 text-sm divide-y divide-border">
            {r.porTreinamento.map((t) => (
              <li key={t.titulo} className="py-1.5 flex gap-3">
                <span className="flex-1 min-w-0 truncate">{t.titulo}</span>
                <span className="text-muted-foreground tabular-nums">{t.turmas} turma(s) · {t.inscritos} inscritos · {t.concluidos} concluíram</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
