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
import { useImagemDoDestaque, useNoticias, type Noticia } from '@/hooks/useJornal';
import { LeituraDaNoticia } from '@/components/jornal/LeituraDaNoticia';
import { cn } from '@/lib/utils';

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
  const imagem = useImagemDoDestaque(principal);
  const [aberta, setAberta] = useState<Noticia | null>(null);

  // Sem destaque marcado não há cartão grande, só a lista (dono, 2026-10-21).
  if (!principal && seguintes.length === 0) return null;
  const capa = imagem.url;

  return (
    <section className="mx-4 mt-4 rounded-lg border bg-card p-3" aria-label="Notícias">
      <div className="flex items-center gap-2 mb-2">
        <Newspaper className="w-4 h-4 text-primary" aria-hidden="true" />
        <h3 className="text-[14px] font-semibold text-foreground flex-1">Notícias</h3>
        <Button variant="ghost" size="sm" className="h-7 text-[13px]" onClick={() => navigate(tenantPath('/jornal'))}>Ver todas</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-5">
        {/* Sem outras notícias ao lado, o destaque ocupa a largura toda e a capa (1600 × 900) vai de um canto
            ao outro (dono, 2026-10-09: encostada à esquerda com um vazio do lado ficava feia). */}
        {principal && <button type="button" onClick={() => setAberta(principal)}
          className={cn('text-left rounded-md overflow-hidden border hover:bg-muted/40 transition-colors',
            seguintes.length > 0 ? 'md:col-span-3' : 'md:col-span-5')}>
          {capa && (imagem.inteira
            ? <img src={capa} alt="" className="block mx-auto max-h-[420px] w-auto max-w-full object-contain" />
            : <img src={capa} alt="" className="block w-full aspect-video object-cover object-center" />)}
          <div className="p-3 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{ROTULO_DO_TIPO[principal.tipo] ?? principal.tipo}</Badge>
              <span className="text-[13px] text-muted-foreground">{dia(principal.data_noticia)}</span>
            </div>
            <p className="font-semibold text-foreground">{principal.titulo}</p>
            <p className="text-[14px] text-muted-foreground">{trecho(principal.texto)}</p>
          </div>
        </button>}
        {seguintes.length > 0 && (
          <ul className={cn('space-y-1', principal ? 'md:col-span-2' : 'md:col-span-5')}>
            {seguintes.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => setAberta(n)} className="w-full text-left rounded-md px-2 py-1.5 hover:bg-muted/40">
                  <span className="block text-[14px] font-medium text-foreground">{n.titulo}</span>
                  <span className="block text-[12px] text-muted-foreground">{ROTULO_DO_TIPO[n.tipo] ?? n.tipo} · {dia(n.data_noticia)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <LeituraDaNoticia noticia={aberta} capa={principal && aberta?.id === principal.id && !imagem.inteira ? capa : undefined} onClose={() => setAberta(null)} />
    </section>
  );
}
