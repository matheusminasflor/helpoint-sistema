import { jsPDF } from 'jspdf';
import { entregarPdf } from '@/lib/entregar-pdf';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TicketMetrics, TicketTrend, MetricsFilter, getDateRangeFromPeriod } from '@/hooks/useHelpdeskMetrics';
import { formatarHoras } from '@/lib/horas';

export interface PDFReportData {
  metrics: TicketMetrics | null;
  previousMetrics: TicketMetrics | null;
  trends: TicketTrend[] | null;
  filter: MetricsFilter;
  activeAssets: number;
  totalAssets: number;
  expiringLicenses: number;
  expiringContractsCount: number;
  scheduledMaintenancesCount: number;
  technicianName?: string;
  selectedSections?: string[];
  /**
   * O que a Visão Geral da TI mostra além dos chamados (rodada 2, 2026-11-02: "o PDF leva tudo o que a Visão Geral
   * mostra"): a frase de resumo, a meta e o status de cada número, a Equipe, os Projetos e as categorias em níveis.
   */
  ti?: DadosDaTINoPDF;
  /** A capa de outro setor (Marketing, 2026-11-03); sem ela, a da TI. */
  capa?: { sigla: string; titulo: [string, string] };
  /** Tabelas a mais, cada uma na seção que a liga no diálogo (os Artistas e os blocos do Marketing). */
  tabelas?: TabelaDoPDF[];
}

export interface TabelaDoPDF {
  secao: string;
  titulo: string;
  cabecalho: string[];
  linhas: string[][];
  /** A parte da largura de cada coluna (somam 1). */
  larguras: number[];
}

export type StatusNoPDF = 'no_alvo' | 'atencao' | 'fora' | 'sem_meta' | 'sem_dado';
export interface LinhaComMeta { indicador: string; meta: string; anterior: string; atual: string; status: StatusNoPDF }
export interface DadosDaTINoPDF {
  resumo: string;
  chamados: LinhaComMeta[];
  equipe: LinhaComMeta[];
  pessoas: { nome: string; horas: string; trabalho: string; ocioso: string; status: StatusNoPDF }[];
  projetos: { nome: string; situacao: string; termino: string; atraso: string }[];
  /** A árvore das categorias já achatada: `nivel` 0 é a categoria, 1 a subcategoria… */
  categorias: { nome: string; nivel: number; chamados: number }[];
}

const TEXTO_DO_STATUS: Record<StatusNoPDF, string> = {
  no_alvo: 'No alvo', atencao: 'Atenção', fora: 'Fora', sem_meta: 'Sem meta', sem_dado: 'Sem dado',
};
const COR_DO_STATUS: Record<StatusNoPDF, [number, number, number]> = {
  no_alvo: [22, 163, 74], atencao: [217, 119, 6], fora: [220, 38, 38], sem_meta: [100, 116, 139], sem_dado: [100, 116, 139],
};

const PRIORITY_LABELS: Record<string, string> = {
  critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa',
};
const BRAND_COLOR: [number, number, number] = [37, 99, 235];
const HEADER_BG: [number, number, number] = [30, 58, 138];
const WHITE: [number, number, number] = [255, 255, 255];
const GRAY: [number, number, number] = [100, 116, 139];
const DARK: [number, number, number] = [15, 23, 42];
const ZEBRA: [number, number, number] = [248, 250, 252];

// A4 safe margins
const MARGIN_X = 18;
const MARGIN_TOP = 20;
const FOOTER_ZONE = 24;

function hasSection(sections: string[] | undefined, id: string): boolean {
  return !sections || sections.includes(id);
}

