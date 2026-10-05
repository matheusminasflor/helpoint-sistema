// "Jornal da empresa" na tela inicial (decisão do dono, 2026-10-04): a notícia principal e as 3
// seguintes, logo abaixo dos avisos. Some quando não há nada no ar. "Ver todas" abre a página Jornal.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Newspaper } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTenantPath } from '@/hooks/useTenantPath';
import { todayISO } from '@/lib/dates';
import { capaDaHome, ROTULO_DO_TIPO } from '@/lib/jornal';
import { useCapas, useNoticias, type Noticia } from '@/hooks/useJornal';
import { LeituraDaNoticia } from '@/components/jornal/LeituraDaNoticia';

const dia = (d: string) => format(new Date(`${d}T12:00:00`), "d 'de' MMM", { locale: ptBR });
/** Um trecho do texto, sem as marcas de formatação. */
const trecho = (texto: string, n = 160) => {
  const limpo = texto.replace(/[#*_>`-]/g, '').replace(/\s+/g, ' ').trim();
  return limpo.length > n ? `${limpo.slice(0, n)}…` : limpo;
};

export function JornalNaHome() {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { data: noticias = [] } = useNoticias();
  const { principal, seguintes } = capaDaHome(noticias, todayISO());
  const { data: capas } = useCapas(principal?.capa_caminho ? [principal.capa_caminho] : []);
  const [aberta, setAberta] = useState<Noticia | null>(null);

  if (!principal) return null;
  const capa = principal.capa_caminho ? capas?.get(principal.capa_caminho) : undefined;

  return (
    <section className="mx-4 mt-4 rounded-lg border bg-card p-3" aria-label="Jornal da empresa">
      <div className="flex items-center gap-2 mb-2">
        <Newspaper className="w-4 h-4 text-primary" aria-hidden="true" />
        <h3 className="text-[13px] font-semibold text-foreground flex-1">Jornal da empresa</h3>
        <Button variant="ghost" size="sm" className="h-7 text-[12px]" onClick={() => navigate(tenantPath('/jornal'))}>Ver todas</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-5">
        <button type="button" onClick={() => setAberta(principal)}
          className="md:col-span-3 text-left rounded-md overflow-hidden border hover:bg-muted/40 transition-colors">
          {capa && <img src={capa} alt="" className="w-full h-40 object-cover" />}
          <div className="p-3 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{ROTULO_DO_TIPO[principal.tipo] ?? principal.tipo}</Badge>
              <span className="text-[12px] text-muted-foreground">{dia(principal.data_noticia)}</span>
            </div>
            <p className="font-semibold text-foreground">{principal.titulo}</p>
            <p className="text-[13px] text-muted-foreground">{trecho(principal.texto)}</p>
          </div>
        </button>
        {seguintes.length > 0 && (
          <ul className="md:col-span-2 space-y-1">
            {seguintes.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => setAberta(n)} className="w-full text-left rounded-md px-2 py-1.5 hover:bg-muted/40">
                  <span className="block text-[13px] font-medium text-foreground">{n.titulo}</span>
                  <span className="block text-[11px] text-muted-foreground">{ROTULO_DO_TIPO[n.tipo] ?? n.tipo} · {dia(n.data_noticia)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <LeituraDaNoticia noticia={aberta} capa={aberta?.id === principal.id ? capa : undefined} onClose={() => setAberta(null)} />
    </section>
  );
}
