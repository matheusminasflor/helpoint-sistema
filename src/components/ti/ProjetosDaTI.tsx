// TI › Indicadores › Projetos (dono, 2026-11-02, rodada 2): a parte "Demandas — projetos em andamento" da planilha da
// reunião de segunda. Lê o módulo Projetos (os projetos em que a TI participa): em andamento, pendentes e os que
// passaram do término, em vermelho primeiro (Von Restorff); a barra é o % das atividades (gradiente de objetivo).
// É retrato de hoje, não do período.
import { Link } from 'react-router-dom';
import { FolderKanban } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useProjetosDoSetor } from '@/hooks/useProjetos';
import { useTenantPath } from '@/hooks/useTenantPath';
import { diaCurto, todayISO } from '@/lib/dates';
import { diasAlemDoTermino, resumoDosProjetos } from '@/lib/projetos';
import { cn } from '@/lib/utils';

const STATUS: Record<string, { texto: string; classe: string }> = {
  active: { texto: 'Em andamento', classe: 'badge-warning' },
  planned: { texto: 'Pendente', classe: 'badge-neutral' },
};

export function ProjetosDaTI({ id = 'projetos-da-ti' }: { id?: string }) {
  const tenantPath = useTenantPath();
  const { data: projetos = [], isLoading } = useProjetosDoSetor('ti');
  const hoje = todayISO();
  const abertos = projetos
    .filter((p) => p.status === 'active' || p.status === 'planned')
    .map((p) => ({ p, atraso: diasAlemDoTermino(p, hoje) }))
    .sort((a, b) => b.atraso - a.atraso || (a.p.due_date ?? '9999').localeCompare(b.p.due_date ?? '9999'));
  const resumo = resumoDosProjetos(projetos, hoje);

  return (
    <Card id={id} className="p-5 space-y-4 scroll-mt-20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <FolderKanban className="h-4 w-4 text-primary" />Projetos da TI
          <span className="text-xs font-normal text-muted-foreground">· situação de hoje</span>
        </h3>
        <Link to={tenantPath('/projetos')} className="text-xs text-primary hover:underline">Abrir Projetos →</Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { v: resumo.emAndamento, r: 'Em andamento' },
          { v: resumo.pendentes, r: 'Pendentes' },
          { v: resumo.alemDoTermino, r: 'Passaram do término', ruim: resumo.alemDoTermino > 0 },
        ].map((c) => (
          <div key={c.r} className={cn('rounded-lg border p-3 border-t-4', c.ruim ? 'border-t-status-danger' : 'border-t-border')}>
            <div className={cn('text-2xl font-bold font-mono tabular-nums', c.ruim ? 'text-status-danger' : 'text-foreground')}>{c.v}</div>
            <div className="text-[12px] uppercase tracking-wider text-muted-foreground">{c.r}</div>
          </div>
        ))}
      </div>

      {isLoading ? null : abertos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum projeto aberto com a TI. Marque a TI como setor do projeto em Projetos.</p>
      ) : (
        <ul className="divide-y">
          {abertos.map(({ p, atraso }) => (
            // Colunas de largura fixa: cada linha é uma grade própria, e com `auto` elas desalinhavam entre si.
            <li key={p.id} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_130px_110px_170px] items-center gap-x-3 gap-y-1 py-2.5 text-sm">
              <Link to={tenantPath(`/projetos/${p.id}`)} className="font-medium hover:underline min-w-0 break-words">{p.name}</Link>
              {p.total ? (
                <span className="hidden sm:flex items-center gap-2" title={`${p.percentual}% das atividades`}>
                  <span className="h-2 flex-1 rounded-full bg-muted overflow-hidden"><span className="block h-full bg-primary" style={{ width: `${p.percentual}%` }} /></span>
                  <span className="text-xs tabular-nums text-muted-foreground w-9 text-right">{p.percentual}%</span>
                </span>
              ) : <span className="hidden sm:block text-xs text-muted-foreground">sem atividades</span>}
              <Badge variant="outline" className={cn('border-0 justify-self-start', STATUS[p.status ?? '']?.classe)}>{STATUS[p.status ?? '']?.texto}</Badge>
              <span className={cn('text-xs whitespace-nowrap text-right justify-self-end', atraso ? 'badge-danger rounded px-2 py-0.5 font-semibold' : 'text-muted-foreground')}>
                {atraso ? `${atraso} ${atraso === 1 ? 'dia' : 'dias'} além do término` : p.due_date ? `término ${diaCurto(p.due_date)}` : 'sem término'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