export async function generatePDFReport(data: PDFReportData): Promise<void> {
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const contentW = pw - MARGIN_X * 2;
  const safeBottom = ph - FOOTER_ZONE;
  let yPos = 0;
  let pageNum = 0;
  const sections = data.selectedSections;

  const dateRange = getDateRangeFromPeriod(data.filter);
  const periodText = `${format(dateRange.startDate, 'dd/MM/yyyy')} — ${format(dateRange.endDate, 'dd/MM/yyyy')}`;
  const generatedAt = format(new Date(), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR });

  // ── Helpers ──
  const addFooter = () => {
    pageNum++;
    doc.setFillColor(248, 250, 252);
    doc.rect(0, ph - 16, pw, 16, 'F');
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.setFont('helvetica', 'normal');
    doc.text('Relatório gerado automaticamente • Helpoint', MARGIN_X, ph - 7);
    doc.text(`Página ${pageNum}`, pw - MARGIN_X, ph - 7, { align: 'right' });
  };

  const checkPageBreak = (needed: number = 35) => {
    if (yPos + needed > safeBottom) {
      addFooter();
      doc.addPage();
      yPos = MARGIN_TOP;
    }
  };

  const sectionTitle = (title: string) => {
    // Sem o Resumo marcado, a primeira seção ainda estaria na página da capa (o rodapé da capa já foi posto).
    if (yPos < MARGIN_TOP) { doc.addPage(); yPos = MARGIN_TOP; }
    checkPageBreak(30);
    doc.setFillColor(...BRAND_COLOR);
    doc.rect(MARGIN_X, yPos, 3, 14, 'F');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DARK);
    doc.text(title, MARGIN_X + 8, yPos + 10);
    yPos += 20;
  };

  const drawTable = (headers: string[], rows: string[][], colWidths: number[],
    corDaCelula?: (linha: number, coluna: number) => [number, number, number] | undefined) => {
    const rowH = 9;
    const headerH = 10;
    // Ensure at least header + 3 rows fit before breaking
    const minBlock = headerH + rowH * Math.min(rows.length, 3);
    checkPageBreak(minBlock);

    // Header
    doc.setFillColor(...HEADER_BG);
    doc.rect(MARGIN_X, yPos, contentW, headerH, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...WHITE);
    let x = MARGIN_X + 3;
    headers.forEach((h, i) => {
      doc.text(h, x, yPos + 7);
      x += colWidths[i];
    });
    yPos += headerH;

    // Rows
    rows.forEach((row, ri) => {
      checkPageBreak(rowH);
      if (ri % 2 === 0) {
        doc.setFillColor(...ZEBRA);
        doc.rect(MARGIN_X, yPos, contentW, rowH, 'F');
      }
      doc.setFontSize(8);
      x = MARGIN_X + 3;
      row.forEach((cell, ci) => {
        const cor = corDaCelula?.(ri, ci);
        doc.setFont('helvetica', cor ? 'bold' : 'normal');
        doc.setTextColor(...(cor ?? DARK));
        doc.text(cell, x, yPos + 6);
        x += colWidths[ci];
      });
      yPos += rowH;
    });
    yPos += 6;
  };

  const drawKPICard = (x: number, y: number, w: number, h: number, label: string, value: string, color: [number, number, number]) => {
    doc.setFillColor(...color);
    doc.roundedRect(x, y, w, h, 3, 3, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(255, 255, 255);
    doc.text(label, x + 5, y + 10);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(value, x + 5, y + 25);
  };

  // Indicador · Meta · Anterior · Atual · Status (o status na cor dele).
  const drawTabelaComMeta = (linhas: LinhaComMeta[]) => {
    drawTable(['Indicador', 'Meta', 'Anterior', 'Atual', 'Status'],
      linhas.map((l) => [l.indicador, l.meta, l.anterior, l.atual, TEXTO_DO_STATUS[l.status]]),
      [contentW * 0.34, contentW * 0.22, contentW * 0.15, contentW * 0.15, contentW * 0.14],
      (ri, ci) => (ci === 4 ? COR_DO_STATUS[linhas[ri].status] : undefined));
  };

  // ════════════════════════════════════════
  // COVER (always included)
  // ════════════════════════════════════════
  doc.setFillColor(...HEADER_BG);
  doc.rect(0, 0, pw, ph, 'F');

  doc.setFillColor(59, 130, 246);
  doc.rect(0, ph * 0.55, pw, 4, 'F');

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(MARGIN_X, 40, 50, 50, 6, 6, 'F');
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...HEADER_BG);
  const capa = data.capa ?? { sigla: 'TI', titulo: ['RELATÓRIO DE', 'MÉTRICAS TI'] };
  doc.text(capa.sigla, MARGIN_X + 25, 72, { align: 'center' });

  doc.setTextColor(...WHITE);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text(capa.titulo[0], MARGIN_X, 130);
  doc.text(capa.titulo[1], MARGIN_X, 145);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(191, 219, 254);
  doc.text(`Período: ${periodText}`, MARGIN_X, 165);
  if (data.technicianName) {
    doc.text(`Técnico: ${data.technicianName}`, MARGIN_X, 178);
  }

  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text(`Gerado em: ${generatedAt}`, MARGIN_X, ph - 30);

  addFooter();

  // ════════════════════════════════════════
  // EXECUTIVE SUMMARY + KPIs
  // ════════════════════════════════════════
  const metrics = data.metrics;
  const prevMetrics = data.previousMetrics;

  if (hasSection(sections, 'executive_summary') && metrics) {
    doc.addPage();
    yPos = MARGIN_TOP;

    sectionTitle('RESUMO EXECUTIVO');

    // A TI manda a frase da Visão Geral e cada número com meta e status; o cartão leva a cor do status.
    if (data.ti) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...DARK);
      const linhas = doc.splitTextToSize(data.ti.resumo, contentW) as string[];
      doc.text(linhas, MARGIN_X, yPos + 4);
      yPos += linhas.length * 5 + 8;
      const cardW = (contentW - 12) / 4;
      data.ti.chamados.slice(0, 4).forEach((c, i) => {
        drawKPICard(MARGIN_X + (cardW + 4) * i, yPos, cardW, 32, c.indicador, c.atual, COR_DO_STATUS[c.status]);
      });
      yPos += 32 + 10;
      drawTabelaComMeta(data.ti.chamados);
    }

    const cardW = (contentW - 12) / 4;
    const cardH = 32;
    if (!data.ti) {
      drawKPICard(MARGIN_X, yPos, cardW, cardH, 'Chamados Abertos', `${metrics.open}`, [234, 88, 12]);
      drawKPICard(MARGIN_X + cardW + 4, yPos, cardW, cardH, 'SLA Cumprido', `${metrics.slaCompliance}%`, [37, 99, 235]);
      drawKPICard(MARGIN_X + (cardW + 4) * 2, yPos, cardW, cardH, 'Resolvidos', `${metrics.resolved}`, [22, 163, 74]);
      drawKPICard(MARGIN_X + (cardW + 4) * 3, yPos, cardW, cardH, 'Tempo Médio', formatarHoras(metrics.avgResolutionTime), [100, 116, 139]);
      yPos += cardH + 12;
    }

    const summaryRows = [
      ['Total de Chamados', `${metrics.total}`, prevMetrics ? `${prevMetrics.total}` : '—'],
      ['Chamados Abertos', `${metrics.open}`, prevMetrics ? `${prevMetrics.open}` : '—'],
      ['Em Andamento', `${metrics.inProgress}`, prevMetrics ? `${prevMetrics.inProgress}` : '—'],
      ['Resolvidos', `${metrics.resolved}`, prevMetrics ? `${prevMetrics.resolved}` : '—'],
      ['SLA Cumprido', `${metrics.slaCompliance}%`, prevMetrics ? `${prevMetrics.slaCompliance}%` : '—'],
      ['Tempo Médio (horas)', `${metrics.avgResolutionTime}`, prevMetrics ? `${prevMetrics.avgResolutionTime}` : '—'],
    ];
    drawTable(['Indicador', 'Atual', 'Anterior'], summaryRows, [contentW * 0.5, contentW * 0.25, contentW * 0.25]);
  }

  // ── As tabelas a mais do setor (Marketing: Artistas; Pedidos de arte, Estoque e Benefício de sexta) ──
  for (const t of data.tabelas ?? []) {
    if (!hasSection(sections, t.secao) || t.linhas.length === 0) continue;
    sectionTitle(t.titulo);
    drawTable(t.cabecalho, t.linhas, t.larguras.map((f) => contentW * f));
  }

  // ── Equipe (FSENSE) e interrupções ── (rodada 2 da TI)
  if (hasSection(sections, 'team') && data.ti && data.ti.equipe.length > 0) {
    sectionTitle('EQUIPE (FSENSE) E INTERRUPÇÕES');
    drawTabelaComMeta(data.ti.equipe);
    if (data.ti.pessoas.length > 0) {
      const pessoas = data.ti.pessoas;
      drawTable(['Colaborador', 'Horas medidas', '% Trabalho', '% Ocioso', 'Status'],
        pessoas.map((p) => [p.nome, p.horas, p.trabalho, p.ocioso, TEXTO_DO_STATUS[p.status]]),
        [contentW * 0.34, contentW * 0.18, contentW * 0.16, contentW * 0.16, contentW * 0.16],
        (ri, ci) => (ci === 4 ? COR_DO_STATUS[pessoas[ri].status] : undefined));
    }
  }

  // ── Projetos da TI ── (rodada 2 da TI)
  if (hasSection(sections, 'projects') && data.ti && data.ti.projetos.length > 0) {
    sectionTitle('PROJETOS DA TI');
    const projetos = data.ti.projetos;
    drawTable(['Projeto', 'Situação', 'Término', 'Além do término'],
      projetos.map((p) => [doc.splitTextToSize(p.nome, contentW * 0.5 - 4)[0] as string, p.situacao, p.termino, p.atraso]),
      [contentW * 0.5, contentW * 0.17, contentW * 0.15, contentW * 0.18],
      (ri, ci) => (ci === 3 && projetos[ri].atraso !== '—' ? COR_DO_STATUS.fora : undefined));
  }

  // ── Priority Distribution ──
  if (hasSection(sections, 'priority') && metrics && Object.keys(metrics.byPriority).length > 0) {
    sectionTitle('DISTRIBUIÇÃO POR PRIORIDADE');
    const total = metrics.total || 1;
    const prioRows = Object.entries(metrics.byPriority).map(([key, value]) => {
      const pct = Math.round((value / total) * 100);
      return [PRIORITY_LABELS[key] || key, `${value}`, `${pct}%`];
    });
    drawTable(['Prioridade', 'Quantidade', '% do Total'], prioRows, [contentW * 0.4, contentW * 0.3, contentW * 0.3]);
  }

  // ── Category Distribution ──
  // A TI manda a árvore (Sistemas › Forteplus › …), como a Visão Geral mostra.
  if (hasSection(sections, 'category') && metrics && data.ti && data.ti.categorias.length > 0) {
    sectionTitle('CHAMADOS POR CATEGORIA E SUBCATEGORIA');
    const total = metrics.total || 1;
    const categorias = data.ti.categorias;
    drawTable(['Categoria', 'Chamados', '% do Total'],
      categorias.map((c) => [`${'    '.repeat(c.nivel)}${c.nivel ? '- ' : ''}${c.nome}`, `${c.chamados}`, `${Math.round((c.chamados / total) * 100)}%`]),
      [contentW * 0.6, contentW * 0.2, contentW * 0.2],
      (ri) => (categorias[ri].nivel === 0 ? DARK : GRAY));
  } else if (hasSection(sections, 'category') && metrics && Object.keys(metrics.byCategory).length > 0) {
    sectionTitle('DISTRIBUIÇÃO POR CATEGORIA');
    const total = metrics.total || 1;
    const catRows = Object.entries(metrics.byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => {
        const pct = Math.round((count / total) * 100);
        return [cat, `${count}`, `${pct}%`];
      });
    drawTable(['Categoria', 'Chamados', '% do Total'], catRows, [contentW * 0.5, contentW * 0.25, contentW * 0.25]);
  }

  // ── Trends ──
  if (hasSection(sections, 'trends') && data.trends && data.trends.length > 0) {
    sectionTitle('TENDÊNCIA DIÁRIA');
    const trendRows = data.trends.slice(-14).map(t => [
      format(new Date(t.date), 'dd/MM', { locale: ptBR }),
      `${t.opened}`,
      `${t.resolved}`,
      `${t.opened - t.resolved > 0 ? '+' : ''}${t.opened - t.resolved}`,
    ]);
    drawTable(['Data', 'Abertos', 'Resolvidos', 'Saldo'], trendRows, [contentW * 0.25, contentW * 0.25, contentW * 0.25, contentW * 0.25]);
  }

  // ── Assets & Infrastructure ──
  if (hasSection(sections, 'assets')) {
    sectionTitle('ATIVOS E INFRAESTRUTURA');
    drawTable(
      ['Indicador', 'Valor'],
      [
        ['Equipamentos em uso', `${data.activeAssets} de ${data.totalAssets}`],
        ['Licenças Expirando (30 dias)', `${data.expiringLicenses}`],
        ['Contratos Expirando (30 dias)', `${data.expiringContractsCount}`],
        ['Manutenções Agendadas', `${data.scheduledMaintenancesCount}`],
      ],
      [contentW * 0.6, contentW * 0.4]
    );
  }

  // Final footer
  addFooter();

  const fileName = `relatorio-ti-${format(new Date(), 'yyyy-MM-dd-HHmm')}.pdf`;
  await entregarPdf(doc, fileName);
}
