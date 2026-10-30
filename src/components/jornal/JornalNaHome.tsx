// "Jornal da empresa" na tela inicial (decisão do dono, 2026-10-04): a notícia principal e as 3
// seguintes, logo abaixo dos avisos. Some quando não há nada no ar. "Ver todas" abre a página Jornal.
// Redesenhado em 2026-10-30 (dono: "não está atrativo"): o destaque grande com imagem, as seguintes com miniatura e a
// cor do tipo, "Nova" no que falta ler — as peças em `CartaoDaNoticia.tsx`.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Newspaper } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTenantPath } from '@/hooks/useTenantPath';
import { todayISO } from '@/lib/dates';
import { capaDaHome } from '@/lib/jornal';
import { useImagensDasNoticias, useLeituraDaNoticia, useNoticias, type Noticia } from '@/hooks/useJornal';
import { LeituraDaNoticia } from '@/components/jornal/LeituraDaNoticia';
import { CartaoDaNoticia, DestaqueDaNoticia, LinhaDaNoticia } from '@/components/jornal/CartaoDaNoticia';

export function JornalNaHome() {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { data: noticias = [] } = useNoticias();
  const { principal, seguintes } = capaDaHome(noticias, todayISO());
  const todas = principal ? [principal, ...seguintes] : seguintes;
  const imagemDe = useImagensDasNoticias(todas);
  const { nova, ler } = useLeituraDaNoticia();
  const [aberta, setAberta] = useState<Noticia | null>(null);
  const abrir = (n: Noticia) => { setAberta(n); ler(n.id); };

  // Sem destaque marcado não há cartão grande, só os cartões (dono, 2026-10-21).
  if (todas.length === 0) return null;
  const novas = todas.filter(nova).length;
  const imagemDaAberta = aberta ? imagemDe(aberta) : undefined;

  return (
    <section className="panel px-4 py-5 sm:px-6" aria-label="Notícias">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10" aria-hidden="true">
          <Newspaper className="h-5 w-5 text-primary" />
        </span>
        <h3 className="text-[22px] font-bold text-foreground">Notícias</h3>
        {novas > 0 && <span className="estado bg-primary text-primary-foreground">{novas === 1 ? '1 nova' : `${novas} novas`}</span>}
        <Button variant="ghost" size="sm" className="ml-auto h-9 gap-1 text-[14px] font-semibold text-primary" onClick={() => navigate(tenantPath('/jornal'))}>
          Ver todas <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {principal ? (
        <div className="grid gap-5 lg:grid-cols-5">
          <DestaqueDaNoticia noticia={principal} imagem={imagemDe(principal)} nova={nova(principal)} onAbrir={() => abrir(principal)}
            deLado={seguintes.length === 0} className={seguintes.length > 0 ? 'lg:col-span-3' : 'lg:col-span-5'} />
          {seguintes.length > 0 && (
            <div className="lg:col-span-2">
              <p className="mb-1 px-2 text-[13px] font-bold uppercase tracking-wide text-muted-foreground">Mais notícias</p>
              <ul className="space-y-1">
                {seguintes.map((n) => <LinhaDaNoticia key={n.id} noticia={n} imagem={imagemDe(n)} nova={nova(n)} onAbrir={() => abrir(n)} />)}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {seguintes.map((n) => <CartaoDaNoticia key={n.id} noticia={n} imagem={imagemDe(n)} nova={nova(n)} onAbrir={() => abrir(n)} />)}
        </ul>
      )}

      <LeituraDaNoticia noticia={aberta} capa={imagemDaAberta && !imagemDaAberta.inteira ? imagemDaAberta.url : undefined} onClose={() => setAberta(null)} />
    </section>
  );
}
