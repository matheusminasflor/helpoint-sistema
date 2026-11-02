// O modo apresentação dos Indicadores (dono, 2026-11-02, rodada 2: "ter opção Full Screen modo apresentação"). Tela
// cheia, sem menu nem filtros, uma tela por vez com letra maior (Lei de Miller: um assunto por tela). Avança com a seta,
// a barra de espaço ou clicando num lugar vazio; o alvo de clique é a tela inteira (Lei de Fitts). Esc sai. Os
// números são os mesmos da Visão Geral: cada tela recebe os componentes prontos.
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface TelaDaApresentacao { titulo: string; conteudo: ReactNode }

export function ModoApresentacao({ telas, subtitulo, onSair }: { telas: TelaDaApresentacao[]; subtitulo: string; onSair: () => void }) {
  const [i, setI] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const ir = useCallback((passo: number) => setI((atual) => Math.min(telas.length - 1, Math.max(0, atual + passo))), [telas.length]);

  // `onSair` do pai muda a cada render; a referência evita pedir tela cheia de novo a cada número que chega.
  const aoSair = useRef(onSair);
  aoSair.current = onSair;
  const sair = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    aoSair.current();
  }, []);

  useEffect(() => {
    // Tela cheia é um pedido: o navegador pode negar (celular, app); aí fica a camada sobre a página, que já basta.
    raiz.current?.requestFullscreen?.().catch(() => undefined);
    // Sair da tela cheia pelo próprio navegador (Esc do Chrome) também fecha o modo.
    const saiuDaTelaCheia = () => { if (!document.fullscreenElement) aoSair.current(); };
    document.addEventListener('fullscreenchange', saiuDaTelaCheia);
    return () => document.removeEventListener('fullscreenchange', saiuDaTelaCheia);
  }, []);

  useEffect(() => {
    const teclas = (e: KeyboardEvent) => {
      if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); ir(1); }
      else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); ir(-1); }
      else if (e.key === 'Escape') sair();
    };
    window.addEventListener('keydown', teclas);
    return () => window.removeEventListener('keydown', teclas);
  }, [ir, sair]);

  // Clicar num lugar vazio avança; link, botão e o que abre (categorias) continuam funcionando.
  const clicar = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('a, button, [role="button"], input, select, label')) return;
    ir(1);
  };

  const tela = telas[i];
  return (
    <div ref={raiz} role="dialog" aria-modal="true" aria-label={`Apresentação: ${tela.titulo}`}
      className="fixed inset-0 z-[100] flex flex-col bg-background text-foreground">
      <header className="flex items-center justify-between gap-4 px-6 pt-5 pb-2 lg:px-12">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Indicadores da TI · {subtitulo}</p>
          <h2 className="text-2xl font-bold lg:text-4xl">{tela.titulo}</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={sair} aria-label="Sair da apresentação (Esc)"><X className="h-6 w-6" /></Button>
      </header>
      {/* `zoom` aumenta tudo junto (números, barras, letras) sem reescrever os componentes da Visão Geral. */}
      <main className="flex-1 overflow-auto px-6 pb-4 lg:px-12 cursor-pointer" onClick={clicar}>
        <div className="mx-auto max-w-6xl py-4" style={{ zoom: 1.2 }}>{tela.conteudo}</div>
      </main>
      <footer className="flex items-center justify-between gap-4 border-t px-6 py-3 lg:px-12">
        <Button variant="outline" size="lg" onClick={() => ir(-1)} disabled={i === 0}><ChevronLeft className="h-5 w-5 mr-1" />Anterior</Button>
        <div className="flex items-center gap-2" aria-label={`Tela ${i + 1} de ${telas.length}`}>
          {telas.map((t, n) => (
            <button key={t.titulo} type="button" onClick={() => setI(n)} aria-label={`Ir para ${t.titulo}`}
              className={n === i ? 'h-2.5 w-8 rounded-full bg-primary' : 'h-2.5 w-2.5 rounded-full bg-muted-foreground/30 hover:bg-muted-foreground/60'} />
          ))}
          <span className="ml-2 text-sm tabular-nums text-muted-foreground">{i + 1} / {telas.length}</span>
        </div>
        <Button size="lg" onClick={() => (i === telas.length - 1 ? sair() : ir(1))}>
          {i === telas.length - 1 ? 'Terminar' : <>Próxima<ChevronRight className="h-5 w-5 ml-1" /></>}
        </Button>
      </footer>
    </div>
  );
}
