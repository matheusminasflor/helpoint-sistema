import { useCallback, useEffect, useRef, useState } from 'react';
import { limparFala, textoDaEscuta, trechoNovo } from '@/lib/ditado';

interface Reconhecimento {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type Construtor = new () => Reconhecimento;

/** No iPhone com o app instalado o reconhecimento pode existir e não responder: sem nada em 6 s, a tela orienta. */
const ESPERA_MS = 6000;
/** Silêncio seguido: cada religada apita no Android, então o microfone desliga sozinho. */
const ESCUTAS_VAZIAS = 3;

/** Fala em texto pelo próprio navegador, sem IA e sem custo. `onTexto` recebe cada trecho pronto. */
export function useDitado(onTexto: (trecho: string) => void) {
  const janela = window as unknown as { SpeechRecognition?: Construtor; webkitSpeechRecognition?: Construtor };
  const Reconhecedor = janela.SpeechRecognition ?? janela.webkitSpeechRecognition;
  const [ouvindo, setOuvindo] = useState(false);
  const [provisorio, setProvisorio] = useState('');
  const [semResposta, setSemResposta] = useState(false);
  const atual = useRef<Reconhecimento | null>(null);
  const relogio = useRef<ReturnType<typeof setTimeout>>();
  const seguir = useRef(false);
  const escuta = useRef('');
  const anterior = useRef('');
  const vazias = useRef(0);
  const entregar = useRef(onTexto);
  entregar.current = onTexto;

  // O texto só é entregue ao fim de cada escuta: é quando o aparelho já não muda de ideia sobre o que ouviu.
  const fecharEscuta = useCallback(() => {
    const novo = trechoNovo(anterior.current, escuta.current);
    if (escuta.current) anterior.current = escuta.current;
    escuta.current = '';
    setProvisorio('');
    if (novo) entregar.current(novo);
  }, []);

  const parar = useCallback(() => {
    seguir.current = false;
    clearTimeout(relogio.current);
    fecharEscuta();
    atual.current?.stop();
    atual.current = null;
    setOuvindo(false);
  }, [fecharEscuta]);

  const iniciar = useCallback(() => {
    if (!Reconhecedor) { setSemResposta(true); return; }
    const r = new Reconhecedor();
    r.lang = 'pt-BR';
    r.interimResults = true;
    // Uma frase por escuta, religando em seguida: o modo contínuo é o que duplica no Android.
    r.continuous = false;
    r.onresult = (e) => {
      clearTimeout(relogio.current);
      setSemResposta(false);
      escuta.current = limparFala(textoDaEscuta(Array.from(e.results, (resultado) => resultado[0].transcript)));
      setProvisorio(escuta.current);
    };
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      setSemResposta(true);
      parar();
    };
    r.onend = () => {
      if (atual.current !== r) return;
      vazias.current = escuta.current ? 0 : vazias.current + 1;
      fecharEscuta();
      if (vazias.current >= ESCUTAS_VAZIAS) parar();
      else if (seguir.current) r.start();
    };
    seguir.current = true;
    atual.current = r;
    anterior.current = '';
    vazias.current = 0;
    setSemResposta(false);
    setOuvindo(true);
    relogio.current = setTimeout(() => { setSemResposta(true); parar(); }, ESPERA_MS);
    r.start();
  }, [Reconhecedor, fecharEscuta, parar]);

  useEffect(() => parar, [parar]);

  return { ouvindo, provisorio, semResposta, iniciar, parar };
}
