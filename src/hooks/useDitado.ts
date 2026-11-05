import { useCallback, useEffect, useRef, useState } from 'react';

interface Reconhecimento {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type Construtor = new () => Reconhecimento;

/** No iPhone com o app instalado o reconhecimento pode existir e não responder: sem nada em 6 s, a tela orienta. */
const ESPERA_MS = 6000;

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

  const parar = useCallback(() => {
    seguir.current = false;
    clearTimeout(relogio.current);
    atual.current?.stop();
    setOuvindo(false);
    setProvisorio('');
  }, []);

  const iniciar = useCallback(() => {
    if (!Reconhecedor) { setSemResposta(true); return; }
    const r = new Reconhecedor();
    r.lang = 'pt-BR';
    r.interimResults = true;
    r.continuous = true;
    r.onresult = (e) => {
      clearTimeout(relogio.current);
      setSemResposta(false);
      let parcial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const trecho = e.results[i][0].transcript;
        if (e.results[i].isFinal) onTexto(trecho.trim());
        else parcial += trecho;
      }
      setProvisorio(parcial);
    };
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      setSemResposta(true);
      parar();
    };
    // O navegador encerra sozinho depois de um silêncio: enquanto a pessoa não parar, continua.
    r.onend = () => { if (seguir.current) r.start(); };
    seguir.current = true;
    atual.current = r;
    setSemResposta(false);
    setOuvindo(true);
    relogio.current = setTimeout(() => { setSemResposta(true); parar(); }, ESPERA_MS);
    r.start();
  }, [Reconhecedor, onTexto, parar]);

  useEffect(() => parar, [parar]);

  return { ouvindo, provisorio, semResposta, iniciar, parar };
}
