// As peças do mural de Notícias (dono, 2026-10-30: "não está atrativo, refaça usando as Leis de UX"), usadas no Início
// e na página Notícias:
//  * a cor e o ícone dizem o tipo antes de ler (Von Restorff, e cor com significado): aviso em laranja, feriado em
//    verde, aniversário em rosa, festa em roxo, novo colaborador em azul;
//  * todo cartão tem imagem — a da notícia, ou um quadro na cor do tipo; nunca o vazio azul de antes (estética-
//    usabilidade);
//  * "Nova" no que a pessoa ainda não abriu (Zeigarnik);
//  * o cartão inteiro é o botão (Fitts).
import type { ReactNode } from 'react';
import { CalendarDays, Cake, Megaphone, Newspaper, PartyPopper, Sparkles, UserPlus, type LucideIcon } from 'lucide-react';
import { quandoFoi, ROTULO_DO_TIPO, trecho, type TipoDeNoticia } from '@/lib/jornal';
import { todayISO } from '@/lib/dates';
import type { ImagemDaNoticia, Noticia } from '@/hooks/useJornal';
import { cn } from '@/lib/utils';

const ESTILO_DO_TIPO: Record<TipoDeNoticia, { icone: LucideIcon; classe: string }> = {
  aviso: { icone: Megaphone, classe: 'badge-warning' },
  novo_colaborador: { icone: UserPlus, classe: 'badge-info' },
  aniversario: { icone: Cake, classe: 'setor-marketing' },
  feriado: { icone: CalendarDays, classe: 'badge-success' },
  festa_evento: { icone: PartyPopper, classe: 'badge-purple' },
  outros: { icone: Newspaper, classe: 'badge-neutral' },
  atualizacao_sistema: { icone: Sparkles, classe: 'badge-info' },
};
const estiloDe = (tipo: string) => ESTILO_DO_TIPO[tipo as TipoDeNoticia] ?? ESTILO_DO_TIPO.outros;

export function SeloDoTipo({ tipo, className }: { tipo: string; className?: string }) {
  const { icone: Icone, classe } = estiloDe(tipo);
  return (
    <span className={cn('estado', classe, className)}>
      <Icone className="w-3.5 h-3.5" aria-hidden="true" />
      {ROTULO_DO_TIPO[tipo as TipoDeNoticia] ?? tipo}
    </span>
  );
}

export const SeloNova = () => <span className="estado bg-primary text-primary-foreground">Nova</span>;

/**
 * A imagem na moldura que quem chama dá (`className`, com a proporção). A capa enche a moldura; a imagem anexada
 * (`inteira`: um cartaz, um print) aparece sem corte, sobre ela mesma desfocada — sem as faixas vazias dos lados.
 */
