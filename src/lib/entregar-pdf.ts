import type { jsPDF } from 'jspdf';
import { LARGURA_DO_CELULAR } from '@/config/celular';

/**
 * No celular abre o compartilhar (WhatsApp, e-mail…), para a pessoa mandar o relatório a alguém (dono, 2026-11-04). No
 * computador, e onde o navegador não compartilha arquivo, baixa como sempre.
 */
export async function entregarPdf(doc: jsPDF, nome: string) {
  const noCelular = window.matchMedia?.(`(max-width: ${LARGURA_DO_CELULAR - 1}px)`)?.matches;
  if (noCelular) {
    const arquivo = new File([doc.output('blob')], nome, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [arquivo] })) {
      try {
        await navigator.share({ files: [arquivo], title: nome });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
  }
  doc.save(nome);
}
