// O Helpoint como aplicativo (PWA, decisão 6 do dono, 2026-10-24): registra o service worker (`public/sw.js`) e guarda
// o pedido de instalação que o navegador oferece, para o botão "Instalar o Helpoint" usar quando a pessoa quiser.
import { useSyncExternalStore } from 'react';

interface PedidoDeInstalacao extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let pedido: PedidoDeInstalacao | null = null;
const ouvintes = new Set<() => void>();
const avisa = () => ouvintes.forEach((f) => f());

export function registrarAplicativo() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js'); });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    pedido = e as PedidoDeInstalacao;
    avisa();
  });
  window.addEventListener('appinstalled', () => { pedido = null; avisa(); });
}

/** Já está aberto como aplicativo instalado? */
export const abertoComoAplicativo = () =>
  typeof window !== 'undefined'
  && (window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);

export const ehIphone = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);

/** O navegador ofereceu instalar? (Chrome, Edge, Android.) No iPhone nunca oferece: é pelo Compartilhar. */
export function usePodeInstalar() {
  return useSyncExternalStore(
    (f) => { ouvintes.add(f); return () => ouvintes.delete(f); },
    () => pedido !== null,
    () => false,
  );
}

export async function instalar() {
  if (!pedido) return false;
  await pedido.prompt();
  const { outcome } = await pedido.userChoice;
  pedido = null;
  avisa();
  return outcome === 'accepted';
}
