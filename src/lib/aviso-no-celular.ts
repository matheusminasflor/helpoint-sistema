// Aviso no celular (Web Push; etapa 4b, migration 20270201030000). O aparelho pede a permissão, se inscreve no serviço
// de push do navegador e a inscrição vai para `push_inscricoes`; quem envia é a função `avisos-push`, a cada minuto.
// No iPhone só funciona com o Helpoint instalado na tela de início (iOS 16.4 ou mais novo).
import { supabase } from '@/integrations/supabase/client';
import { expectRows } from '@/lib/supabase-result';

/** A chave pública VAPID (não é segredo: o navegador a usa para saber que o aviso veio do Helpoint). */
export const CHAVE_PUBLICA_VAPID = 'BNYffHM8YLICt8_oN7mysN9SFkC0jRT4SS3V9IMEuw9husJVAgarE2HkZ7puz9BZYwrywRM5yNRP2Nw_OclvsDY';

export type EstadoDoAviso = 'sem_suporte' | 'precisa_instalar' | 'negado' | 'ligado' | 'desligado';

export const temSuporte = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function chaveEmBytes(base64: string): ArrayBuffer {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const texto = atob(padded);
  const buf = new ArrayBuffer(texto.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < texto.length; i++) bytes[i] = texto.charCodeAt(i);
  return buf;
}

export async function estadoDoAviso(): Promise<EstadoDoAviso> {
  if (!temSuporte()) {
    // No iPhone fora do aplicativo instalado o PushManager não existe.
    return /iPhone|iPad|iPod/.test(navigator.userAgent) ? 'precisa_instalar' : 'sem_suporte';
  }
  if (Notification.permission === 'denied') return 'negado';
  const reg = await navigator.serviceWorker.getRegistration();
  const inscricao = await reg?.pushManager.getSubscription();
  return inscricao ? 'ligado' : 'desligado';
}

/** Pede a permissão, inscreve o aparelho e grava. Devolve o estado depois. */
export async function ligarAvisoNoCelular(): Promise<EstadoDoAviso> {
  if (!temSuporte()) return estadoDoAviso();
  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') return permissao === 'denied' ? 'negado' : 'desligado';
  const reg = await navigator.serviceWorker.ready;
  const inscricao = (await reg.pushManager.getSubscription())
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveEmBytes(CHAVE_PUBLICA_VAPID) });
  const json = inscricao.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  // O mesmo aparelho pode já estar gravado (reinstalou, trocou de conta): troca a linha.
  const { error: erroApagar } = await supabase.from('push_inscricoes' as never).delete().eq('endpoint', json.endpoint);
  if (erroApagar) throw erroApagar;
  expectRows(await supabase.from('push_inscricoes' as never).insert({
    endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, aparelho: navigator.userAgent.slice(0, 200),
  } as never).select('id'), 'o aparelho');
  return 'ligado';
}

export async function desligarAvisoNoCelular(): Promise<EstadoDoAviso> {
  const reg = await navigator.serviceWorker.getRegistration();
  const inscricao = await reg?.pushManager.getSubscription();
  if (inscricao) {
    const { error } = await supabase.from('push_inscricoes' as never).delete().eq('endpoint', inscricao.endpoint);
    if (error) throw error;
    await inscricao.unsubscribe();
  }
  return 'desligado';
}
