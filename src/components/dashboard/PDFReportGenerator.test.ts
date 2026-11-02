import { describe, expect, it, vi } from 'vitest';

// O gerador importa `getDateRangeFromPeriod` do hook, que abre o cliente do Supabase; no teste não há banco.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

// Um jsPDF de mentira: anota o texto escrito e as páginas, e não baixa nada.
const escrito: { textos: string[]; paginas: number; salvos: number } = { textos: [], paginas: 1, salvos: 0 };
vi.mock('jspdf', () => ({
  jsPDF: class {
    internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
    text(t: string | string[]) { escrito.textos.push(([] as string[]).concat(t).join(' ')); return this; }
    addPage() { escrito.paginas++; return this; }
    save() { escrito.salvos++; }
    splitTextToSize(t: string) { return [t]; }
    setFillColor() { return this; } rect() { return this; } roundedRect() { return this; }
    setFontSize() { return this; } setFont() { return this; } setTextColor() { return this; }
  },
}));

import { generatePDFReport, type PDFReportData } from './PDFReportGenerator';

describe('o PDF dos Indicadores da TI (rodada 2: leva o que a Visão Geral mostra)', () => {
  const metrics = {
    total: 45, open: 2, inProgress: 7, resolved: 30, chamados: [], slaCompliance: 76, avgResolutionTime: 9.9,
    avgFirstResponseTime: 1, firstResponseCompliance: 93, byCategory: { Sistemas: 28, Hardware: 11 }, byPriority: { medium: 45 },
    agendados: 5, horasAgendadas: 44, agendadosVencidos: 6, slaViolated: 4, slaViolationRate: 9, avgOverdueTime: 3,
    violatedByPriority: {}, violatedByCategory: {},
  };
  const dados: PDFReportData = {
    metrics, previousMetrics: { ...metrics, slaCompliance: 71 }, trends: [{ date: '2026-10-26', opened: 9, resolved: 7 }],
    filter: { period: 'custom', startDate: new Date(2026, 9, 26), endDate: new Date(2026, 10, 1) },
    activeAssets: 8, totalAssets: 8, expiringLicenses: 0, expiringContractsCount: 0, scheduledMaintenancesCount: 0,
    ti: {
      resumo: 'De 26/10/2026 a 01/11/2026: 45 chamados, 30 resolvidos. O SLA ficou em 76%, abaixo da meta de 90%.',
      chamados: [{ indicador: 'SLA cumprido', meta: 'pelo menos 90%', anterior: '71%', atual: '76%', status: 'fora' }],
      equipe: [{ indicador: '% Trabalho da equipe', meta: 'pelo menos 60%', anterior: '60%', atual: '52,4%', status: 'atencao' }],
      pessoas: [{ nome: 'Pessoa A', horas: '10,2 h', trabalho: '85,1%', ocioso: '10,3%', status: 'no_alvo' }],
      projetos: [{ nome: 'Sistema Helpoint: desenvolvimento e implantação', situacao: 'Em andamento', termino: '31 de ago', atraso: '63 dias' }],
      categorias: [{ nome: 'Sistemas', nivel: 0, chamados: 28 }, { nome: 'Forteplus', nivel: 1, chamados: 20 }],
    },
  };

  it('com todas as seções: resumo, metas com status, equipe, projetos e categorias em níveis', () => {
    generatePDFReport(dados);
    expect(escrito.textos).toEqual(expect.arrayContaining([
      dados.ti!.resumo, 'EQUIPE (FSENSE) E INTERRUPÇÕES', 'PROJETOS DA TI', 'CHAMADOS POR CATEGORIA E SUBCATEGORIA',
      'Fora', 'Atenção', 'No alvo', '63 dias', '    - Forteplus',
    ]));
    expect(escrito.salvos).toBe(1);
  });

  it('sem o Resumo marcado, a primeira seção abre página nova em vez de cair na capa', () => {
    escrito.paginas = 1;
    generatePDFReport({ ...dados, selectedSections: ['cover', 'team'] });
    expect(escrito.paginas).toBe(2);
  });
});
