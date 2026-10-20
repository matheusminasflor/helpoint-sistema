// O PDF do Termo de Responsabilidade e Recebimento de Equipamento de Trabalho (dono, 2026-10-20). O texto é o do
// modelo que o dono enviou (cabeçalho com a empresa, identificação, tabela de equipamentos, 10 condições, aceite e
// as duas assinaturas); os dados vêm do termo gravado (`ti_termos` + `ti_termo_itens`). Data e local de recebimento
// ficam em branco para preencher à mão na assinatura, como no modelo.
import { jsPDF } from 'jspdf';

export interface TermoParaPdf {
  empresa: string;
  colaborador_nome: string;
  cpf: string | null;
  matricula: string | null;
  setor: string | null;
  responsavel_nome: string | null;
  itens: { descricao: string; marca_modelo: string | null; patrimonio: string | null; estado: string | null }[];
}

export const CONDICOES_DO_TERMO = [
  'Recebi os equipamentos acima descritos em perfeito estado de funcionamento e conservação, tendo sido os itens conferidos e o estado de cada um registrado nesta tabela previamente à entrega.',
  'Comprometo-me a utilizar os equipamentos exclusiva e estritamente para o desempenho das minhas atividades profissionais na empresa, sendo vedado o uso para fins pessoais, empréstimo a terceiros ou instalação de softwares não autorizados pelo Departamento de TI.',
  'Comprometo-me a zelar pela integridade, segurança e bom funcionamento dos equipamentos, mantendo-os em condições adequadas de uso, transporte e armazenamento, adotando as precauções necessárias contra danos, extravio, furto ou roubo.',
  'Obrigo-me a observar as políticas de segurança da informação da empresa, incluindo o uso de senhas, bloqueio de tela em ausências e não compartilhamento de credenciais de acesso vinculadas ao equipamento.',
  'Qualquer dano, defeito, mau funcionamento ou irregularidade identificado no momento do recebimento ou no curso da utilização deverá ser comunicado imediatamente ao superior imediato e/ou ao Departamento de TI.',
  'Em caso de perda, furto, roubo ou extravio do equipamento, comprometo-me a comunicar o fato de imediato ao superior imediato e ao Departamento de TI, podendo ser solicitado o registro de Boletim de Ocorrência.',
  'Por ocasião do desligamento da empresa, de mudança de função ou sempre que solicitado pela empresa, comprometo-me a devolver os equipamentos nas mesmas condições em que os recebi, ressalvado o desgaste natural decorrente do uso regular.',
  'Na hipótese de dano, perda ou extravio do equipamento decorrente de mau uso, negligência, imprudência ou imperícia comprovados, o caso será encaminhado ao Departamento Pessoal para apuração e eventual desconto do valor correspondente, observados os limites e procedimentos previstos na legislação trabalhista vigente.',
  'Declaro ciência de que os equipamentos permanecem, em qualquer hipótese, de propriedade da empresa, sendo cedidos a título de comodato para uso exclusivo no exercício das minhas funções, não gerando qualquer direito de posse ou propriedade em meu favor.',
  'Este termo é firmado em duas vias de igual teor, ficando uma via em poder da empresa e outra em poder do(a) colaborador(a).',
];

const AZUL: [number, number, number] = [31, 56, 100];
const CINZA: [number, number, number] = [233, 236, 242];
const M = 20;
const LARGURA = 210 - M * 2;