export function ImagemDaNoticiaNoCartao({ imagem, tipo, className }: { imagem: ImagemDaNoticia; tipo: string; className?: string }) {
  if (!imagem.url) {
    const { icone: Icone, classe } = estiloDe(tipo);
    return (
      <span className={cn('flex items-center justify-center', classe, className)} aria-hidden="true">
        <Icone className="w-12 h-12 opacity-80" strokeWidth={1.5} />
      </span>
    );
  }
  return (
    <span className={cn('relative block overflow-hidden bg-muted', className)}>
      {imagem.inteira && <img src={imagem.url} alt="" aria-hidden="true" loading="lazy" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-2xl" />}
      <img src={imagem.url} alt="" loading="lazy" className={cn('relative h-full w-full', imagem.inteira ? 'object-contain' : 'object-cover')} />
    </span>
  );
}

/** O cartão da grade: imagem em cima, tipo, título, trecho e data. `rodape` é das ações de quem cuida do Jornal. */
export function CartaoDaNoticia({ noticia, imagem, nova, onAbrir, extra, rodape }: {
  noticia: Noticia; imagem: ImagemDaNoticia; nova: boolean; onAbrir: () => void; extra?: ReactNode; rodape?: ReactNode;
}) {
  return (
    <li className="panel group flex flex-col overflow-hidden transition-shadow hover:shadow-lg">
      <button type="button" onClick={onAbrir} className="flex flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ImagemDaNoticiaNoCartao imagem={imagem} tipo={noticia.tipo} className="aspect-video w-full" />
        <span className="flex flex-1 flex-col gap-2 px-5 pt-4 pb-4">
          <span className="flex flex-wrap items-center gap-2">
            <SeloDoTipo tipo={noticia.tipo} />
            {nova && <SeloNova />}
          </span>
          <span className="block text-[17px] font-bold leading-snug text-foreground line-clamp-2 group-hover:text-primary">{noticia.titulo}</span>
          {extra}
          <span className="block text-[14px] text-muted-foreground line-clamp-2">{trecho(noticia.texto, 140)}</span>
          <span className="mt-auto block pt-1 text-[13px] font-semibold text-muted-foreground">
            {quandoFoi(noticia.data_noticia, todayISO())}{noticia.autor?.full_name ? ` · ${noticia.autor.full_name}` : ''}
          </span>
        </span>
      </button>
      {rodape && <div className="border-t px-5 py-2">{rodape}</div>}
    </li>
  );
}

/** A linha da lista ao lado do destaque: miniatura, tipo, título e data. */
export function LinhaDaNoticia({ noticia, imagem, nova, onAbrir }: { noticia: Noticia; imagem: ImagemDaNoticia; nova: boolean; onAbrir: () => void }) {
  return (
    <li>
      <button type="button" onClick={onAbrir}
        className="group flex w-full items-start gap-3 rounded-xl p-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ImagemDaNoticiaNoCartao imagem={imagem} tipo={noticia.tipo} className="aspect-video w-28 shrink-0 rounded-lg sm:w-32 [&_svg]:h-7 [&_svg]:w-7" />
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <SeloDoTipo tipo={noticia.tipo} />
            {nova && <SeloNova />}
          </span>
          <span className="block text-[15px] font-bold leading-snug text-foreground line-clamp-2 group-hover:text-primary">{noticia.titulo}</span>
          <span className="block text-[13px] font-semibold text-muted-foreground">{quandoFoi(noticia.data_noticia, todayISO())}</span>
        </span>
      </button>
    </li>
  );
}

/**
 * O destaque: a maior coisa do mural (Von Restorff). Com `deLado`, imagem à esquerda e texto à direita — quando ele
 * ocupa a largura toda, sem a lista ao lado; senão imagem em cima.
 */
export function DestaqueDaNoticia({ noticia, imagem, nova, onAbrir, deLado, className }: {
  noticia: Noticia; imagem: ImagemDaNoticia; nova: boolean; onAbrir: () => void; deLado?: boolean; className?: string;
}) {
  return (
    <button type="button" onClick={onAbrir}
      className={cn('group block w-full overflow-hidden rounded-2xl border bg-card text-left transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        deLado && 'md:grid md:grid-cols-5', className)}>
      <ImagemDaNoticiaNoCartao imagem={imagem} tipo={noticia.tipo} className={cn('aspect-video w-full', deLado && 'md:col-span-3 md:h-full')} />
      <span className={cn('flex flex-col gap-3 p-5 sm:p-6', deLado && 'md:col-span-2 md:justify-center')}>
        <span className="flex flex-wrap items-center gap-2">
          <span className="estado badge-info">★ Em destaque</span>
          <SeloDoTipo tipo={noticia.tipo} />
          {nova && <SeloNova />}
        </span>
        <span className="block text-[22px] font-extrabold leading-tight text-foreground line-clamp-3 group-hover:text-primary sm:text-[26px]">{noticia.titulo}</span>
        <span className="block text-[15px] text-muted-foreground line-clamp-3">{trecho(noticia.texto)}</span>
        <span className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="text-[13px] font-semibold text-muted-foreground">{quandoFoi(noticia.data_noticia, todayISO())}{noticia.autor?.full_name ? ` · ${noticia.autor.full_name}` : ''}</span>
          <span className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-[14px] font-bold text-primary-foreground">Ler a notícia →</span>
        </span>
      </span>
    </button>
  );
}
