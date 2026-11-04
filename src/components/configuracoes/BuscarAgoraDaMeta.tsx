import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { CHAVE_DAS_SEMANAS } from '@/hooks/useRedesETrafego';
import { cn } from '@/lib/utils';

/** Chama o coletor da Meta (`mkt-meta-coletar`) para esta semana e a anterior, sem esperar o robô. `icone`: só o ↻ do selo. */
export function BuscarAgoraDaMeta({ icone = false }: { icone?: boolean }) {
  const qc = useQueryClient();
  const buscar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('mkt-meta-coletar', { body: { source: 'botao' } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { erros?: string[] };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: [CHAVE_DAS_SEMANAS] });
      qc.invalidateQueries({ queryKey: ['mkt-meta-ligacao'] });
      // A busca leva uns 20 s; o aviso fica 10 s (15 s quando há aviso ou erro) para não passar despercebido (dono,
      // 2026-11-04: "não notificou").
      if (r.erros?.length) toast.warning(`Buscou, com avisos: ${r.erros.join(' · ')}`, { duration: 15000 });
      else toast.success('Números da Meta atualizados.', { duration: 10000 });
    },
    onError: (e: Error) => toast.error(`A busca falhou: ${e.message}`, { duration: 15000 }),
  });
  const girando = <RefreshCw className={cn('h-3.5 w-3.5', !icone && 'mr-1', buscar.isPending && 'animate-spin')} aria-hidden="true" />;
  if (icone) {
    return (
      <button type="button" className="rounded p-0.5 hover:bg-muted disabled:opacity-60" disabled={buscar.isPending}
        aria-label="Buscar os números da Meta agora" title="Buscar agora (uns 20 segundos)" onClick={() => buscar.mutate()}>
        {girando}
      </button>
    );
  }
  return (
    <Button size="sm" onClick={() => buscar.mutate()} disabled={buscar.isPending}>
      {girando}{buscar.isPending ? 'Buscando… (uns 20 segundos)' : 'Buscar agora'}
    </Button>
  );
}