export function gerarTermoPdf(t: TermoParaPdf): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 18;
  const quebra = (altura: number) => { if (y + altura > 280) { doc.addPage(); y = 20; } };
  const secao = (titulo: string) => {
    quebra(14);
    y += 4;
    doc.setFont('times', 'bold'); doc.setFontSize(12); doc.setTextColor(...AZUL);
    doc.text(titulo, M, y);
    doc.setDrawColor(...AZUL); doc.setLineWidth(0.4); doc.line(M, y + 1.5, M + LARGURA, y + 1.5);
    doc.setTextColor(0, 0, 0);
    y += 7;
  };
  const paragrafo = (texto: string, x = M, largura = LARGURA, tamanho = 10.5) => {
    doc.setFont('times', 'normal'); doc.setFontSize(tamanho);
    const linhas = doc.splitTextToSize(texto, largura) as string[];
    quebra(linhas.length * 4.8);
    doc.text(linhas, x, y, { align: 'justify', maxWidth: largura });
    y += linhas.length * 4.8;
  };

  // Cabeçalho e título.
  doc.setFont('times', 'bold'); doc.setFontSize(9); doc.setTextColor(90, 90, 90);
  doc.text(t.empresa.toUpperCase(), 105, y, { align: 'center' });
  y += 5;
  doc.setDrawColor(...AZUL); doc.setLineWidth(0.8); doc.line(M, y, M + LARGURA, y);
  y += 10;
  doc.setFontSize(15); doc.setTextColor(...AZUL);
  doc.text('TERMO DE RESPONSABILIDADE E RECEBIMENTO', 105, y, { align: 'center' }); y += 7;
  doc.text('DE EQUIPAMENTO DE TRABALHO', 105, y, { align: 'center' }); y += 9;
  doc.setTextColor(0, 0, 0);
  paragrafo(`Pelo presente instrumento, a empresa ${t.empresa} (“Empresa”) formaliza a entrega, e o(a) colaborador(a) abaixo `
    + 'identificado(a) atesta o recebimento, do(s) equipamento(s) de trabalho relacionado(s) neste termo, mediante as condições '
    + 'e obrigações a seguir estabelecidas.');

  // 1. Identificação.
  secao('1. IDENTIFICAÇÃO DO(A) COLABORADOR(A)');
  const rotulo = 38;
  const linha = (campos: [string, string, number?][]) => {
    const h = 7.5;
    quebra(h);
    let x = M;
    campos.forEach(([r, v, larg]) => {
      const lv = larg ?? LARGURA - rotulo;
      doc.setFillColor(...CINZA); doc.rect(x, y, rotulo, h, 'FD');
      doc.setFont('times', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...AZUL);
      doc.text(r, x + 2, y + 5);
      doc.rect(x + rotulo, y, lv, h);
      doc.setFont('times', 'normal'); doc.setFontSize(10.5); doc.setTextColor(0, 0, 0);
      doc.text(v, x + rotulo + 2, y + 5);
      x += rotulo + lv;
    });
    y += h;
  };
  doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.2);
  linha([['Nome completo', t.colaborador_nome.toUpperCase()]]);
  linha([['CPF', t.cpf ?? '', 60], ['Matrícula', t.matricula ?? '', LARGURA - rotulo * 2 - 60]]);
  linha([['Setor', (t.setor ?? '').toUpperCase()]]);
  linha([['Empresa', t.empresa]]);

  // 2. Equipamentos.
  secao('2. EQUIPAMENTO(S) RECEBIDO(S)');
  const cols = [{ t: 'Item', w: 12 }, { t: 'Descrição do equipamento (hardware)', w: 64 }, { t: 'Marca / Modelo', w: 38 },
    { t: 'Nº Patrimônio', w: 28 }, { t: 'Estado', w: LARGURA - 142 }];
  quebra(8);
  let x = M;
  doc.setFillColor(...AZUL);
  doc.rect(M, y, LARGURA, 7.5, 'F');
  doc.setFont('times', 'bold'); doc.setFontSize(9.5); doc.setTextColor(255, 255, 255);
  cols.forEach((c) => { doc.text(c.t, x + 2, y + 5); x += c.w; });
  y += 7.5;
  doc.setTextColor(0, 0, 0); doc.setFont('times', 'italic'); doc.setFontSize(10);
  t.itens.forEach((it, i) => {
    const desc = doc.splitTextToSize(it.descricao, cols[1].w - 4) as string[];
    const h = Math.max(7, desc.length * 4.5 + 2.5);
    quebra(h);
    x = M;
    const valores = [String(i + 1), desc, it.marca_modelo ?? '', it.patrimonio ?? '', it.estado ?? ''];
    cols.forEach((c, j) => {
      doc.rect(x, y, c.w, h);
      const v = valores[j];
      if (j === 0) doc.text(String(v), x + c.w / 2, y + 5, { align: 'center' });
      else doc.text(v as string | string[], x + 2, y + 5);
      x += c.w;
    });
    y += h;
  });
  y += 6;
  doc.setFont('times', 'bold'); doc.setFontSize(10.5);
  quebra(6);
  doc.text('Data de recebimento: ___/___/______        Local: ____________________________', M, y);
  y += 4;

  // 3. Condições.
  secao('3. TERMOS E CONDIÇÕES');
  CONDICOES_DO_TERMO.forEach((c, i) => {
    doc.setFont('times', 'normal'); doc.setFontSize(10.5);
    const linhas = doc.splitTextToSize(c, LARGURA - 8) as string[];
    quebra(linhas.length * 4.8 + 2);
    doc.text(`${i + 1}.`, M + 1, y);
    doc.text(linhas, M + 8, y, { align: 'justify', maxWidth: LARGURA - 8 });
    y += linhas.length * 4.8 + 2;
  });

  // 4. Aceite e assinaturas.
  secao('4. DECLARAÇÃO DE ACEITE');
  paragrafo('Declaro, para os devidos fins, que li e compreendi integralmente os termos e condições estabelecidos neste documento, '
    + 'comprometendo-me ao seu fiel cumprimento durante todo o período em que estiver em posse dos equipamentos ora recebidos.');
  quebra(60);
  y += 10;
  doc.setFont('times', 'bold'); doc.setFontSize(10.5);
  doc.text('Local e data: ________________________________, ____/____/______', M, y);
  const assinatura = (papel: string, nome: string) => {
    y += 20;
    doc.setLineWidth(0.3); doc.line(M, y, M + 90, y);
    doc.setFont('times', 'normal'); doc.setFontSize(9); doc.setTextColor(90, 90, 90);
    doc.text(papel, M, y + 4);
    doc.text('Nome: ', M, y + 8.5);
    doc.setTextColor(0, 0, 0); doc.setFontSize(10.5);
    doc.text(nome.toUpperCase(), M + 10, y + 8.5);
    y += 8;
  };
  assinatura('Assinatura do(a) colaborador(a)', t.colaborador_nome);
  assinatura('Assinatura do responsável / Departamento de TI ou RH', t.responsavel_nome ?? '');
  return doc;
}

