// Abrir o PDF do espelho no navegador (LEVA S, parte 4). O arquivo não sai da máquina nem fica
// guardado: o que interessa dele vira colunas do pedido (manual §3.7). O `pdfjs-dist` é carregado só
// quando alguém importa um espelho — não pesa na abertura do sistema. Versão fixa de propósito
// (a mesma do sistema antigo): atualizar exige conferir de novo contra espelhos reais.
import { linhasDoPdf, lerEspelho, type LeituraDoEspelho, type TextoNaPagina } from '@/lib/espelho-do-pedido';

export async function lerEspelhoDoArquivo(arquivo: File): Promise<LeituraDoEspelho> {
  const [pdfjs, { default: worker }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker;

  const doc = await pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise;
  const paginas: TextoNaPagina[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const conteudo = await (await doc.getPage(p)).getTextContent();
    paginas.push(conteudo.items
      .filter((it): it is typeof it & { str: string; transform: number[]; width: number } => 'str' in it)
      .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width })));
  }
  return lerEspelho(linhasDoPdf(paginas));
}
