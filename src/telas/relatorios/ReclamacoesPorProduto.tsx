// Reclamação por produto e lote (etapa 5): que produto e que lote geram SAC. Os produtos de cada SAC aberto no período
// (`sac_ticket_products`); quem lê é a policy do SAC. Para a Qualidade.
import { useQuery } from '@tanstack/react-query';
import { PackageX } from 'lucide-react';
import { ModeloDeRelatorio, type ColunaDoRelatorio } from '@/components/relatorios/ModeloDeRelatorio';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePeriodoDoRelatorio } from '@/hooks/usePeriodoDoRelatorio';
import { useQueryState } from '@/hooks/useQueryState';
import { instantesDoIntervalo, type Intervalo } from '@/lib/periodo-do-relatorio';
import { unwrap } from '@/lib/supabase-result';
import { cn } from '@/lib/utils';

interface Produto { product_name: string | null; product_batch: string | null; quantity: number | null; ticket: { id: string; created_at: string } }
interface Agrupada { grupo: string; sacs: number; unidades: number; anterior: number }
type Por = 'produto' | 'lote';

function useProdutosReclamados(intervalo: Intervalo) {
  const { tenantId } = useAuth();
  const { desde, antes } = instantesDoIntervalo(intervalo);
  return useQuery({
    queryKey: ['relatorio', 'reclamacoes-por-produto', tenantId, desde, antes],
    enabled: !!tenantId,
    queryFn: async () => (unwrap(await supabase.from('sac_ticket_products')
      .select('product_name, product_batch, quantity, ticket:sac_tickets!inner(id, created_at)')
      .gte('ticket.created_at', desde).lt('ticket.created_at', antes).limit(5000)) ?? []) as unknown as Produto[],
  });
}

const grupoDe = (por: Por, p: Produto) => {
  const nome = p.product_name?.trim() || '(sem produto)';
  return por === 'produto' ? nome : `${nome} · lote ${p.product_batch?.trim() || '—'}`;
};
const agrupar = (por: Por, ps: Produto[]) => {
  const m = new Map<string, { tickets: Set<string>; unidades: number }>();
  for (const p of ps) {
    const g = grupoDe(por, p);
    const a = m.get(g) ?? { tickets: new Set<string>(), unidades: 0 };
    a.tickets.add(p.ticket.id); a.unidades += Number(p.quantity) || 0;
    m.set(g, a);
  }
  return m;
};

export default function ReclamacoesPorProduto() {
  const periodo = usePeriodoDoRelatorio();
  const [por, setPor] = useQueryState<Por>('por', 'produto');
  const agora = useProdutosReclamados(periodo.atual);
  const antes = useProdutosReclamados(periodo.anterior);
  const mapa = agrupar(por, agora.data ?? []);
  const mapaAntes = agrupar(por, antes.data ?? []);
  const linhas: Agrupada[] = [...mapa].map(([grupo, a]) => ({ grupo, sacs: a.tickets.size, unidades: a.unidades, anterior: mapaAntes.get(grupo)?.tickets.size ?? 0 }))
    .sort((a, b) => b.sacs - a.sacs);
  const sacs = (ps: Produto[] | undefined) => new Set((ps ?? []).map((p) => p.ticket.id)).size;
  const colunas: ColunaDoRelatorio<Agrupada>[] = [
    { chave: 'grupo', rotulo: por === 'produto' ? 'Produto' : 'Produto e lote', valor: (l) => l.grupo },
    { chave: 'sacs', rotulo: 'SACs', valor: (l) => l.sacs, direita: true },
    { chave: 'anterior', rotulo: 'No período anterior', valor: (l) => l.anterior, direita: true },
    { chave: 'unidades', rotulo: 'Unidades reclamadas', valor: (l) => l.unidades, direita: true },
  ];
  return (
    <ModeloDeRelatorio titulo="Reclamação por produto e lote" icone={PackageX} arquivo={`reclamacao-por-${por}`}
      descricao="Que produto e que lote geram SAC: os produtos dos SACs abertos no período."
      periodo={periodo} linhas={linhas} colunas={colunas} chave={(l) => l.grupo} carregando={agora.isLoading} erro={agora.error}
      vazio="Nenhum SAC com produto no período."
      controles={(
        <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Agrupar por">
          {(['produto', 'lote'] as Por[]).map((p) => (
            <button key={p} type="button" onClick={() => setPor(p)} aria-pressed={por === p}
              className={cn('px-3 min-h-9 rounded text-[13px]', por === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
              {p === 'produto' ? 'Por produto' : 'Por lote'}
            </button>
          ))}
        </div>
      )}
      resumo={[
        { rotulo: 'SACs com produto', valor: sacs(agora.data), anterior: sacs(antes.data), formatar: String, melhorQuando: 'menos' },
        { rotulo: por === 'produto' ? 'Produto com mais SAC' : 'Lote com mais SAC', valor: linhas[0]?.sacs ?? null, formatar: String, nota: linhas[0]?.grupo },
        { rotulo: 'Unidades reclamadas', valor: linhas.reduce((s, l) => s + l.unidades, 0), formatar: String, melhorQuando: 'menos' },
      ]} />
  );
}
