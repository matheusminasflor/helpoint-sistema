// TODOS OS AVISOS (proposta "Helpoint no dia a dia", Início, 2026-10-24): o "Lyra avisa" mostra 8, e não havia onde ver o
// resto. Aqui ficam todos, agrupados por chamado ("#123: 3 novidades"), com o filtro não lidos × todos.
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useQueryState } from '@/hooks/useQueryState';
import { useVisibleModules } from '@/hooks/useVisibleModules';
import { podeAcessarDiretoria } from '@/lib/acesso-diretoria';
import { destinoDoAviso } from '@/lib/destino-do-aviso';
import { expectRows, unwrap } from '@/lib/supabase-result';
import { dataHora } from '@/lib/dates';
import { cn } from '@/lib/utils';
import type { Notification } from '@/hooks/useNotifications';

interface Grupo { chave: string; avisos: Notification[]; naoLidos: number }

export default function TodosOsAvisos() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useQueryState<'nao-lidos' | 'todos'>('mostrar', 'nao-lidos');
  const { showDiretoria, isManagerOrHigher } = useVisibleModules();
  const entraNaDiretoria = podeAcessarDiretoria(showDiretoria, isManagerOrHigher);

  const { data: avisos = [], isLoading, isError } = useQuery({
    queryKey: ['notifications', user?.id, 'todos'],
    enabled: !!user?.id,
    queryFn: async () => (unwrap(await supabase.from('notifications').select('*')
      .order('created_at', { ascending: false }).limit(300)) ?? []) as Notification[],
  });

  const grupos = useMemo(() => {
    const porChave = new Map<string, Grupo>();
    for (const a of avisos) {
      if (filtro === 'nao-lidos' && a.is_read) continue;
      const chave = a.reference_type === 'ticket' && a.reference_id ? `ticket:${a.reference_id}` : `aviso:${a.id}`;
      const g = porChave.get(chave) ?? { chave, avisos: [], naoLidos: 0 };
      g.avisos.push(a);
      if (!a.is_read) g.naoLidos++;
      porChave.set(chave, g);
    }
    return [...porChave.values()];
  }, [avisos, filtro]);

  const marcarLidos = useMutation({
    mutationFn: async (ids: string[]) => {
      expectRows(await supabase.from('notifications').update({ is_read: true }).in('id', ids).select('id'), 'os avisos lidos');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const abrir = (g: Grupo) => {
    const naoLidos = g.avisos.filter((a) => !a.is_read).map((a) => a.id);
    if (naoLidos.length) marcarLidos.mutate(naoLidos);
    const destino = destinoDoAviso(g.avisos[0], entraNaDiretoria);
    if (destino) navigate(tenantPath(destino));
  };
  const todosNaoLidos = avisos.filter((a) => !a.is_read).map((a) => a.id);

  return (
    <div className="flex flex-col h-full">
      <PageHeader icon={Bell} title="Todos os avisos" description="As movimentações que chegaram para você, agrupadas por chamado."
        actions={todosNaoLidos.length > 0 && (
          <Button variant="outline" size="sm" className="gap-1.5" disabled={marcarLidos.isPending}
            onClick={() => marcarLidos.mutate(todosNaoLidos)}>
            <CheckCheck className="w-4 h-4" aria-hidden="true" /> Marcar todos como lidos
          </Button>
        )} />
      <div className="p-4 lg:p-6 max-w-3xl space-y-3">
        <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Quais avisos">
          {(['nao-lidos', 'todos'] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFiltro(f)} aria-pressed={filtro === f}
              className={cn('px-3 min-h-9 rounded text-[13px]', filtro === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
              {f === 'nao-lidos' ? `Não lidos (${todosNaoLidos.length})` : 'Todos'}
            </button>
          ))}
        </div>
        {isLoading ? <p className="text-[14px] text-muted-foreground">Carregando…</p>
          : isError ? <p className="text-[14px] text-status-danger">Não consegui carregar os avisos. Atualize a página.</p>
          : grupos.length === 0 ? <p className="text-[14px] text-muted-foreground">{filtro === 'nao-lidos' ? 'Nenhum aviso por ler.' : 'Nenhum aviso.'}</p>
          : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {grupos.map((g) => {
                const ultimo = g.avisos[0];
                return (
                  <li key={g.chave}>
                    <button type="button" onClick={() => abrir(g)} className="w-full text-left px-4 py-3 hover:bg-secondary flex gap-3">
                      <span className={cn('mt-1.5 w-2 h-2 rounded-full shrink-0', g.naoLidos ? 'bg-foreground' : 'bg-transparent')} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-medium truncate">{ultimo.title}</span>
                        <span className="block text-[13px] text-muted-foreground truncate">{ultimo.message}</span>
                        <span className="block text-[12px] text-muted-foreground tabular-nums mt-0.5">
                          {dataHora(ultimo.created_at)}
                          {g.avisos.length > 1 && ` · ${g.avisos.length} novidades${g.naoLidos ? ` (${g.naoLidos} não lida${g.naoLidos === 1 ? '' : 's'})` : ''}`}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
      </div>
    </div>
  );
}