/** A empresa do modelo do dono; outra (INBRAS) se digita ou vem do cadastro do RH. */
export const EMPRESA_PADRAO = 'MF INDÚSTRIA E COMÉRCIO DE COSMÉTICOS LTDA.';

export type SituacaoDaDevolucao ='ok' | 'avaria' | 'nao_devolvido';
export const ROTULO_DA_DEVOLUCAO: Record<SituacaoDaDevolucao, string> = {
  ok: 'Devolvido em ordem', avaria: 'Devolvido com avaria', nao_devolvido: 'NÃO DEVOLVIDO',
};

export interface DevolucaoParaPdf {
  empresa: string;
  colaborador_nome: string;
  cpf: string | null;
  setor: string | null;
  responsavel_nome: string | null;
  itens: { descricao: string; patrimonio: string | null; serie: string | null; situacao: SituacaoDaDevolucao; motivo: string | null }[];
}

/**
 * O Termo de Devolução do desligamento (dono, 2026-10-20): o mesmo visual do termo de entrega, com a situação de cada
 * equipamento conferido pela TI (em ordem / com avaria / não devolvido, com o motivo). O chamado da TI só resolve com ele
 * assinado e anexado (20270129100000).
 */
export function gerarTermoDeDevolucaoPdf(t: DevolucaoParaPdf): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 18;
  const quebra = (altura: number) => { if (y + altura > 280) { doc.addPage(); y = 20; } };
  const secao = (titulo: string) => {
    quebra(14);
    y += 4;
    doc.setFont('times', 'bold'); doc.setFontSize(12); doc.setTextColor(...AZUL);
    doc.text(titulo, M, y);
    doc.setDrawColor(...AZUL); doc.setLineWidth(0.4); doc.line(M, y + 1.5, M + LARGURA, y + 1.5);
    doc.setTextColor(0, 0, 0);
    y += 7;
  };
  const paragrafo = (texto: string) => {
    doc.setFont('times', 'normal'); doc.setFontSize(10.5);
    const linhas = doc.splitTextToSize(texto, LARGURA) as string[];
    quebra(linhas.length * 4.8);
    doc.text(linhas, M, y, { align: 'justify', maxWidth: LARGURA });
    y += linhas.length * 4.8;
  };

  doc.setFont('times', 'bold'); doc.setFontSize(9); doc.setTextColor(90, 90, 90);
  doc.text(t.empresa.toUpperCase(), 105, y, { align: 'center' });
  y += 5;
  doc.setDrawColor(...AZUL); doc.setLineWidth(0.8); doc.line(M, y, M + LARGURA, y);
  y += 10;
  doc.setFontSize(15); doc.setTextColor(...AZUL);
  doc.text('TERMO DE DEVOLUÇÃO', 105, y, { align: 'center' }); y += 7;
  doc.text('DE EQUIPAMENTO DE TRABALHO', 105, y, { align: 'center' }); y += 9;
  doc.setTextColor(0, 0, 0);
  paragrafo(`Pelo presente instrumento, a empresa ${t.empresa} (“Empresa”) e o(a) colaborador(a) abaixo identificado(a) `
    + 'registram a devolução do(s) equipamento(s) de trabalho que estavam sob sua responsabilidade, conferidos item a item '
    + 'pelo Departamento de TI na data abaixo.');

  secao('1. IDENTIFICAÇÃO DO(A) COLABORADOR(A)');
  const rotulo = 38;
  doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.2);
  ([['Nome completo', t.colaborador_nome.toUpperCase()], ['CPF', t.cpf ?? ''], ['Setor', (t.setor ?? '').toUpperCase()],
    ['Empresa', t.empresa]] as [string, string][]).forEach(([r, v]) => {
    doc.setFillColor(...CINZA); doc.rect(M, y, rotulo, 7.5, 'FD');
    doc.setFont('times', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...AZUL);
    doc.text(r, M + 2, y + 5);
    doc.rect(M + rotulo, y, LARGURA - rotulo, 7.5);
    doc.setFont('times', 'normal'); doc.setFontSize(10.5); doc.setTextColor(0, 0, 0);
    doc.text(v, M + rotulo + 2, y + 5);
    y += 7.5;
  });

  secao('2. EQUIPAMENTO(S) CONFERIDO(S)');
  const cols = [{ t: 'Item', w: 12 }, { t: 'Equipamento', w: 62 }, { t: 'Nº Patrimônio', w: 28 }, { t: 'Nº Série', w: 30 },
    { t: 'Situação', w: LARGURA - 132 }];
  quebra(8);
  let x = M;
  doc.setFillColor(...AZUL);
  doc.rect(M, y, LARGURA, 7.5, 'F');
  doc.setFont('times', 'bold'); doc.setFontSize(9.5); doc.setTextColor(255, 255, 255);
  cols.forEach((c) => { doc.text(c.t, x + 2, y + 5); x += c.w; });
  y += 7.5;
  doc.setTextColor(0, 0, 0); doc.setFontSize(10);
  t.itens.forEach((it, i) => {
    const desc = doc.splitTextToSize(it.descricao, cols[1].w - 4) as string[];
    const sit = doc.splitTextToSize(ROTULO_DA_DEVOLUCAO[it.situacao] + (it.motivo ? `: ${it.motivo}` : ''), cols[4].w - 4) as string[];
    const h = Math.max(7, Math.max(desc.length, sit.length) * 4.5 + 2.5);
    quebra(h);
    x = M;
    const valores: (string | string[])[] = [String(i + 1), desc, it.patrimonio ?? '', it.serie ?? '', sit];
    cols.forEach((c, j) => {
      doc.rect(x, y, c.w, h);
      doc.setFont('times', j === 4 && it.situacao !== 'ok' ? 'bold' : 'normal');
      if (j === 0) doc.text(String(valores[j]), x + c.w / 2, y + 5, { align: 'center' });
      else doc.text(valores[j], x + 2, y + 5);
      x += c.w;
    });
    y += h;
  });
  if (t.itens.length === 0) { quebra(8); doc.setFont('times', 'italic'); doc.text('Nenhum equipamento no nome do(a) colaborador(a).', M, y + 5); y += 8; }

  secao('3. DECLARAÇÃO');
  paragrafo('O(a) colaborador(a) declara ter devolvido os equipamentos marcados como devolvidos, e reconhece a situação '
    + 'registrada para cada item. Equipamento não devolvido ou devolvido com avaria segue para o Departamento Pessoal, '
    + 'conforme o item 8 do Termo de Responsabilidade e Recebimento, observada a legislação trabalhista vigente.');
  quebra(60);
  y += 10;
  doc.setFont('times', 'bold'); doc.setFontSize(10.5);
  doc.text('Local e data: ________________________________, ____/____/______', M, y);
  const assinatura = (papel: string, nome: string) => {
    y += 20;
    doc.setLineWidth(0.3); doc.line(M, y, M + 90, y);
    doc.setFont('times', 'normal'); doc.setFontSize(9); doc.setTextColor(90, 90, 90);
    doc.text(papel, M, y + 4);
    doc.text('Nome: ', M, y + 8.5);
    doc.setTextColor(0, 0, 0); doc.setFontSize(10.5);
    doc.text(nome.toUpperCase(), M + 10, y + 8.5);
    y += 8;
  };
  assinatura('Assinatura do(a) colaborador(a)', t.colaborador_nome);
  assinatura('Assinatura do responsável / Departamento de TI', t.responsavel_nome ?? '');
  return doc;
}

export const nomeDoArquivoDaDevolucao = (nome: string) => `Termo de devolucao - ${nome.replace(/[\\/:*?"<>|]/g, '').trim()}.pdf`;

/** O nome do arquivo: "Termo - Nome da Pessoa.pdf". */
export const nomeDoArquivoDoTermo = (nome: string) => `Termo de responsabilidade - ${nome.replace(/[\\/:*?"<>|]/g, '').trim()}.pdf`;
