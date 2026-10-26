// Os termos de responsabilidade nos Indicadores da TI (rodada 2, R6): quantos estão esperando a assinatura (termo
// gerado sem o assinado anexado) e quantas devoluções de desligamento ainda não terminaram (a checagem de devolução sem
// o termo de devolução — é ela que trava o chamado de desligamento, `ti_checagem_trava_o_chamado`).
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileSignature } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useTermos } from '@/hooks/useTermos';
import { unwrap } from '@/lib/supabase-result';

export function TermosNosIndicadores() {
  const { tenantId } = useAuth();
  const tenantPath = useTenantPath();
  const { data: termos = [] } = useTermos();
  const { data: devolucoes = [] } = useQuery({
    queryKey: ['ti-devolucoes-abertas', tenantId], enabled: !!tenantId,
    queryFn: async () => unwrap(await supabase.from('ti_checagens' as never).select('id, colaborador_nome, ticket_id')
      .eq('tipo' as never, 'devolucao' as never).is('termo_path' as never, null)) as unknown as { id: string; colaborador_nome: string | null; ticket_id: string | null }[],
  });
  const conta = (s: string) => termos.filter((t) => t.status === s).length;
  const numeros: [string, number, string][] = [
    ['Falta assinar', conta('aguardando_assinatura'), 'text-status-warning'],
    ['Falta devolver', devolucoes.length, 'text-status-danger'],
    ['Assinados (em uso)', conta('assinado'), 'text-foreground'],
    ['Devolvidos', conta('devolvido'), 'text-muted-foreground'],
  ];
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <FileSignature className="h-4 w-4 text-primary" aria-hidden="true" /> Termos de responsabilidade
        </h3>
        <Link to={tenantPath('/ti/termos')} className="text-xs text-primary hover:underline">Ver os termos →</Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {numeros.map(([rotulo, n, cor]) => (
          <div key={rotulo} className="rounded-lg border border-border p-3">
            <div className={`text-2xl font-bold font-mono ${cor}`}>{n}</div>
            <div className="text-[12px] uppercase tracking-wider text-muted-foreground">{rotulo}</div>
          </div>
        ))}
      </div>
      {devolucoes.length > 0 && (
        <p className="text-[13px] text-muted-foreground mt-3">
          Devolução em aberto: {devolucoes.map((d) => d.colaborador_nome || 'sem nome').join(', ')}. O chamado de desligamento só
          se resolve depois do termo de devolução anexado.
        </p>
      )}
    </Card>
  );
}
