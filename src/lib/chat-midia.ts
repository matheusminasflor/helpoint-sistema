// Anexos do chat (dono, 2026-10-15; migration 20270119010000). O plano grátis do Supabase tem 1 GB de arquivos:
// a foto sai do navegador comprimida (~300 KB) e a voz gravada a ~32 kbit/s (~250 KB por minuto). Arquivo
// acima de 10 MB não sobe.

export const LIMITE_DO_ANEXO = 10 * 1024 * 1024;
const ALVO_DA_FOTO = 300 * 1024;
const LADO_MAXIMO = 1600;

/** Foto vira JPEG de até ~300 KB e 1600 px no lado maior; GIF e o que não for foto passam como estão. */
export async function comprimirFoto(arquivo: File): Promise<File> {
  if (!arquivo.type.startsWith('image/') || arquivo.type === 'image/gif' || arquivo.size <= ALVO_DA_FOTO) return arquivo;
  const bitmap = await createImageBitmap(arquivo).catch(() => null);
  if (!bitmap) return arquivo;
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let blob: Blob | null = null;
  for (const qualidade of [0.8, 0.65, 0.5, 0.35]) {
    blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', qualidade));
    if (blob && blob.size <= ALVO_DA_FOTO) break;
  }
  if (!blob || blob.size >= arquivo.size) return arquivo;
  return new File([blob], arquivo.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}

/** O tipo do anexo para a tela: foto, áudio ou arquivo. */
export function tipoDoAnexo(mime: string | null | undefined): 'foto' | 'audio' | 'arquivo' {
  if (mime?.startsWith('image/')) return 'foto';
  if (mime?.startsWith('audio/')) return 'audio';
  return 'arquivo';
}

/** O caminho no bucket `chat`: `<empresa>/<canal>/<aleatório>-<nome limpo>` (a policy lê os dois primeiros). */
export function caminhoDoAnexo(tenantId: string, canal: string, nome: string, aleatorio: string): string {
  const limpo = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]/g, '_').slice(-80);
  return `${tenantId}/${canal}/${aleatorio}-${limpo}`;
}

// A transcrição é do navegador (Chrome/Edge expõem `webkitSpeechRecognition`); o Firefox grava sem transcrever.
interface Reconhecimento {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  start(): void; stop(): void;
}
type ConstrutorDeReconhecimento = new () => Reconhecimento;

export function transcreveNoNavegador(): boolean {
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export interface Gravacao {
  parar(): Promise<{ audio: File; transcricao: string }>;
  cancelar(): void;
}

/** Grava a voz (~32 kbit/s) e, onde o navegador sabe, transcreve em português ao mesmo tempo. */
export async function gravarVoz(): Promise<Gravacao> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
  const gravador = new MediaRecorder(stream, { mimeType: mime || undefined, audioBitsPerSecond: 32000 });
  const pedacos: Blob[] = [];
  gravador.ondataavailable = (e) => { if (e.data.size) pedacos.push(e.data); };
  gravador.start();

  let transcricao = '';
  const w = window as unknown as { SpeechRecognition?: ConstrutorDeReconhecimento; webkitSpeechRecognition?: ConstrutorDeReconhecimento };
  const Rec = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  const rec = Rec ? new Rec() : null;
  if (rec) {
    rec.lang = 'pt-BR';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) transcricao += (transcricao ? ' ' : '') + e.results[i][0].transcript.trim();
      }
    };
    rec.onerror = () => {};
    try { rec.start(); } catch { /* sem transcrição, a gravação segue */ }
  }

  const desligar = () => {
    stream.getTracks().forEach((t) => t.stop());
    try { rec?.stop(); } catch { /* já parado */ }
  };

  return {
    parar: () => new Promise((ok) => {
      gravador.onstop = () => {
        desligar();
        // O reconhecimento entrega o último trecho logo depois do stop.
        setTimeout(() => {
          const tipo = gravador.mimeType.split(';')[0] || 'audio/webm';
          const ext = tipo.includes('ogg') ? 'ogg' : 'webm';
          ok({ audio: new File(pedacos, `audio.${ext}`, { type: tipo }), transcricao });
        }, 400);
      };
      gravador.stop();
    }),
    cancelar: () => { gravador.onstop = null; if (gravador.state !== 'inactive') gravador.stop(); desligar(); },
  };
}
