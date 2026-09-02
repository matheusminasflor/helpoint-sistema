import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TicketMetrics, TicketTrend, MetricsFilter, getDateRangeFromPeriod } from '@/hooks/useHelpdeskMetrics';

interface ComparativeData {
  current: number;
  previous: number;
  percentageChange: number;
  trend: 'up' | 'down' | 'stable';
}

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
}

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

function calculateChange(current: number, previous: number): ComparativeData {
  const diff = current - previous;
  const pct = previous === 0 ? (current > 0 ? 100 : 0) : Math.round((diff / previous) * 100);
  return { current, previous, percentageChange: pct, trend: pct > 1 ? 'up' : pct < -1 ? 'down' : 'stable' };
}

function hasSection(sections: string[] | undefined, id: string): boolean {
  return !sections || sections.includes(id);
}

export function generatePDFReport(data: PDFReportData): void {
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
    doc.text('Relatório gerado automaticamente • Sistema de Gestão TI', MARGIN_X, ph - 7);
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
    checkPageBreak(30);
    doc.setFillColor(...BRAND_COLOR);
    doc.rect(MARGIN_X, yPos, 3, 14, 'F');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DARK);
    doc.text(title, MARGIN_X + 8, yPos + 10);
    yPos += 20;
  };

  const drawTable = (headers: string[], rows: string[][], colWidths: number[]) => {
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
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...DARK);
      x = MARGIN_X + 3;
      row.forEach((cell, ci) => {
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
  doc.text('TI', MARGIN_X + 16, 72);

  doc.setTextColor(...WHITE);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('RELATÓRIO DE', MARGIN_X, 130);
  doc.text('MÉTRICAS TI', MARGIN_X, 145);

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

    const cardW = (contentW - 12) / 4;
    const cardH = 32;
    drawKPICard(MARGIN_X, yPos, cardW, cardH, 'Chamados Abertos', `${metrics.open}`, [234, 88, 12]);
    drawKPICard(MARGIN_X + cardW + 4, yPos, cardW, cardH, 'SLA Cumprido', `${metrics.slaCompliance}%`, [37, 99, 235]);
    drawKPICard(MARGIN_X + (cardW + 4) * 2, yPos, cardW, cardH, 'Resolvidos', `${metrics.resolved}`, [22, 163, 74]);
    drawKPICard(MARGIN_X + (cardW + 4) * 3, yPos, cardW, cardH, 'Tempo Médio', `${metrics.avgResolutionTime}h`, [100, 116, 139]);
    yPos += cardH + 12;

    const summaryRows = [
      ['Total de Chamados', `${metrics.total}`, prevMetrics ? `${prevMetrics.total}` : '—'],
      ['Chamados Abertos', `${metrics.open}`, prevMetrics ? `${prevMetrics.open}` : '—'],
      ['Em Andamento', `${metrics.inProgress}`, prevMetrics ? `${prevMetrics.inProgress}` : '—'],
      ['Resolvidos', `${metrics.resolved}`, prevMetrics ? `${prevMetrics.resolved}` : '—'],
      ['Fechados', `${metrics.closed}`, prevMetrics ? `${prevMetrics.closed}` : '—'],
      ['SLA Cumprido', `${metrics.slaCompliance}%`, prevMetrics ? `${prevMetrics.slaCompliance}%` : '—'],
      ['Tempo Médio (horas)', `${metrics.avgResolutionTime}`, prevMetrics ? `${prevMetrics.avgResolutionTime}` : '—'],
    ];
    drawTable(['Indicador', 'Atual', 'Anterior'], summaryRows, [contentW * 0.5, contentW * 0.25, contentW * 0.25]);
  }

  // ── Assets & Infrastructure ──
  if (hasSection(sections, 'assets')) {
    if (yPos === 0 || yPos < MARGIN_TOP) { doc.addPage(); yPos = MARGIN_TOP; }
    sectionTitle('ATIVOS E INFRAESTRUTURA');
    drawTable(
      ['Indicador', 'Valor'],
      [
        ['Ativos Ativos', `${data.activeAssets} de ${data.totalAssets}`],
        ['Licenças Expirando (30 dias)', `${data.expiringLicenses}`],
        ['Contratos Expirando (30 dias)', `${data.expiringContractsCount}`],
        ['Manutenções Agendadas', `${data.scheduledMaintenancesCount}`],
      ],
      [contentW * 0.6, contentW * 0.4]
    );
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
  if (hasSection(sections, 'category') && metrics && Object.keys(metrics.byCategory).length > 0) {
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

  // ── Comparative ──
  if (hasSection(sections, 'comparative') && prevMetrics && metrics) {
    sectionTitle('COMPARATIVO COM PERÍODO ANTERIOR');
    const comparisons = [
      { label: 'Total de Chamados', current: metrics.total, previous: prevMetrics.total },
      { label: 'Chamados Abertos', current: metrics.open, previous: prevMetrics.open },
      { label: 'Resolvidos', current: metrics.resolved, previous: prevMetrics.resolved },
      { label: 'SLA Cumprido (%)', current: metrics.slaCompliance, previous: prevMetrics.slaCompliance },
      { label: 'Tempo Médio (h)', current: metrics.avgResolutionTime, previous: prevMetrics.avgResolutionTime },
    ];
    const compRows = comparisons.map(c => {
      const change = calculateChange(c.current, c.previous);
      const arrow = change.trend === 'up' ? '↑' : change.trend === 'down' ? '↓' : '→';
      const sign = change.percentageChange > 0 ? '+' : '';
      return [c.label, `${c.previous}`, `${c.current}`, `${arrow} ${sign}${change.percentageChange}%`];
    });
    drawTable(['Indicador', 'Anterior', 'Atual', 'Variação'], compRows, [contentW * 0.35, contentW * 0.2, contentW * 0.2, contentW * 0.25]);
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

  // Final footer
  addFooter();

  const fileName = `relatorio-ti-${format(new Date(), 'yyyy-MM-dd-HHmm')}.pdf`;
  doc.save(fileName);
}
