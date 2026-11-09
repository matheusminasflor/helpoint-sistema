// Marketing › Indicadores, no formato da TI (dono, 2026-11-03; projeto aprovado, versão 2,
// https://claude.ai/artifact/QGkXebKXNYA4tPcfSC9XUR; docs/proposta-indicadores-marketing.md):
//   · o mesmo filtro de período da TI (abre na semana passada), comparado com o período anterior;
//   · Visão Geral = o relatório da reunião: atenção agora, a frase, os cinco números de chamado com meta e cor
//     (Configurações de Marketing › Metas), os Artistas, as fontes de fora (esperando as chaves), os pedidos de arte, o
//     estoque e o Benefício de sexta, as categorias e os abertos × resolvidos;
//   · Analítico = o detalhe dos chamados, a prioridade, os Artistas mês a mês, as redes sociais e os padrões;
//   · Apresentar e Exportar PDF, como na TI. Nada que a tela mostrava antes saiu: mudou de lugar.
// Proposta v4 (2026-11-07, https://claude.ai/artifact/4YkGvumGgu6Z9JmgmwodQr): escolha de conta no topo, três destaques,
// "do anúncio à venda", leads e vendas do Kommo por segmento, tráfego e redes em tabela por conta; chamados, artistas e
// operação descem fechados. Mês inteiro usa o mês da Meta (`mkt_redes_mes`); o Kommo é por dia.
import { COR, COR_ABERTOS, COR_DA_PRIORIDADE, COR_RESOLVIDOS, EIXO } from '@/config/cores-dos-graficos';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, BarChart3, CheckCircle2, ClipboardPaste, Clock, Download, Inbox, Presentation, Share2, ShieldCheck, Target, Timer } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { TutorialDoRelatorio } from '@/components/ajuda/TutorialDoRelatorio';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { KPICard } from '@/components/glpi/KPICard';
import { RankCard, type RankRow } from '@/components/dashboard/RankCard';
import { IndicatorsView } from '@/components/dashboard/IndicatorsView';
import { ExplicacaoDoIndicador } from '@/components/ajuda/ExplicacaoDoIndicador';
import { PatternsAnalysis } from '@/components/ti/PatternsAnalysis';
import { CategoriasDosChamados } from '@/components/ti/CategoriasDosChamados';
import { LinhaAgendaEAjuda } from '@/components/dashboard/AjudaAOutrosSetoresKPI';
import { OutrosIndicadoresDoMarketing } from '@/components/mkt/OutrosIndicadoresDoMarketing';
import {
  Compara, Destaques, DuasFontes, EscolhaDeConta, LancarSemana, LeadsEVendas, NumerosGrandes, RedesSociais, TrafegoPorConta, VendasDoPeriodo,
} from '@/components/mkt/RedesETrafego';
import { useIndicadoresDoMarketing } from '@/hooks/useIndicadoresDoMarketing';
import { useFaturadoDoKommo, useKommo, useMesesDaMeta, usePublicoDoInstagram, useRedesETrafego, useVendasDoKommo } from '@/hooks/useRedesETrafego';
import { fatias, horariosTexto, nomeDoPais, publicoDoMes } from '@/lib/publico-do-instagram';
import {
  comASemanaEmAndamento, fraseDasRedes, NOME_DO_FORMATO, painelDasRedes, pctTexto, semanaASemana, TODAS, ultimasSemanas,
} from '@/lib/redes-e-trafego';
import { comFaturado, destaquesDoPeriodo, ehMesInteiro, leadsPorSemana, pendenciasDoKommo, periodoCurto, resumoComFaturado, resumoDoKommo } from '@/lib/leads-e-vendas';
import { ArtistasDoMes, ArtistasMesAMes } from '@/components/mkt/ArtistasNosIndicadores';
import { SeloDaMeta } from '@/components/mkt/SeloDaMeta';
import { DicaDoGrafico } from '@/components/dashboard/DicaDoGrafico';
import { ModoApresentacao } from '@/components/dashboard/ModoApresentacao';
import { ExportPDFDialog, type SectionDef } from '@/components/dashboard/ExportPDFDialog';
import type { DadosDaTINoPDF, TabelaDoPDF } from '@/components/dashboard/PDFReportGenerator';
import {
  useTicketMetrics, useTicketTrends, usePreviousMetrics, useViolatedSlaTickets, type MetricsFilter, filtroDoPeriodo,
  getPreviousPeriodRange, intervaloDoFiltro, useSerieDosChamados,
} from '@/hooks/useHelpdeskMetrics';
import { useMKTSocialPosts } from '@/hooks/useMKTSocialPosts';
import { metaParada, useLigacaoMeta } from '@/hooks/useLigacaoMeta';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useQueryState } from '@/hooks/useQueryState';
import { usePeriodoNaUrl } from '@/hooks/usePeriodoNaUrl';
import { useConfiguracaoDosSetores } from '@/hooks/useAccessProfiles';
import { useMetasDaTI } from '@/hooks/useMetasDaTI';
import { useArtistas, useEntregasEntre, useResumoDosArtistas, useReunioesDosArtistas } from '@/hooks/useArtistasMkt';
import { META_DA_TI, metaNoDia, notaDaMeta } from '@/config/metas-da-ti';
import { PERIODOS_DA_REUNIAO, rotuloDoIntervalo, type IntervaloDeDias } from '@/lib/period';
import { toLocalISODate, todayISO } from '@/lib/dates';
import { COR_DO_FAROL, diasDoPeriodo, farol, periodoDoIntervalo, somarDias } from '@/lib/ti-equipe';
import { fraseDoResumo } from '@/lib/resumo-da-ti';
import { barrasDaTendencia } from '@/lib/tendencia';
import { formatarHoras } from '@/lib/horas';
import { arvoreDosChamados, type No } from '@/lib/arvore-de-categorias';
import { STATUS_DO_ARTISTA, artistasMesAMes } from '@/lib/artistas-nos-indicadores';
import { artistasNoRecorte, periodosDoRecorte, recorteDoPeriodo, rotuloDoRecorte, type Recorte } from '@/lib/semanas-dos-artistas';
import { formatBRL } from '@/lib/crm';
import { cn } from '@/lib/utils';
import { SOCIAL_PLATFORM_LABELS } from '@/types/mkt';

