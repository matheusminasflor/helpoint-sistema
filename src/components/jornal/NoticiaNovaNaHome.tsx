import { useNavigate } from 'react-router-dom';
import { ArrowRight, Newspaper } from 'lucide-react';
import { useTenantPath } from '@/hooks/useTenantPath';
import { todayISO } from '@/lib/dates';
import { capaDaHome } from '@/lib/jornal';
import { useLeituraDaNoticia, useNoticias } from '@/hooks/useJornal';

/** A faixa roxa do topo do Início (proposta de 2026-11-04, Parte 1): a notícia que falta ler. Lida, some e fica nas Notícias do fim. */
export function NoticiaNovaNaHome() {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { data: noticias = [] } = useNoticias();
  const { nova } = useLeituraDaNoticia();
  const { principal, seguintes } = capaDaHome(noticias, todayISO());
  const novas = (principal ? [principal, ...seguintes] : seguintes).filter(nova);
  if (novas.length === 0) return null;
  const [n] = novas;
  return (
    <button type="button" onClick={() => navigate(tenantPath(`/jornal/${n.id}`))}
      className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-primary px-4 py-3 text-left text-primary-foreground transition-colors hover:bg-primary/90 sm:px-6">
      <Newspaper className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="text-[13px] font-bold">Notícia nova{novas.length > 1 ? ` · ${novas.length} não lidas` : ''}</span>
      <span className="min-w-0 flex-1 basis-60 truncate text-[15px] font-semibold">{n.titulo}</span>
      <span className="flex shrink-0 items-center gap-1 text-[14px] font-bold">Ler agora <ArrowRight className="h-4 w-4" aria-hidden="true" /></span>
    </button>
  );
}
