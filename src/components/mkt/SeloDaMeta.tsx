import { Link } from 'react-router-dom';
import { BuscarAgoraDaMeta } from '@/components/configuracoes/BuscarAgoraDaMeta';
import { useTenantPath } from '@/hooks/useTenantPath';
import { metaParada, type LigacaoMeta } from '@/hooks/useLigacaoMeta';
import { toLocalISODate } from '@/lib/dates';
import { cn } from '@/lib/utils';

const quando = (iso: string) => {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return toLocalISODate(d) === toLocalISODate(new Date()) ? `hoje, ${hora}` : `${d.toLocaleDateString('pt-BR')}, ${hora}`;
};

/** "Meta: dados de hoje, 15:55 ↻", colado ao título; vermelho quando a ligação parou (leva a Integrações, para quem abre). */
export function SeloDaMeta({ meta, podeBuscar }: { meta: LigacaoMeta | null | undefined; podeBuscar: boolean }) {
  const tenantPath = useTenantPath();
  if (meta === undefined) return null;
  const parada = !meta || metaParada(meta);
  const texto = !meta ? 'Meta: não conectada' : `Meta: dados de ${meta.coletado_em ? quando(meta.coletado_em) : 'nenhuma busca'}`;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium',
      parada ? 'badge-danger' : 'bg-muted text-muted-foreground')} title={meta?.ultimo_erro ?? undefined}>
      {parada && podeBuscar ? <Link to={tenantPath('/configuracoes/integracoes')} className="hover:underline">{texto}</Link> : texto}
      {meta && podeBuscar && <BuscarAgoraDaMeta icone />}
    </span>
  );
}
