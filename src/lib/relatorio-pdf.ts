// O PDF dos relatórios de Compras e da Caixinha (dono, 2026-10-14: "no ato de imprimir, ter também impresso os
// recibos em anexo, com a opção de imprimir os recibos ou somente o relatório"). Um arquivo só: a tabela nas
// primeiras páginas, depois cada nota ou recibo, com o nome da linha no topo. Foto entra como imagem; PDF entra
// página por página (desenhada pelo `pdfjs-dist`, carregado só aqui). `jspdf` já é dependência do projeto.
import { jsPDF } from 'jspdf';

export interface ColunaDoRelatorio { titulo: string; largura: number; direita?: boolean }
export interface AnexoDoRelatorio { titulo: string; path: string }

export interface RelatorioPdf {
  titulo: string;
  linhasDoCabecalho: string[];
  colunas: ColunaDoRelatorio[];
  linhas: string[][];
  totais: string[];
  anexos?: AnexoDoRelatorio[];
  baixar: (path: string) => Promise<Blob | null>;
  nomeDoArquivo: string;
}

const MARGEM = 10;

export async function gerarRelatorioPdf(r: RelatorioPdf): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const larguraUtil = 297 - MARGEM * 2;
  const escala = larguraUtil / r.colunas.reduce((s, c) => s + c.largura, 0);
  const larguras = r.colunas.map((c) => c.largura * escala);
  let y = MARGEM;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(r.titulo, MARGEM, y + 4); y += 9;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  for (const l of r.linhasDoCabecalho) { doc.text(l, MARGEM, y); y += 4.5; }
  y += 2;

  const linha = (celulas: string[], negrito = false, fundo = false) => {
    if (y > 200) { doc.addPage(); y = MARGEM; }
    if (fundo) { doc.setFillColor(235, 235, 235); doc.rect(MARGEM, y - 3.6, larguraUtil, 5.4, 'F'); }
    doc.setFont('helvetica', negrito ? 'bold' : 'normal'); doc.setFontSize(8.5);
    let x = MARGEM;
    celulas.forEach((texto, i) => {
      const w = larguras[i];
      const cabe = (doc.splitTextToSize(texto ?? '', w - 1.5) as string[])[0] ?? '';
      if (r.colunas[i].direita) doc.text(cabe, x + w - 1, y, { align: 'right' });
      else doc.text(cabe, x + 0.5, y);
      x += w;
    });
    y += 5.4;
  };

  linha(r.colunas.map((c) => c.titulo), true, true);
  r.linhas.forEach((l) => linha(l));
  if (r.totais.length) { y += 1; linha(r.totais, true, true); }

  for (const anexo of r.anexos ?? []) {
    const blob = await r.baixar(anexo.path).catch(() => null);
    if (!blob) { paginaDeAviso(doc, anexo.titulo, 'Não foi possível abrir este anexo.'); continue; }
    const tipo = blob.type || (anexo.path.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '');
    if (tipo === 'application/pdf') {
      for (const imagem of await paginasDoPdf(blob)) adicionarImagem(doc, anexo.titulo, imagem);
    } else if (tipo.startsWith('image/')) {
      adicionarImagem(doc, anexo.titulo, await imagemComoJpeg(blob));
    } else {
      paginaDeAviso(doc, anexo.titulo, `Anexo em formato que não dá para imprimir aqui (${tipo || 'desconhecido'}). Abra-o pelo sistema.`);
    }
  }

  doc.save(r.nomeDoArquivo);
}

interface Imagem { dataUrl: string; largura: number; altura: number }

function adicionarImagem(doc: jsPDF, titulo: string, img: Imagem) {
  doc.addPage('a4', img.largura > img.altura ? 'landscape' : 'portrait');
  const largura = doc.internal.pageSize.getWidth() - MARGEM * 2;
  const altura = doc.internal.pageSize.getHeight() - MARGEM * 2 - 8;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text(titulo, MARGEM, MARGEM + 3);
  const k = Math.min(largura / img.largura, altura / img.altura);
  doc.addImage(img.dataUrl, 'JPEG', MARGEM, MARGEM + 7, img.largura * k, img.altura * k);
}

function paginaDeAviso(doc: jsPDF, titulo: string, aviso: string) {
  doc.addPage('a4', 'portrait');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text(titulo, MARGEM, MARGEM + 3);
  doc.setFont('helvetica', 'normal');
  doc.text(aviso, MARGEM, MARGEM + 10);
}

async function imagemComoJpeg(blob: Blob): Promise<Imagem> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), largura: canvas.width, altura: canvas.height };
}

async function paginasDoPdf(blob: Blob): Promise<Imagem[]> {
  const [pdfjs, { default: worker }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  const paginas: Imagem[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const pagina = await pdf.getPage(p);
    const vista = pagina.getViewport({ scale: 1.6 });
    const canvas = document.createElement('canvas');
    canvas.width = vista.width; canvas.height = vista.height;
    await pagina.render({ canvasContext: canvas.getContext('2d')!, viewport: vista }).promise;
    paginas.push({ dataUrl: canvas.toDataURL('image/jpeg', 0.85), largura: canvas.width, altura: canvas.height });
  }
  return paginas;
}