const PRIORITY_LABEL: Record<string, string> = { critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa' };

const SECOES_DA_VISAO = [
  { id: 'mkt-resumo', rotulo: 'Destaques' },
  { id: 'mkt-funil', rotulo: 'Resumo' },
  { id: 'mkt-leads', rotulo: 'Leads por segmento' },
  { id: 'mkt-vendas', rotulo: 'Vendas' },
  { id: 'mkt-trafego', rotulo: 'Tráfego' },
  { id: 'mkt-redes', rotulo: 'Redes' },
  { id: 'mkt-artistas', rotulo: 'Artistas' },
  { id: 'mkt-chamados', rotulo: 'Chamados' },
];

const SECOES_DO_ANALITICO = [
  { id: 'analitico-chamados', rotulo: 'Chamados' },
  { id: 'analitico-categorias', rotulo: 'Categorias' },
  { id: 'analitico-prioridade', rotulo: 'Prioridade' },
  { id: 'analitico-atencao', rotulo: 'Fora do prazo agora' },
  { id: 'analitico-pessoas', rotulo: 'Por pessoa e quem abre' },
  { id: 'analitico-artistas', rotulo: 'Artistas mês a mês' },
  { id: 'analitico-redes', rotulo: 'Redes sociais' },
  { id: 'analitico-padroes', rotulo: 'Padrões' },
];

const SECOES_DO_PDF: SectionDef[] = [
  { id: 'cover', label: 'Capa', description: 'Página de capa com título e período', locked: true },
  { id: 'executive_summary', label: 'Resumo', description: 'A frase de resumo e os números de chamado com meta, anterior e status' },
  { id: 'social', label: 'Redes, tráfego, leads e vendas', description: 'Cada conta com o período anterior, o tráfego por conta e os leads e vendas do Kommo' },
  { id: 'artists', label: 'Artistas', description: 'A semana do mês dos artistas (ou o mês inteiro), com a bonificação e o anterior' },
  { id: 'others', label: 'Pedidos de arte, estoque e Benefício de sexta', description: 'Os três blocos da Visão Geral' },
  { id: 'category', label: 'Chamados por categoria', description: 'Categorias e subcategorias, como na Visão Geral' },
  { id: 'trends', label: 'Abertos × resolvidos por dia', description: 'Os últimos 14 dias do período' },
  { id: 'priority', label: 'Por prioridade', description: 'Chamados agrupados por prioridade' },
];

const fimDoMes = (mesISO: string) => {
  const [a, m] = mesISO.split('-').map(Number);
  return `${mesISO.slice(0, 7)}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`;
};
const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function MKTRelatorios() {
  const tenantPath = useTenantPath();
  const navigate = useNavigate();
  const { periodo, intervalo, escolher, definirIntervalo } = usePeriodoNaUrl<string>('semana_passada');
  const [activeTab, setActiveTab] = useQueryState<string>('aba', 'overview');
  const [apresentando, setApresentando] = useState(false);
  const [exportando, setExportando] = useState(false);

  // O período manda em todo bloco: todos leem este `filter` (ou o intervalo dele).
  const filter: MetricsFilter = { ...filtroDoPeriodo(periodo, intervalo), module: 'marketing' };
  const intervaloDaTela: IntervaloDeDias = intervaloDoFiltro(filter);
  const anteriorDaTela = getPreviousPeriodRange(filter);
  const hoje = todayISO();

  const { data: metrics } = useTicketMetrics(filter);
  const { data: previousMetrics } = usePreviousMetrics(filter);
  // Período anterior sem chamado nenhum não é base de comparação (como na TI).
  const anterior = previousMetrics && previousMetrics.total > 0 ? previousMetrics : null;
  const { data: trends } = useTicketTrends(filter);
  const { data: violados = [] } = useViolatedSlaTickets(filter);
  const { data: serie } = useSerieDosChamados(filter);
  const metas = useMetasDaTI('marketing');
  const perfil = useConfiguracaoDosSetores();
  const podeExportar = perfil.pode('marketing', 'reports', 'export');
  const podeMudarMetas = !perfil.isLoading
    && (perfil.alteraAba('marketing', 'chamados') || perfil.pode('diretoria', 'indicadores', 'definir_metas'));
  const outros = useIndicadoresDoMarketing(intervaloDaTela.de, intervaloDaTela.ate);
  // O selo da Meta: o ↻ aparece para quem a função aceita, gestor para cima (`is_supervisor_or_higher`).
  const ligacaoMeta = useLigacaoMeta();
  const { role } = useAuth();
  const podeConectarMeta = role === 'owner' || role === 'admin' || role === 'manager';
  const { data: allPosts = [] } = useMKTSocialPosts();

  // Redes sociais e Tráfego pago (proposta v3, 2026-11-03): o período ao lado do anterior, conta por conta.
  const anteriorISO = { de: toLocalISODate(anteriorDaTela.startDate), ate: toLocalISODate(anteriorDaTela.endDate) };
  const dasSemanas = comASemanaEmAndamento(intervaloDaTela, hoje);
  // O gráfico termina na semana de hoje quando o período ainda não acabou: "Este mês" mostrava as semanas que não vieram.
  const fimDoGrafico = [intervaloDaTela.ate, hoje].sort()[0];
  const semanal = useRedesETrafego(dasSemanas, anteriorISO, fimDoGrafico);
  // Mês inteiro: o mês da Meta, do dia 1 ao último (as semanas contam no mês do domingo e perdiam os últimos dias). Sem a
  // linha do mês ainda buscada, ficam as semanas.
  const mesInteiro = ehMesInteiro(intervaloDaTela) && ehMesInteiro(anteriorISO);
  const meses = useMesesDaMeta(`${somarDias(anteriorISO.de, -1).slice(0, 8)}01`, intervaloDaTela.de, mesInteiro);
  const usarMeses = mesInteiro && meses.redes.some((l) => l.semana === intervaloDaTela.ate);
  const painel = usarMeses
    ? painelDasRedes(meses.redes, meses.trafego, intervaloDaTela, anteriorISO)
    : painelDasRedes(semanal.redes, semanal.trafego, dasSemanas, anteriorISO);
  const domingosDoGrafico = ultimasSemanas(fimDoGrafico, 6);
  const grafico = semanaASemana(semanal.redes, semanal.trafego, domingosDoGrafico, painel.contas.map((c) => c.atual.conta));
  const [conta, setConta] = useQueryState<string>('conta', TODAS);
  // O Kommo é por dia: o período, o anterior e as semanas do gráfico.
  const kommo = useKommo([anteriorISO.de, somarDias(domingosDoGrafico[0], -6)].sort()[0], [intervaloDaTela.ate, hoje].sort()[1]);
  // As vendas com nome e link e o que corrigir no Kommo (proposta v5); a de Distribuidor vale o faturado do Forteplus
  // (parte 4.3), no período e no anterior.
  const { data: vendasDoKommo = [] } = useVendasDoKommo(anteriorISO.de < intervaloDaTela.de ? anteriorISO.de : intervaloDaTela.de, intervaloDaTela.ate);
  const { data: faturados = [] } = useFaturadoDoKommo(anteriorISO.de < intervaloDaTela.de ? anteriorISO.de : intervaloDaTela.de, intervaloDaTela.ate);
  const todasAsVendas = comFaturado(vendasDoKommo, faturados);
  const vendas = todasAsVendas.filter((v) => v.fechou >= intervaloDaTela.de && v.fechou <= intervaloDaTela.ate);
  const kommoAtual = resumoComFaturado(resumoDoKommo(kommo.linhas, kommo.perdas, intervaloDaTela), todasAsVendas, intervaloDaTela);
  const kommoAntes = resumoComFaturado(resumoDoKommo(kommo.linhas, kommo.perdas, anteriorISO), todasAsVendas, anteriorISO);
  const leadsDasSemanas = leadsPorSemana(kommo.linhas, domingosDoGrafico, somarDias);
  const pendencias = pendenciasDoKommo(vendas, intervaloDaTela);
  const destaques = destaquesDoPeriodo(kommoAtual, kommoAntes, {
    investimento: conta === TODAS ? painel.trafego.atual.investimento : painel.contas.find((c) => c.atual.conta === conta)?.atual.investimento ?? null,
    investimentoAntes: conta === TODAS ? painel.trafego.anterior.investimento : painel.contas.find((c) => c.atual.conta === conta)?.anterior.investimento ?? null,
    custoPorVisita: conta === TODAS ? painel.trafego.atual.custoPorVisita : painel.contas.find((c) => c.atual.conta === conta)?.atual.custoPorVisita ?? null,
  });
  const { data: linhasDoPublico = [] } = usePublicoDoInstagram(intervaloDaTela.ate);
  const podeLancar = perfil.pode('marketing', 'reports', 'lancar');
  const [lancando, setLancando] = useState(false);

  // Artistas pelas semanas do mês deles, como na planilha (dono, 2026-11-03): o período da tela escolhe o recorte
  // (26/10 a 01/11 → outubro S4); o bloco troca de mês e de semana sem mexer no resto da tela.
  const { data: artistas = [] } = useArtistas();
  const temArtistas = artistas.length > 0;
  const recorteDaTela = recorteDoPeriodo(intervaloDaTela);
  const [recorteEscolhido, setRecorteEscolhido] = useState<{ daTela: string; r: Recorte } | null>(null);
  const chaveDaTela = `${intervaloDaTela.de}|${intervaloDaTela.ate}`;
  const recorte = recorteEscolhido?.daTela === chaveDaTela ? recorteEscolhido.r : recorteDaTela;
  const doRecorte = periodosDoRecorte(recorte);
  const { data: entregasDoRecorte = [] } = useEntregasEntre(doRecorte.anterior.de, doRecorte.acumulado.ate, temArtistas);
  const inicioDoHistorico = `${Number(hoje.slice(0, 4)) - 1}-${hoje.slice(5, 7)}-01`;
  const { data: historico = [] } = useResumoDosArtistas(inicioDoHistorico, hoje, temArtistas);
  const { data: reunioes = new Set<string>() } = useReunioesDosArtistas(temArtistas);
  const noRecorte = useMemo(() => artistasNoRecorte(artistas, entregasDoRecorte, reunioes, recorte), [artistas, entregasDoRecorte, reunioes, recorte]);
  const mesAMes = useMemo(() => artistasMesAMes(artistas, historico, reunioes), [artistas, historico, reunioes]);
  const rotulo = rotuloDoRecorte(recorte, hoje);
  const tw = noRecorte.total;
  const fraseDoRecorte = recorte.semana
    ? `Artistas, ${rotulo.titulo}: ${tw.semana.stories} stories, ${tw.semana.reels} reels e ${tw.semana.feed} no feed na semana; a bonificação do mês até ela está em ${formatBRL(tw.valor)} (${tw.teto ? pct(tw.valor / tw.teto) : '—'} do teto).`
    : `Artistas, ${rotulo.titulo}: ${tw.mes.stories} stories, ${tw.mes.reels} reels e ${tw.mes.feed} no feed; a bonificação ${rotulo.situacao === 'mês fechado' ? 'fechou' : 'está'} em ${formatBRL(tw.valor)} (${tw.teto ? pct(tw.valor / tw.teto) : '—'} do teto).`;

  // A meta é a que vale no último dia do período (Configurações de Marketing › Metas; padrão em `config/metas-da-ti`).
  const meta = (chave: string) => metaNoDia(metas.data, chave, intervaloDaTela.ate);
  const notaDoCartao = (chave: string, sufixo: string) =>
    // O tempo na mesma unidade do número ("2 d 9 h" × "até 1 d"), sem conta de cabeça (revisão de 2026-11-03).
    notaDaMeta(metas.data, chave, intervaloDaTela.ate, (v) => (sufixo === ' h' ? formatarHoras(v) : `${v.toLocaleString('pt-BR')}${sufixo}`));
  const sla = metrics?.slaCompliance ?? 0;
  const primeira = metrics?.firstResponseCompliance ?? 0;
  const tempo = metrics?.avgResolutionTime ?? 0;
  const farolSla = farol(metrics ? sla : null, meta('sla_cumprido'), 'mais', true);
  const farolPrimeira = farol(metrics ? primeira : null, meta('primeira_resposta'), 'mais', true);
  const farolTempo = farol(metrics ? tempo : null, meta('tempo_medio_horas'), 'menos');
  const diasDaTela = diasDoPeriodo(periodoDoIntervalo(intervaloDaTela));
  // Quem segue muda devagar: só no período de um mês ou mais (proposta de 2026-11-04, "uma vez por mês").
  const publico = diasDaTela >= 28 ? publicoDoMes(linhasDoPublico, painel.contas.map((c) => c.atual.conta)) : [];
  const rotuloDaSerie = diasDaTela === 7 ? 'as últimas 8 semanas' : `os últimos 8 períodos de ${diasDaTela} dias`;

  const maiorSegmento = [...kommoAtual.segmentos].sort((a, b) => b.chegaram - a.chegaram)[0];
  const fraseDoKommo = kommoAtual.temDados
    ? `Chegaram ${kommoAtual.total.chegaram} leads, ${maiorSegmento.chegaram} de ${maiorSegmento.nome.toLowerCase()}; ${kommoAtual.total.ganhas} vendas ganhas e ${kommoAtual.total.perdidas} perdidas.`
    : '';
  const frase = [
    fraseDasRedes(painel),
    fraseDoKommo,
    fraseDoResumo({
      periodo: `De ${rotuloDoIntervalo(intervaloDaTela)}`,
      total: metrics?.total ?? 0, resolvidos: metrics?.resolved ?? 0, sla: metrics ? sla : null, metaSla: meta('sla_cumprido'),
      tempo: metrics?.avgResolutionTime ?? null, tempoAnterior: anterior?.avgResolutionTime ?? null,
      trabalho: null, semanaAConfirmar: false, projetosAlemDoTermino: 0,
    }),
    temArtistas ? fraseDoRecorte : '',
  ].filter(Boolean).join(' ');

  // Só com a semana dos artistas encerrada: com ela em andamento, acusaria todos (revisão de 2026-11-03).
  const semEntrega = doRecorte.semana.ate < hoje ? noRecorte.linhas.filter((l) => (recorte.semana ? l.semana : l.mes).pecas === 0).length : 0;
  const atencao = [
    metaParada(ligacaoMeta.data) && { texto: 'A ligação com a Meta parou', cor: 'perigo', para: '/configuracoes/integracoes' },
    violados.length > 0 && { texto: `${violados.length} ${violados.length === 1 ? 'chamado fora do prazo' : 'chamados fora do prazo'}`, cor: 'perigo', para: '/mkt/chamados' },
    outros.atrasados > 0 && { texto: `${outros.atrasados} ${outros.atrasados === 1 ? 'pedido de arte passou do prazo' : 'pedidos de arte passaram do prazo'}`, cor: 'aviso', para: '/mkt/pedidos-de-arte' },
    outros.abaixoDoMinimo.length > 0 && { texto: `${outros.abaixoDoMinimo.length} ${outros.abaixoDoMinimo.length === 1 ? 'produto abaixo do mínimo' : 'produtos abaixo do mínimo'}`, cor: 'aviso', para: '/mkt/estoque' },
    outros.foraDoPrazoAgora > 0 && { texto: `${outros.foraDoPrazoAgora} ${outros.foraDoPrazoAgora === 1 ? 'retirada do Benefício fora do prazo' : 'retiradas do Benefício fora do prazo'}`, cor: 'aviso', para: '/mkt/beneficio' },
    temArtistas && semEntrega > 0 && { texto: `${semEntrega} ${semEntrega === 1 ? 'artista sem entrega' : 'artistas sem entrega'} ${recorte.semana ? `na S${recorte.semana}` : 'no mês'}`, cor: 'aviso', para: '#artistas-do-marketing' },
  ].filter(Boolean) as { texto: string; cor: 'perigo' | 'aviso'; para: string }[];

  // Vindo do áudio do "Novo" (`?exportar=1`): abre a exportação, que depende do clique da pessoa para compartilhar.
  const [pedeExportar, setPedeExportar] = useQueryState<string>('exportar', '');
  useEffect(() => {
    if (pedeExportar !== '1' || perfil.isLoading) return;
    if (podeExportar) setExportando(true);
    setPedeExportar('');
  }, [pedeExportar, perfil.isLoading, podeExportar, setPedeExportar]);

  const rotuloDoPeriodo = PERIODOS_DA_REUNIAO.find((p) => p.value === periodo)?.label;
  // Uma forma só de escrever data, como o Google Analytics (proposta v4): "26 out – 1 nov 2026 · comparado com 19 – 25 out".
  const subtitulo = `${rotuloDoPeriodo ? `${rotuloDoPeriodo}: ` : ''}${periodoCurto(intervaloDaTela)} · comparado com ${periodoCurto(anteriorISO, false)}`;
  const barras = barrasDaTendencia(trends || []);

  const priorityData = Object.entries(metrics?.byPriority || {}).map(([k, v]) => ({ name: PRIORITY_LABEL[k] || k, value: v, fill: COR_DA_PRIORIDADE[k] || COR.eixo }));
  const scheduledPosts = allPosts.filter((p) => p.status === 'scheduled');
  const topPlatforms: RankRow[] = useMemo(() => {
    const map = new Map<string, number>();
    allPosts.filter((p) => p.status === 'scheduled').forEach((p) => {
      const k = SOCIAL_PLATFORM_LABELS[p.platform] || p.platform;
      map.set(k, (map.get(k) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, count]) => ({ label, count }));
  }, [allPosts]);

  const cartoesDosChamados = (
    <KPIGrid lgCols={5}>
      <KPICard value={metrics?.total ?? 0} label="Total de chamados" icon={Inbox} color="blue"
        anterior={anterior?.total ?? null} melhorQuando="neutro" explicacao="chamados.total"
        serie={serie?.map((p) => p.total)} rotuloDaSerie={rotuloDaSerie}
        onClick={() => navigate(tenantPath('/mkt/chamados'))} />
      <KPICard value={metrics?.resolved ?? 0} label="Chamados resolvidos" icon={CheckCircle2} color="green"
        nota={metrics?.total ? `${Math.round((metrics.resolved / metrics.total) * 100)}% do total` : undefined}
        anterior={anterior?.resolved ?? null} melhorQuando="mais" explicacao="chamados.resolvidos"
        serie={serie?.map((p) => p.resolvidos)} rotuloDaSerie={rotuloDaSerie}
        onClick={() => navigate(tenantPath('/mkt/chamados?status=resolved'))} />
      <KPICard value={`${sla}%`} numero={sla} label="SLA cumprido" icon={ShieldCheck} color={COR_DO_FAROL[farolSla]}
        anterior={anterior?.slaCompliance ?? null} melhorQuando="mais" formatarDiferenca={(n) => `${n} pontos`}
        nota={notaDoCartao('sla_cumprido', '%')} notaRuim={farolSla === 'fora'} explicacao="chamados.sla_cumprido"
        serie={serie?.map((p) => p.sla)} rotuloDaSerie={rotuloDaSerie} />
      <KPICard value={`${primeira}%`} numero={primeira} label="1ª resposta no prazo" icon={Timer} color={COR_DO_FAROL[farolPrimeira]}
        anterior={anterior?.firstResponseCompliance ?? null} melhorQuando="mais" formatarDiferenca={(n) => `${n} pontos`}
        nota={notaDoCartao('primeira_resposta', '%')} notaRuim={farolPrimeira === 'fora'} explicacao="chamados.primeira_resposta_no_prazo"
        serie={serie?.map((p) => p.primeira)} rotuloDaSerie={rotuloDaSerie} />
      <KPICard value={formatarHoras(tempo)} numero={tempo} label="Tempo médio de entrega" icon={Clock} color={COR_DO_FAROL[farolTempo]}
        anterior={anterior?.avgResolutionTime ?? null} melhorQuando="menos" formatarDiferenca={(n) => formatarHoras(Math.abs(n))}
        nota={notaDoCartao('tempo_medio_horas', ' h')} notaRuim={farolTempo === 'fora'} explicacao="chamados.tempo_medio_resolucao"
        serie={serie?.map((p) => p.tempo)} rotuloDaSerie={rotuloDaSerie} />
    </KPIGrid>
  );
  const artistasDoPeriodo = temArtistas && (
    <ArtistasDoMes recorte={recorte} onRecorte={(r) => setRecorteEscolhido({ daTela: chaveDaTela, r })} linhas={noRecorte.linhas} total={noRecorte.total} hoje={hoje} />
  );
  const categorias = <CategoriasDosChamados chamados={metrics?.chamados ?? []} modulo="marketing" />;
  const abertosResolvidos = (
    <Card className="p-5 space-y-3">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary" /> Abertos × resolvidos
        <ExplicacaoDoIndicador id="chamados.evolucao" />
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={barras} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke={COR.grade} vertical={false} />
          <XAxis dataKey="rotulo" tick={EIXO} interval="preserveStartEnd" />
          <YAxis tick={EIXO} width={30} allowDecimals={false} />
          <Tooltip content={<DicaDoGrafico />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="opened" name="Abertos" fill={COR_ABERTOS} radius={[3, 3, 0, 0]} />
          <Bar dataKey="resolved" name="Resolvidos" fill={COR_RESOLVIDOS} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );

  // O PDF leva o que a Visão Geral mostra, como na TI.
  const textoDaMeta = (v: number | undefined, sufixo: string, sentido: 'mais' | 'menos') =>
    (v === undefined ? '—' : `${sentido === 'mais' ? 'pelo menos' : 'até'} ${sufixo === ' h' ? formatarHoras(v) : `${v.toLocaleString('pt-BR')}${sufixo}`}`);
  const achatar = (nos: No[], nivel = 0): DadosDaTINoPDF['categorias'] =>
    nos.flatMap((no) => [{ nome: no.nome, nivel, chamados: no.chamados.length }, ...achatar(no.filhos, nivel + 1)]);
  const dadosDoPdf: DadosDaTINoPDF = {
    resumo: frase,
    chamados: [
      { indicador: 'Total de chamados', meta: '—', anterior: anterior ? `${anterior.total}` : '—', atual: `${metrics?.total ?? 0}`, status: 'sem_meta' },
      { indicador: 'SLA cumprido', meta: textoDaMeta(meta('sla_cumprido'), '%', 'mais'), anterior: anterior ? `${anterior.slaCompliance}%` : '—', atual: `${sla}%`, status: farolSla },
      { indicador: '1ª resposta no prazo', meta: textoDaMeta(meta('primeira_resposta'), '%', 'mais'), anterior: anterior ? `${anterior.firstResponseCompliance}%` : '—', atual: `${primeira}%`, status: farolPrimeira },
      { indicador: 'Tempo médio de entrega', meta: textoDaMeta(meta('tempo_medio_horas'), ' h', META_DA_TI.tempo_medio_horas.sentido), anterior: anterior ? formatarHoras(anterior.avgResolutionTime) : '—', atual: formatarHoras(tempo), status: farolTempo },
      { indicador: 'Chamados resolvidos', meta: '—', anterior: anterior ? `${anterior.resolved}` : '—', atual: `${metrics?.resolved ?? 0}`, status: 'sem_meta' },
    ],
    equipe: [], pessoas: [], projetos: [],
    categorias: achatar(arvoreDosChamados(metrics?.chamados ?? [])),
  };
  const n = (v: number | null) => (v === null ? '—' : Math.round(v).toLocaleString('pt-BR'));
  const r$ = (v: number | null) => (v === null ? '—' : formatBRL(v));
  const comAnterior = (a: string, b: string) => `${a} (era ${b})`;
  const tabelasDoPdf: TabelaDoPDF[] = [
    { secao: 'social', titulo: 'REDES SOCIAIS', cabecalho: ['Conta', 'Seguidores', 'Saldo', 'Visitas', 'Alcance', 'Visualizações', 'Engajamento', 'Feed/Reels/Stories'],
      linhas: painel.contas.map(({ atual: a, anterior: b }) => [
        a.conta, n(a.seguidores), a.saldo === null ? '—' : comAnterior(a.saldo > 0 ? `+${a.saldo}` : `${a.saldo}`, b.saldo === null ? '—' : `${b.saldo}`),
        comAnterior(n(a.visitas), n(b.visitas)), n(a.alcance), n(a.visualizacoes),
        a.engajamento === null ? '—' : `${a.engajamento.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`,
        `${n(a.feed)} / ${n(a.reels)} / ${n(a.stories)}`,
      ]),
      larguras: [0.12, 0.11, 0.14, 0.15, 0.11, 0.12, 0.11, 0.14] },
    { secao: 'social', titulo: 'MELHORES POSTS (ALCANCE)', cabecalho: ['Conta', 'Post', 'Formato', 'Pessoas alcançadas'],
      linhas: painel.contas.flatMap(({ atual: a }) => a.destaques.map((p) => [a.conta, p.legenda ?? 'Sem legenda', NOME_DO_FORMATO[p.tipo], n(p.alcance)])),
      larguras: [0.14, 0.56, 0.12, 0.18] },
    { secao: 'social', titulo: 'ALCANCE MÉDIO POR PUBLICAÇÃO', cabecalho: ['Conta', 'Reels', 'Feed', 'Stories'],
      linhas: painel.contas.map(({ atual: a }) => [a.conta, ...a.formatos.map((f) => `${n(f.media)} (${f.quantas})`)]),
      larguras: [0.25, 0.25, 0.25, 0.25] },
    ...(publico.length ? [{ secao: 'social' as const, titulo: 'QUEM SEGUE', cabecalho: ['Conta', 'Mulheres', 'No Brasil', 'Fora', 'Idade', 'Cidades', 'Mais online'],
      linhas: publico.map((p) => [
        p.conta, pctTexto(p.mulheres), pctTexto(p.brasil), fatias(p.fora, nomeDoPais), fatias(p.faixas), fatias(p.cidades), horariosTexto(p.horarios) || '—',
      ]),
      larguras: [0.1, 0.09, 0.09, 0.2, 0.17, 0.2, 0.15] }] : []),
    { secao: 'social', titulo: 'TRÁFEGO PAGO POR CONTA', cabecalho: ['Conta', 'Investimento', 'Alcance', 'Visitas', 'Custo por visita'],
      linhas: [
        ...painel.contas.map(({ atual: a, anterior: b }) => [a.conta, comAnterior(r$(a.investimento), r$(b.investimento)), n(a.alcancePago), n(a.visitasPagas), r$(a.custoPorVisita)]),
        ['Total', comAnterior(r$(painel.trafego.atual.investimento), r$(painel.trafego.anterior.investimento)), n(painel.trafego.atual.alcance),
          n(painel.trafego.atual.visitas), r$(painel.trafego.atual.custoPorVisita)],
      ],
      larguras: [0.18, 0.3, 0.16, 0.16, 0.2] },
    { secao: 'social', titulo: 'LEADS E VENDAS POR SEGMENTO (KOMMO)', cabecalho: ['Segmento', 'Chegaram', 'Ganhas', 'Perdidas', 'Taxa de ganho', 'Valor ganho'],
      linhas: [...kommoAtual.segmentos, { ...kommoAtual.total, k: 'total', nome: 'Total' }].map((s) => {
        const b = s.k === 'total' ? kommoAntes.total : kommoAntes.segmentos.find((x) => x.k === s.k)!;
        return [s.nome, comAnterior(`${s.chegaram}`, `${b.chegaram}`), comAnterior(`${s.ganhas}`, `${b.ganhas}`), comAnterior(`${s.perdidas}`, `${b.perdidas}`),
          s.taxa === null ? '—' : pct(s.taxa), s.valor ? formatBRL(s.valor) : '—'];
      }),
      larguras: [0.26, 0.16, 0.14, 0.14, 0.14, 0.16] },
    ...(vendas.some((v) => v.situacao === 'ganha') ? [{ secao: 'social' as const, titulo: 'VENDAS GANHAS (KOMMO)', cabecalho: ['Cliente', 'Segmento', 'Valor', 'Fechou'],
      linhas: vendas.filter((v) => v.situacao === 'ganha').map((v) => [v.nome, kommoAtual.segmentos.find((s) => s.k === v.funil)?.nome ?? v.funil,
        Number(v.valor) ? formatBRL(Number(v.valor)) : 'sem valor', `${v.fechou.slice(8, 10)}/${v.fechou.slice(5, 7)}`]),
      larguras: [0.4, 0.25, 0.2, 0.15] }] : []),
    ...(kommoAtual.motivos.length ? [{ secao: 'social' as const, titulo: 'POR QUE PERDEMOS', cabecalho: ['Motivo', 'Vendas perdidas'],
      linhas: kommoAtual.motivos.map((m) => [m.motivo, `${m.quantos}`]), larguras: [0.75, 0.25] }] : []),
    { secao: 'artists', titulo: `ARTISTAS · ${rotuloDoRecorte(recorte, hoje).titulo.toUpperCase()}`,
      cabecalho: [...(recorte.semana ? ['Artista', 'Na semana (St/Re/Fe)'] : ['Artista']), 'No mês (St/Re/Fe)', 'Bonificação', 'Anterior', 'Situação'],
      linhas: [...noRecorte.linhas.map((l) => [
        l.nome, ...(recorte.semana ? [`${l.semana.stories} / ${l.semana.reels} / ${l.semana.feed}`] : []), `${l.mes.stories} / ${l.mes.reels} / ${l.mes.feed}`,
        formatBRL(l.b.valor), l.anterior === null ? '—' : formatBRL(l.anterior), `${STATUS_DO_ARTISTA[l.b.status].texto} · ${pct(l.b.parteDoTeto)}`,
      ]), ['Total', ...(recorte.semana ? [`${noRecorte.total.semana.stories} / ${noRecorte.total.semana.reels} / ${noRecorte.total.semana.feed}`] : []),
        `${noRecorte.total.mes.stories} / ${noRecorte.total.mes.reels} / ${noRecorte.total.mes.feed}`, formatBRL(noRecorte.total.valor),
        noRecorte.total.anterior === null ? '—' : formatBRL(noRecorte.total.anterior), noRecorte.total.teto ? `${pct(noRecorte.total.valor / noRecorte.total.teto)} do teto` : ''],
      ],
      larguras: recorte.semana ? [0.2, 0.17, 0.17, 0.15, 0.13, 0.18] : [0.24, 0.2, 0.18, 0.16, 0.22] },
    { secao: 'others', titulo: 'PEDIDOS DE ARTE, ESTOQUE E BENEFÍCIO DE SEXTA', cabecalho: ['Indicador', 'Valor'],
      linhas: [
        ['Pedidos de arte no período', `${outros.pedidosNoPeriodo}`], ['Pedidos de arte entregues', `${outros.entreguesNoPeriodo}`],
        ['Pedidos de arte abertos agora', `${outros.abertos}`], ['Pedidos de arte que passaram do prazo', `${outros.atrasados}`],
        ['Produtos abaixo do mínimo no estoque', `${outros.abaixoDoMinimo.length}`],
        ['Retiradas do Benefício de sexta', `${outros.retiradasNoPeriodo}`], ['Voltaram com atraso', `${outros.devolvidasComAtraso}`],
        ['Fora do prazo agora', `${outros.foraDoPrazoAgora}`],
      ],
      larguras: [0.7, 0.3] },
  ];

  return (
    <div className="px-4 lg:px-8 pb-6 w-full">
      <DashboardHeader
        title="Indicadores — Marketing"
        subtitle={subtitulo}
        period={periodo}
        onPeriodChange={(v) => escolher(v, intervaloDaTela)}
        intervalo={intervalo}
        onIntervaloChange={definirIntervalo}
        periodOptions={PERIODOS_DA_REUNIAO}
        actions={
          <>
            <SeloDaMeta meta={ligacaoMeta.data} podeBuscar={role === 'owner' || role === 'admin'} />
            <TutorialDoRelatorio id="mkt-indicadores" />
            {podeLancar && (
              <Button size="sm" variant="outline" onClick={() => setLancando(true)}>
                <ClipboardPaste className="w-3.5 h-3.5 mr-1" />Lançamentos
              </Button>
            )}
            <Button size="sm" variant="default" className="max-[860px]:hidden" onClick={() => setApresentando(true)}>
              <Presentation className="w-3.5 h-3.5 mr-1" />Apresentar
            </Button>
            {podeExportar && (
              <Button size="sm" variant="outline" onClick={() => setExportando(true)}>
                <Download className="w-3 h-3 mr-1" />Exportar PDF
              </Button>
            )}
          </>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="detailed">Analítico</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          {atencao.length > 0 && (
            <div className="flex flex-wrap items-center gap-2" role="list" aria-label="O que pede atenção agora">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-status-danger" />Atenção agora
              </span>
              {atencao.map((a) => {
                const classe = cn('rounded-md px-3 py-1.5 text-sm font-semibold hover:underline', a.cor === 'perigo' ? 'badge-danger' : 'badge-warning');
                return a.para.startsWith('#') ? (
                  <button key={a.texto} type="button" role="listitem" className={classe}
                    onClick={() => (a.para === '#lancamentos' ? setLancando(true) : document.getElementById(a.para.slice(1))?.scrollIntoView({ behavior: 'smooth' }))}>{a.texto}</button>
                ) : (
                  <Link key={a.texto} to={tenantPath(a.para)} role="listitem" className={classe}>{a.texto}</Link>
                );
              })}
            </div>
          )}

          <nav aria-label="Seções da Visão Geral"
            className="sticky top-0 z-20 -mx-1 flex flex-wrap gap-1.5 bg-background/95 px-1 py-2 backdrop-blur">
            {SECOES_DA_VISAO.filter((s) => s.id !== 'mkt-artistas' || temArtistas).map((s) => (
              <button key={s.id} type="button" className="rounded-full border px-3 py-1 text-xs font-medium hover:bg-muted"
                onClick={() => {
                  const alvo = document.getElementById(s.id);
                  // Bloco fechado (artistas, chamados) abre ao ir até ele.
                  if (alvo instanceof HTMLDetailsElement) alvo.open = true;
                  alvo?.scrollIntoView({ behavior: 'smooth' });
                }}>{s.rotulo}</button>
            ))}
          </nav>

          {/* Proposta v4 (2026-11-07): a conta escolhida vale para a tela toda; os destaques abrem (posição serial). */}
          <div id="mkt-resumo" className="scroll-mt-14 space-y-3">
            <EscolhaDeConta contas={painel.contas.map((c) => c.atual.conta)} valor={conta} onEscolher={setConta} />
            <Destaques itens={destaques} />
            {usarMeses && <p className="text-xs text-muted-foreground">Redes e tráfego do mês inteiro, direto da Meta.</p>}
          </div>
          <div id="mkt-funil" className="scroll-mt-14"><DuasFontes painel={painel} conta={conta} kommo={kommoAtual} kommoAntes={kommoAntes} /></div>
          <div id="mkt-leads" className="scroll-mt-14"><LeadsEVendas atual={kommoAtual} anterior={kommoAntes} semanas={leadsDasSemanas} /></div>
          <div id="mkt-vendas" className="scroll-mt-14"><VendasDoPeriodo vendas={vendas} pendencias={pendencias} /></div>
          <div id="mkt-trafego" className="scroll-mt-14"><TrafegoPorConta painel={painel} conta={conta} grafico={grafico} /></div>
          <div id="mkt-redes" className="scroll-mt-14"><RedesSociais painel={painel} grafico={grafico} conta={conta} publico={publico} /></div>

          {temArtistas && (
            <details id="mkt-artistas" className="scroll-mt-14 rounded-lg border border-border">
              <summary className="cursor-pointer px-4 py-3 text-base font-semibold">
                Artistas · semana do mês dos artistas: {rotulo.titulo}
              </summary>
              <div className="px-4 pb-4">{artistasDoPeriodo}</div>
            </details>
          )}

          <details id="mkt-chamados" className="scroll-mt-14 rounded-lg border border-border">
            <summary className="cursor-pointer px-4 py-3 text-base font-semibold">
              Chamados do Marketing · {metrics?.total ?? 0} no período, SLA {sla}%
              {farolSla === 'fora' && <span className="ml-2 rounded-full px-2 py-0.5 text-xs badge-danger">abaixo da meta</span>}
            </summary>
            <div className="px-4 pb-4 space-y-4">
              {cartoesDosChamados}
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>A cor do número segue a meta: verde na meta, amarelo perto, vermelho fora. A linha embaixo mostra {rotuloDaSerie}.{!anterior && ' Sem chamados no período anterior para comparar.'}</span>
                {podeMudarMetas && (
                  <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                    <Link to={tenantPath('/mkt/configuracoes?aba=metas')}><Target className="h-3.5 w-3.5 mr-1" />Metas</Link>
                  </Button>
                )}
              </div>
              <LinhaAgendaEAjuda metrics={metrics} modulo="marketing" filter={filter} />
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {categorias}
                {abertosResolvidos}
              </div>
            </div>
          </details>

          {/* A operação abre ao clicar; o que pede ação já está nos avisos do topo. */}
          <details className="group rounded-lg border border-border">
            <summary className="cursor-pointer px-4 py-3 text-base font-semibold">Operação: pedidos de arte, estoque e Benefício de sexta</summary>
            <div className="px-4 pb-4"><OutrosIndicadoresDoMarketing r={outros} /></div>
          </details>

        </TabsContent>

        <TabsContent value="detailed">
          {/* Analítico (como na TI): detalhe por detalhe, com o índice no topo ao rolar. */}
          <nav aria-label="Seções do Analítico"
            className="sticky top-0 z-20 -mx-1 mt-3 flex flex-wrap gap-1.5 bg-background/95 px-1 py-2 backdrop-blur">
            {SECOES_DO_ANALITICO.filter((s) => s.id !== 'analitico-artistas' || temArtistas).map((s) => (
              <button key={s.id} type="button" className="rounded-full border px-3 py-1 text-xs font-medium hover:bg-muted"
                onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' })}>{s.rotulo}</button>
            ))}
          </nav>
          <div className="mt-2 space-y-6">
            <IndicatorsView metrics={metrics || null} previousMetrics={previousMetrics || null} filter={filter} soChamados />
            <Card id="analitico-prioridade" className="p-5 scroll-mt-20">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">Por prioridade <ExplicacaoDoIndicador id="chamados.por_prioridade" /></h3>
              {priorityData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">Nenhum chamado no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={priorityData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={COR.grade} horizontal={false} />
                    <XAxis type="number" tick={EIXO} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={EIXO} width={70} />
                    <Tooltip content={<DicaDoGrafico />} />
                    <Bar dataKey="value" name="Chamados" radius={[0, 6, 6, 0]}>
                      {priorityData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
            {temArtistas && <ArtistasMesAMes meses={mesAMes} />}
            <div id="analitico-redes" className="grid grid-cols-1 lg:grid-cols-2 gap-4 scroll-mt-20">
              <RankCard title="Plataformas com mais posts agendados" rows={topPlatforms} emptyText="Nenhum post agendado." explicacao="mkt.plataformas" />
              <Card className="p-5">
                <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><Share2 className="w-4 h-4" />Cronograma social <ExplicacaoDoIndicador id="mkt.cronograma" /></h3>
                <p className="text-sm text-muted-foreground mt-2">
                  {scheduledPosts.length} post(s) agendado(s) — veja no <Link className="text-primary underline" to={tenantPath('/mkt/social')}>Cronograma Social</Link>.
                </p>
              </Card>
            </div>
            <div id="analitico-padroes" className="scroll-mt-20"><PatternsAnalysis module="marketing" /></div>
          </div>
        </TabsContent>
      </Tabs>

      {apresentando && (
        <ModoApresentacao titulo="Indicadores do Marketing" subtitulo={`${periodoCurto(intervaloDaTela)} · comparado com ${periodoCurto(anteriorISO, false)}`} onSair={() => setApresentando(false)} telas={[
          { titulo: 'Destaques', conteudo: (
            <div className="space-y-6">
              <Destaques itens={destaques} grande />
              {atencao.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {atencao.map((a) => (
                    <span key={a.texto} className={cn('rounded-md px-3 py-1.5 text-base font-semibold', a.cor === 'perigo' ? 'badge-danger' : 'badge-warning')}>{a.texto}</span>
                  ))}
                </div>
              )}
            </div>
          ) },
          { titulo: 'Tráfego pago e leads', conteudo: <DuasFontes painel={painel} conta={TODAS} kommo={kommoAtual} kommoAntes={kommoAntes} /> },
          { titulo: 'Leads e vendas', conteudo: (
            <div className="space-y-6">
              <NumerosGrandes numeros={[
                { rotulo: 'Leads que chegaram', valor: n(kommoAtual.total.chegaram), nota: <Compara atual={kommoAtual.total.chegaram} anterior={kommoAntes.total.chegaram} /> },
                { rotulo: 'Vendas ganhas', valor: n(kommoAtual.total.ganhas), tom: 'bom', nota: <Compara atual={kommoAtual.total.ganhas} anterior={kommoAntes.total.ganhas} /> },
                { rotulo: 'Vendas perdidas', valor: n(kommoAtual.total.perdidas), tom: 'ruim', nota: <Compara atual={kommoAtual.total.perdidas} anterior={kommoAntes.total.perdidas} melhor="menos" /> },
                { rotulo: 'Segmento que mais trouxe', valor: `${maiorSegmento.chegaram}`, nota: maiorSegmento.nome },
              ]} />
              <LeadsEVendas atual={kommoAtual} anterior={kommoAntes} semanas={[]} />
            </div>
          ) },
          { titulo: 'Vendas do período', conteudo: <VendasDoPeriodo vendas={vendas} pendencias={pendencias} /> },
          { titulo: 'Tráfego pago por conta', conteudo: <TrafegoPorConta painel={painel} conta={TODAS} grafico={grafico} /> },
          { titulo: 'Redes sociais por conta', conteudo: <RedesSociais painel={painel} grafico={grafico} conta={TODAS} publico={[]} /> },
          ...(temArtistas ? [{ titulo: 'Artistas', conteudo: artistasDoPeriodo }] : []),
          { titulo: 'Chamados', conteudo: <div className="[&_.faixa-de-numeros]:lg:grid-cols-3">{cartoesDosChamados}</div> },
          { titulo: 'Pedidos de arte, estoque e Benefício de sexta', conteudo: <OutrosIndicadoresDoMarketing r={outros} /> },
          { titulo: 'Chamados por categoria', conteudo: categorias },
        ]} />
      )}

      {lancando && <LancarSemana onFechar={() => setLancando(false)} />}

      <ExportPDFDialog
        open={exportando}
        onOpenChange={setExportando}
        secoes={SECOES_DO_PDF}
        reportData={{
          metrics: metrics || null, previousMetrics: previousMetrics || null, trends: trends || null, filter,
          activeAssets: 0, totalAssets: 0, expiringLicenses: 0, expiringContractsCount: 0, scheduledMaintenancesCount: 0,
          ti: dadosDoPdf, capa: { sigla: 'MKT', titulo: ['RELATÓRIO DE', 'MÉTRICAS DO MARKETING'] }, tabelas: tabelasDoPdf,
        }}
      />
    </div>
  );
}
