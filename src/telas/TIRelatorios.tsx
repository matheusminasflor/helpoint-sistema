// TI › Indicadores. Revisão de 2026-11-01 (proposta aprovada pelo dono, Leis de UX):
//   · um filtro de período só, com os atalhos da reunião de segunda (Semana passada, Mês passado) — saiu a aba Semanal
//     e o seletor S1–S4 (Hick, Jakob); o colaborador fica junto do período (região comum);
//   · o que pede atenção primeiro, numa faixa logo abaixo do filtro (posição serial, Von Restorff);
//   · topo com os quatro números de chamado, cada um com meta e farol (cor que diz se está bom);
//   · categorias em barras que abrem as subcategorias (revelação progressiva);
//   · FSENSE e interrupções no bloco "Equipe", no mesmo filtro;
//   · inventário, termos, licenças e contratos num bloco recolhido no fim (não são chamado);
//   · tendência em barras por dia útil (a curva inventava valores entre os dias).
import { COR, COR_ABERTOS, COR_RESOLVIDOS, EIXO } from '@/config/cores-dos-graficos';
import { useTenantPath } from '@/hooks/useTenantPath';
import { TutorialDoRelatorio } from '@/components/ajuda/TutorialDoRelatorio';
import { ExplicacaoDoIndicador } from '@/components/ajuda/ExplicacaoDoIndicador';
import { useState } from 'react';
import { useQueryState } from '@/hooks/useQueryState';
import { usePeriodoNaUrl } from '@/hooks/usePeriodoNaUrl';
import { PERSONALIZADO, rotuloDoIntervalo, type IntervaloDeDias } from '@/lib/period';
import { diaCurto, fromLocalISODate, toLocalISODate, todayISO } from '@/lib/dates';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TermosNosIndicadores } from '@/components/ti/TermosNosIndicadores';
import { DicaDoGrafico } from '@/components/dashboard/DicaDoGrafico';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IndicatorsView } from '@/components/dashboard/IndicatorsView';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { KPICard } from '@/components/glpi/KPICard';
import { TILyraPanel } from '@/components/dashboard/TILyraPanel';
import { ExportPDFDialog } from '@/components/dashboard/ExportPDFDialog';
import { CategoriasDosChamados } from '@/components/ti/CategoriasDosChamados';
import { arvoreDosChamados, type No } from '@/lib/arvore-de-categorias';
import type { DadosDaTINoPDF } from '@/components/dashboard/PDFReportGenerator';
import { BarrasDaEquipe, CartoesDaEquipe, EquipeDaTI } from '@/components/ti/EquipeDaTI';
import { ModoApresentacao } from '@/components/dashboard/ModoApresentacao';
import { ProjetosDaTI } from '@/components/ti/ProjetosDaTI';
import { META_DA_TI, metaEmVigor } from '@/config/metas-da-ti';
import { useEquipeDoPeriodo, useSemanasDoFsenseAConfirmar } from '@/hooks/useEquipeDaTI';
import {
  useTicketMetrics, useTicketTrends, usePreviousMetrics, useViolatedSlaTickets, MetricsFilter, filtroDoPeriodo,
  getPreviousPeriodRange, intervaloDoFiltro, useSerieDosChamados,
} from '@/hooks/useHelpdeskMetrics';
import { useInventoryAssets } from '@/hooks/useInventory';
import { useLicenses } from '@/hooks/useLicenses';
import { useContracts } from '@/hooks/useContracts';
import { useMaintenances } from '@/hooks/useMaintenances';
import { useMembrosDoSetor } from '@/hooks/useMembrosDoSetor';
import { useConfiguracaoDosSetores, usePodeVerEquipe } from '@/hooks/useAccessProfiles';
import { useMetasDosSetores } from '@/hooks/useDiretoria';
import { useKanbanReportMetrics, ReportFilter } from '@/hooks/useReportMetrics';
import { useLyraChat } from '@/hooks/useLyraChat';
import { useAISecretary } from '@/hooks/useAISecretary';
import { useIALigada } from '@/hooks/useAssistantName';
import { AlertTriangle, BarChart3, BrainCircuit, CheckCircle2, ChevronDown, Clock, Download, FileKey, Monitor, Presentation, ShieldCheck, Target, Timer, Wrench } from 'lucide-react';
import { AIIndicatorAnalysis } from '@/components/dashboard/AIIndicatorAnalysis';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { addDays, isBefore } from 'date-fns';
import { cn } from '@/lib/utils';
import { ativoEmEstoque, ativoEmUso, ROTULO_DA_CATEGORIA_DO_ATIVO } from '@/lib/asset-status';
import { formatarHoras } from '@/lib/horas';
import { barrasDaTendencia } from '@/lib/tendencia';
import {
  COR_DO_FAROL, diasDoPeriodo, farol, periodoDoIntervalo, somarDias,
} from '@/lib/ti-equipe';
import { fraseDoResumo } from '@/lib/resumo-da-ti';
import { diasAlemDoTermino, resumoDosProjetos } from '@/lib/projetos';
import { useProjetosDoSetor } from '@/hooks/useProjetos';
import { EquipePorSemana } from '@/components/ti/EquipePorSemana';
import { textoDaMeta } from '@/lib/meta-do-indicador';
import type { AssetCategory } from '@/types/helpdesk';

// O recorte da reunião de segunda primeiro (dono, 2026-11-01). Links antigos (`?periodo=30d`) continuam abrindo.
const PERIODOS = [
  { value: 'semana_passada', label: 'Semana passada' },
  { value: 'esta_semana', label: 'Esta semana' },
  { value: 'mes_passado', label: 'Mês passado' },
  { value: 'este_mes', label: 'Este mês' },
  { value: PERSONALIZADO, label: 'Personalizado' },
];

// O índice do Analítico: as âncoras moram nos cartões (`IndicatorsView`, `EquipePorSemana`, `ProjetosDaTI`).
const SECOES_DO_ANALITICO = [
  { id: 'analitico-chamados', rotulo: 'Chamados' },
  { id: 'analitico-categorias', rotulo: 'Categorias' },
  { id: 'analitico-atencao', rotulo: 'Fora do prazo agora' },
  { id: 'analitico-pessoas', rotulo: 'Por técnico e quem abre' },
  { id: 'analitico-equipe', rotulo: 'Equipe por semana' },
  { id: 'analitico-projetos', rotulo: 'Projetos' },
  { id: 'analitico-ativos', rotulo: 'Ativos e contratos' },
];

const ddmm = (d: Date) => toLocalISODate(d).split('-').reverse().slice(0, 2).join('/');

export default function TIRelatorios() {
  const tenantPath = useTenantPath();
  const navigate = useNavigate();
  const { periodo: selectedPeriod, intervalo, escolher, definirIntervalo } = usePeriodoNaUrl<string>('semana_passada');
  const [collaboratorId, setCollaboratorId] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useQueryState<string>('aba', 'overview');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [aiAnalysisOpen, setAiAnalysisOpen] = useState(false);
  const [apresentando, setApresentando] = useState(false);
  const iaLigada = useIALigada();

  const filter = filtroDoPeriodo(selectedPeriod, intervalo);
  const intervaloDaTela: IntervaloDeDias = intervaloDoFiltro(filter);
  const anteriorDaTela = getPreviousPeriodRange(filter);
  // Ao abrir o "Personalizado", as datas começam no recorte que a tela mostrava.
  const handlePeriodChange = (value: string) => escolher(value, intervaloDaTela);
  // Só os chamados da TI (módulo 'tickets'), nunca os de MKT/RH/Qualidade.
  const filterWithTech: MetricsFilter = { ...filter, technicianId: collaboratorId, module: 'tickets' };

  const { data: metrics } = useTicketMetrics(filterWithTech);
  const { data: previousMetrics } = usePreviousMetrics(filterWithTech);
  // Período anterior sem chamado nenhum não é base de comparação (era 0% e virava "+79 p.p.").
  const anterior = previousMetrics && previousMetrics.total > 0 ? previousMetrics : null;
  const { data: trends } = useTicketTrends(filterWithTech);
  const { data: violados = [] } = useViolatedSlaTickets(filterWithTech);
  const { assets } = useInventoryAssets();
  const { data: licenses } = useLicenses();
  const { data: contracts } = useContracts();
  const { data: maintenances } = useMaintenances();
  const metas = useMetasDosSetores();
  // Só quem atende a TI, e só para quem tem "Ver métricas da equipe"; "Exportar" segue a caixinha "Exportar".
  const { data: technicians } = useMembrosDoSetor('ti');
  const podeVerEquipe = usePodeVerEquipe('tickets');
  const perfil = useConfiguracaoDosSetores();
  const podeExportar = perfil.pode('ti', 'reports', 'export');
  const podeMudarMetas = !perfil.isLoading
    && (perfil.alteraAba('ti', 'chamados') || perfil.pode('diretoria', 'indicadores', 'definir_metas'));
  const { data: semanasAConfirmar = [] } = useSemanasDoFsenseAConfirmar();

  const reportFilter: ReportFilter = { period: selectedPeriod as ReportFilter['period'], collaboratorId };
  const { data: kanbanData } = useKanbanReportMetrics('ti', reportFilter);

  // Lyra
  const { tickets: lyraTickets, kanbanCards: lyraKanbanCards } = useAISecretary();
  const { messages, isTyping, sendMessage } = useLyraChat({
    tickets: lyraTickets || [], kanbanCards: lyraKanbanCards || [], tasks: [],
  });

  // Colunas `date` do banco: "vence hoje" ainda não venceu — compara-se o dia como texto e usa-se o dia local.
  const hojeISO = todayISO();
  const inicioDeHoje = fromLocalISODate(hojeISO);
  const em30Dias = addDays(new Date(), 30);
  const venceEm30 = (dia: string | null | undefined) => {
    if (!dia) return false;
    const d = fromLocalISODate(dia);
    return !isBefore(d, inicioDeHoje) && isBefore(d, em30Dias);
  };

  // "Em uso" é a SITUAÇÃO do ativo, não "tem responsável nomeado" (2026-09-27; ver `@/lib/asset-status`).
  const assetsInUse = (assets || []).filter(a => ativoEmUso(a.status)).length;
  const assetsInStock = (assets || []).filter(a => ativoEmEstoque(a.status)).length;
  const assetsComResponsavel = (assets || []).filter(a => a.assigned_to).length;
  const assetsInMaintenance = (assets || []).filter(a => (a.status || '').toLowerCase() === 'maintenance').length;
  const totalAssets = assets?.length || 0;
  const assetsByCategory = (assets || []).reduce<Record<string, { inUse: number; stock: number }>>((acc, a) => {
    const cat = ROTULO_DA_CATEGORIA_DO_ATIVO[a.category as AssetCategory] ?? a.category ?? 'Outros';
    if (!acc[cat]) acc[cat] = { inUse: 0, stock: 0 };
    if (a.assigned_to) acc[cat].inUse++;
    else acc[cat].stock++;
    return acc;
  }, {});

  const vencidas = (licenses?.filter(l => l.expiry_date && l.expiry_date.slice(0, 10) < hojeISO).length || 0)
    + (contracts?.filter(c => c.end_date && c.end_date.slice(0, 10) < hojeISO).length || 0);
  const licencasVencendo = licenses?.filter(l => venceEm30(l.expiry_date)) || [];
  const contratosVencendo = contracts?.filter(c => venceEm30(c.end_date)) || [];
  const manutencoesProximas = maintenances?.filter(m => venceEm30(m.scheduled_date) && ['scheduled', 'in_progress'].includes(m.status)) || [];

  // A meta em vigor: a gravada em Configurações de TI › Metas, ou o padrão (mercado + histórico; rodada 2).
  const meta = (chave: string) => metaEmVigor(metas.data, chave);
  const fmtMeta = (v: number | undefined, sufixo: string) => (v === undefined ? undefined : `${v.toLocaleString('pt-BR')}${sufixo}`);
  const sla = metrics?.slaCompliance ?? 0;
  const primeira = metrics?.firstResponseCompliance ?? 0;
  const tempo = metrics?.avgResolutionTime ?? 0;
  const farolSla = farol(metrics ? sla : null, meta('sla_cumprido'), 'mais', true);
  const farolPrimeira = farol(metrics ? primeira : null, meta('primeira_resposta'), 'mais', true);
  const farolTempo = farol(metrics ? tempo : null, meta('tempo_medio_horas'), 'menos');
  const notaDaMeta = (v: number | undefined, sufixo: string, sentido: 'mais' | 'menos') => {
    const t = fmtMeta(v, sufixo);
    return t ? textoDaMeta(t, sentido) : undefined;
  };

  // Semana do FSENSE lançada e não confirmada (rodada 2): sem confirmar, a reunião mostra "Sem dado". A mais recente; se
  // ela está no período da tela, o aviso só desce até o bloco Equipe; senão, abre o período dela.
  const semanaAConfirmar = semanasAConfirmar[0];
  const naTela = !!semanaAConfirmar && semanaAConfirmar >= intervaloDaTela.de && semanaAConfirmar <= intervaloDaTela.ate;
  // A linha das últimas semanas dos quatro cartões e a frase de resumo (rodada 2): os mesmos números da tela.
  const { data: serie } = useSerieDosChamados(filterWithTech);
  const diasDaTela = diasDoPeriodo(periodoDoIntervalo(intervaloDaTela));
  const rotuloDaSerie = diasDaTela === 7 ? 'as últimas 8 semanas' : `os últimos 8 períodos de ${diasDaTela} dias`;
  const equipe = useEquipeDoPeriodo(intervaloDaTela, podeVerEquipe);
  const trabalhoDaEquipe = equipe.numeros.find((n) => n.chave === 'fsense_trabalho')?.atual ?? null;
  const { data: projetosDaTI = [] } = useProjetosDoSetor('ti');
  const projetosAlem = resumoDosProjetos(projetosDaTI, hojeISO).alemDoTermino;
  const frase = fraseDoResumo({
    periodo: `De ${rotuloDoIntervalo(intervaloDaTela)}`,
    total: metrics?.total ?? 0, resolvidos: metrics?.resolved ?? 0, sla: metrics ? sla : null, metaSla: meta('sla_cumprido'),
    tempo: metrics?.avgResolutionTime ?? null, tempoAnterior: anterior?.avgResolutionTime ?? null,
    trabalho: trabalhoDaEquipe, metaTrabalho: meta('fsense_trabalho'), semanaAConfirmar: naTela,
    projetosAlemDoTermino: projetosAlem,
  });

  const atencao = [
    projetosAlem > 0 && {
      texto: `${projetosAlem} ${projetosAlem === 1 ? 'projeto passou' : 'projetos passaram'} do término`, cor: 'perigo', para: '#projetos-da-ti',
    },
    semanaAConfirmar && {
      texto: `Semana do FSENSE até ${diaCurto(semanaAConfirmar)} a confirmar`, cor: 'aviso',
      para: naTela ? '#equipe-da-ti' : `/ti/indicadores?periodo=${PERSONALIZADO}&de=${somarDias(semanaAConfirmar, -6)}&ate=${semanaAConfirmar}`,
    },
    violados.length > 0 && { texto: `${violados.length} ${violados.length === 1 ? 'chamado fora do prazo' : 'chamados fora do prazo'}`, cor: 'perigo', para: '/ti/chamados' },
    vencidas > 0 && { texto: `${vencidas} ${vencidas === 1 ? 'licença ou contrato vencido' : 'licenças e contratos vencidos'}`, cor: 'perigo', para: '/ti/licencas' },
    licencasVencendo.length > 0 && { texto: `${licencasVencendo.length} ${licencasVencendo.length === 1 ? 'licença vence' : 'licenças vencem'} em 30 dias`, cor: 'aviso', para: '/ti/licencas' },
    contratosVencendo.length > 0 && { texto: `${contratosVencendo.length} ${contratosVencendo.length === 1 ? 'contrato vence' : 'contratos vencem'} em 30 dias`, cor: 'aviso', para: '/ti/contratos' },
    manutencoesProximas.length > 0 && { texto: `${manutencoesProximas.length} ${manutencoesProximas.length === 1 ? 'manutenção marcada' : 'manutenções marcadas'} nos próximos 30 dias`, cor: 'neutro', para: '/ti/manutencoes' },
  ].filter(Boolean) as { texto: string; cor: 'perigo' | 'aviso' | 'neutro'; para: string }[];

  const rotuloDoPeriodo = PERIODOS.find(p => p.value === selectedPeriod)?.label;
  const subtitulo = `${rotuloDoPeriodo ? `${rotuloDoPeriodo}: ` : ''}${rotuloDoIntervalo(intervaloDaTela)} · comparado com ${ddmm(anteriorDaTela.startDate)} a ${ddmm(anteriorDaTela.endDate)}`;
  const barras = barrasDaTendencia(trends || []);
  const km = kanbanData?.metrics;

  // O PDF leva o que a Visão Geral mostra (rodada 2): os mesmos números, já em texto.
  const n1 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const textoDaMetaNoPdf = (v: number | undefined, sufixo: string, sentido: 'mais' | 'menos') =>
    (v === undefined ? '—' : `${sentido === 'mais' ? 'pelo menos' : 'até'} ${n1(v)}${sufixo}`);
  const achatar = (nos: No[], nivel = 0): DadosDaTINoPDF['categorias'] =>
    nos.flatMap((no) => [{ nome: no.nome, nivel, chamados: no.chamados.length }, ...achatar(no.filhos, nivel + 1)]);
  const dadosDaTINoPDF: DadosDaTINoPDF = {
    resumo: frase,
    chamados: [
      { indicador: 'SLA cumprido', meta: textoDaMetaNoPdf(meta('sla_cumprido'), '%', 'mais'), anterior: anterior ? `${anterior.slaCompliance}%` : '—', atual: `${sla}%`, status: farolSla },
      { indicador: '1ª resposta no prazo', meta: textoDaMetaNoPdf(meta('primeira_resposta'), '%', 'mais'), anterior: anterior ? `${anterior.firstResponseCompliance}%` : '—', atual: `${primeira}%`, status: farolPrimeira },
      { indicador: 'Tempo médio de resolução', meta: textoDaMetaNoPdf(meta('tempo_medio_horas'), ' h', 'menos'), anterior: anterior ? formatarHoras(anterior.avgResolutionTime) : '—', atual: formatarHoras(tempo), status: farolTempo },
      { indicador: 'Chamados resolvidos', meta: '—', anterior: anterior ? `${anterior.resolved}` : '—', atual: `${metrics?.resolved ?? 0}`, status: 'sem_meta' },
    ],
    equipe: equipe.numeros.map((n) => {
      const def = META_DA_TI[n.chave];
      const fmt = (v: number | null) => (v === null ? '—' : def.percentual ? `${n1(v)}%` : n1(v));
      return { indicador: n.nome, meta: n.metaTexto ? `${def.sentido === 'mais' ? 'pelo menos' : 'até'} ${n.metaTexto}` : '—',
        anterior: fmt(n.anterior), atual: fmt(n.atual) + (n.extra ? ` (${n.extra})` : ''), status: n.farol };
    }),
    pessoas: [...equipe.doAtual].sort((a, b) => (b.trabalho ?? -1) - (a.trabalho ?? -1)).map((p) => ({
      nome: p.colaborador, horas: `${n1(p.horas)} h`, trabalho: p.trabalho === null ? '—' : `${n1(p.trabalho)}%`,
      ocioso: p.ocioso === null ? '—' : `${n1(p.ocioso)}%`, status: equipe.statusDa(p),
    })),
    projetos: projetosDaTI.filter((p) => p.status === 'active' || p.status === 'planned')
      .map((p) => ({ p, atraso: diasAlemDoTermino(p, hojeISO) }))
      .sort((a, b) => b.atraso - a.atraso)
      .map(({ p, atraso }) => ({ nome: p.name, situacao: p.status === 'active' ? 'Em andamento' : 'Pendente',
        termino: p.due_date ? diaCurto(p.due_date) : '—', atraso: atraso ? `${atraso} ${atraso === 1 ? 'dia' : 'dias'}` : '—' })),
    categorias: achatar(arvoreDosChamados(metrics?.chamados ?? [])),
  };

  // Os quatro números de chamado: na Visão Geral e na tela 2 do modo apresentação.
  const cartoesDosChamados = (
                <KPIGrid lgCols={4}>
                  <KPICard value={`${sla}%`} numero={sla} label="SLA cumprido" icon={ShieldCheck} color={COR_DO_FAROL[farolSla]}
                    anterior={anterior?.slaCompliance ?? null} melhorQuando="mais" formatarDiferenca={(n) => `${n} p.p.`}
                    nota={notaDaMeta(meta('sla_cumprido'), '%', 'mais')} notaRuim={farolSla === 'fora'} explicacao="chamados.sla_cumprido"
                    serie={serie?.map((p) => p.sla)} rotuloDaSerie={rotuloDaSerie} />
                  <KPICard value={`${primeira}%`} numero={primeira} label="1ª resposta no prazo" icon={Timer} color={COR_DO_FAROL[farolPrimeira]}
                    anterior={anterior?.firstResponseCompliance ?? null} melhorQuando="mais" formatarDiferenca={(n) => `${n} p.p.`}
                    nota={notaDaMeta(meta('primeira_resposta'), '%', 'mais')} notaRuim={farolPrimeira === 'fora'} explicacao="chamados.primeira_resposta_no_prazo"
                    serie={serie?.map((p) => p.primeira)} rotuloDaSerie={rotuloDaSerie} />
                  <KPICard value={formatarHoras(tempo)} numero={tempo} label="Tempo médio de resolução" icon={Clock} color={COR_DO_FAROL[farolTempo]}
                    anterior={anterior?.avgResolutionTime ?? null} melhorQuando="menos" formatarDiferenca={(n) => formatarHoras(Math.abs(n))}
                    nota={notaDaMeta(meta('tempo_medio_horas'), ' h', 'menos')} notaRuim={farolTempo === 'fora'} explicacao="chamados.tempo_medio_resolucao"
                    serie={serie?.map((p) => p.tempo)} rotuloDaSerie={rotuloDaSerie} />
                  <KPICard value={metrics?.resolved ?? 0} label="Chamados resolvidos" icon={CheckCircle2} color="green"
                    anterior={anterior?.resolved ?? null} melhorQuando="mais" explicacao="chamados.resolvidos"
                    serie={serie?.map((p) => p.resolvidos)} rotuloDaSerie={rotuloDaSerie}
                    onClick={() => navigate(tenantPath('/ti/chamados?status=resolved'))} />
                </KPIGrid>
  );

  return (
    <div className="px-4 lg:px-8 pb-6 w-full">
      <DashboardHeader
        title="Indicadores — TI"
        subtitle={subtitulo}
        period={selectedPeriod}
        onPeriodChange={handlePeriodChange}
        intervalo={intervalo}
        onIntervaloChange={definirIntervalo}
        periodOptions={PERIODOS}
        actions={
          <>
            <TutorialDoRelatorio id="ti-indicadores" />
            {podeVerEquipe && (
              <Select value={collaboratorId || 'all'} onValueChange={v => setCollaboratorId(v === 'all' ? undefined : v)}>
                <SelectTrigger className="w-[190px] h-8 text-xs" aria-label="Colaborador"><SelectValue placeholder="Toda a equipe" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toda a equipe</SelectItem>
                  {technicians?.map(t => <SelectItem key={t.id} value={t.id}>{t.full_name || t.email}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Button size="sm" variant="default" className="max-[860px]:hidden" onClick={() => setApresentando(true)}>
              <Presentation className="w-3.5 h-3.5 mr-1" />Apresentar
            </Button>
            {iaLigada && (
              <Button size="sm" variant="default" onClick={() => setAiAnalysisOpen(true)}>
                <BrainCircuit className="w-3 h-3 mr-1" />Analisar com IA
              </Button>
            )}
            {podeExportar && (
              <Button size="sm" variant="outline" className="max-[860px]:hidden" onClick={() => setExportDialogOpen(true)}>
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

        <TabsContent value="overview">
          <div className={`grid grid-cols-1 ${iaLigada ? 'lg:grid-cols-[1fr_340px]' : ''} gap-6 mt-4`}>
            <div className="space-y-6 min-w-0">
              {atencao.length > 0 && (
                <div className="flex flex-wrap items-center gap-2" role="list" aria-label="O que pede atenção agora">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-status-danger" />Atenção agora
                    <ExplicacaoDoIndicador id="chamados.o_que_pede_atencao" />
                  </span>
                  {atencao.map(a => {
                    const classe = cn('rounded-md px-3 py-1.5 text-sm font-semibold hover:underline',
                      a.cor === 'perigo' ? 'badge-danger' : a.cor === 'aviso' ? 'badge-warning' : 'badge-neutral');
                    return a.para.startsWith('#') ? (
                      <button key={a.texto} type="button" role="listitem" className={classe}
                        onClick={() => document.getElementById(a.para.slice(1))?.scrollIntoView({ behavior: 'smooth' })}>
                        {a.texto}
                      </button>
                    ) : (
                      <Link key={a.texto} to={tenantPath(a.para)} role="listitem" className={classe}>{a.texto}</Link>
                    );
                  })}
                </div>
              )}

              <p className="rounded-lg bg-muted/60 px-4 py-3 text-[15px] text-foreground" aria-label="Resumo do período">{frase}</p>

              <div className="space-y-2">
                {cartoesDosChamados}
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>A cor do número segue a meta: verde na meta, amarelo perto, vermelho fora. A linha embaixo é {rotuloDaSerie}.{!anterior && ' Sem chamados no período anterior para comparar.'}</span>
                  {podeMudarMetas && (
                    <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                      <Link to={tenantPath('/ti/configuracoes?aba=metas')}><Target className="h-3.5 w-3.5 mr-1" />Metas</Link>
                    </Button>
                  )}
                </div>
              </div>

              <EquipeDaTI intervalo={intervaloDaTela} />

              <ProjetosDaTI />

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <CategoriasDosChamados chamados={metrics?.chamados ?? []} modulo="tickets" />
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
              </div>


            </div>

            {iaLigada && (
              <div className="hidden lg:block">
                <TILyraPanel
                  messages={messages} isTyping={isTyping} onSend={sendMessage}
                  ticketCount={metrics?.open} slaCompliance={metrics?.slaCompliance}
                  expiringLicenses={licencasVencendo.length}
                />
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="detailed">
          {/* Analítico (rodada 2): detalhe por detalhe, com um índice que fica no topo ao rolar (revelação progressiva;
              região comum). Cada seção responde uma pergunta. */}
          <nav aria-label="Seções do Analítico"
            className="sticky top-0 z-20 -mx-1 mt-3 flex flex-wrap gap-1.5 bg-background/95 px-1 py-2 backdrop-blur">
            {SECOES_DO_ANALITICO.filter((s) => s.id !== 'analitico-equipe' || podeVerEquipe).map((s) => (
              <button key={s.id} type="button" className="rounded-full border px-3 py-1 text-xs font-medium hover:bg-muted"
                onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' })}>{s.rotulo}</button>
            ))}
          </nav>
          <div className="mt-2 space-y-6">
            <IndicatorsView
              metrics={metrics || null}
              previousMetrics={previousMetrics || null}
              activeAssets={assetsInUse}
              totalAssets={totalAssets}
              assetsInStock={assetsInStock}
              assetsInMaintenance={assetsInMaintenance}
              expiringLicenses={licencasVencendo.length}
              expiringContractsCount={contratosVencendo.length}
              scheduledMaintenancesCount={manutencoesProximas.length}
              filter={filterWithTech}
              expiringLicensesList={licencasVencendo}
              expiringContractsList={contratosVencendo.map(c => ({ id: c.id, name: c.name, end_date: c.end_date }))}
              scheduledMaintenancesList={manutencoesProximas.map(m => ({ id: m.id, title: m.title, scheduled_date: m.scheduled_date, status: m.status, asset: m.asset }))}
            />
            {podeVerEquipe && <EquipePorSemana ate={intervaloDaTela.ate} />}
            <ProjetosDaTI id="analitico-projetos" />
            <div id="analitico-ativos" className="scroll-mt-20">
              <Collapsible defaultOpen>
                <Card className="p-0 overflow-hidden">
                  <CollapsibleTrigger className="group w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-4 text-left hover:bg-muted/30">
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform -rotate-90 group-data-[state=open]:rotate-0" />
                    <span className="text-sm font-semibold text-foreground flex items-center gap-2"><Monitor className="h-4 w-4 text-primary" />Ativos e contratos</span>
                    <span className="text-xs text-muted-foreground">
                      {assetsInUse} equipamentos em uso · {licencasVencendo.length + contratosVencendo.length} vencem em 30 dias · {vencidas} vencidos
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-5 pb-5 space-y-4">
                    <TermosNosIndicadores />
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">Inventário de TI <ExplicacaoDoIndicador id="ti.inventario" /></h4>
                        <Link to={tenantPath('/inventario')} className="text-xs text-primary hover:underline">Ver inventário →</Link>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { v: assetsInUse, r: 'Em uso', extra: assetsComResponsavel !== assetsInUse ? `${assetsComResponsavel} com responsável` : undefined },
                          { v: assetsInStock, r: 'Em estoque' },
                          { v: assetsInMaintenance, r: 'Em manutenção' },
                          { v: totalAssets, r: 'Total cadastrado' },
                        ].map(c => (
                          <div key={c.r} className="rounded-lg border border-border p-3">
                            <div className="text-2xl font-bold font-mono text-foreground tabular-nums">{c.v}</div>
                            <div className="text-[12px] uppercase tracking-wider text-muted-foreground">{c.r}</div>
                            {c.extra && <div className="text-[12px] text-muted-foreground mt-0.5">{c.extra}</div>}
                          </div>
                        ))}
                      </div>
                      {Object.keys(assetsByCategory).length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 border-t pt-3">
                          {Object.entries(assetsByCategory).sort((a, b) => (b[1].inUse + b[1].stock) - (a[1].inUse + a[1].stock)).map(([cat, v]) => (
                            <div key={cat} className="flex items-center justify-between text-xs py-0.5">
                              <span className="text-foreground truncate">{cat}</span>
                              <span className="font-mono text-muted-foreground shrink-0">
                                <span className="text-foreground font-semibold">{v.inUse}</span> em uso · <span className="text-status-success font-semibold">{v.stock}</span> em estoque
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Link to={tenantPath('/ti/licencas')} className="rounded-lg border border-border p-3 hover:bg-muted/30">
                        <div className={cn('text-2xl font-bold font-mono tabular-nums', vencidas > 0 ? 'text-status-danger' : 'text-foreground')}>{vencidas}</div>
                        <div className="text-[12px] uppercase tracking-wider text-muted-foreground flex items-center gap-1"><FileKey className="h-3.5 w-3.5" />Licenças e contratos vencidos</div>
                      </Link>
                      <Link to={tenantPath('/ti/licencas')} className="rounded-lg border border-border p-3 hover:bg-muted/30">
                        <div className="text-2xl font-bold font-mono tabular-nums text-foreground">{licencasVencendo.length + contratosVencendo.length}</div>
                        <div className="text-[12px] uppercase tracking-wider text-muted-foreground">Vencem em 30 dias</div>
                      </Link>
                      <Link to={tenantPath('/ti/manutencoes')} className="rounded-lg border border-border p-3 hover:bg-muted/30">
                        <div className="text-2xl font-bold font-mono tabular-nums text-foreground">{manutencoesProximas.length}</div>
                        <div className="text-[12px] uppercase tracking-wider text-muted-foreground flex items-center gap-1"><Wrench className="h-3.5 w-3.5" />Manutenções em 30 dias</div>
                      </Link>
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {apresentando && (
        <ModoApresentacao subtitulo={rotuloDoIntervalo(intervaloDaTela)} onSair={() => setApresentando(false)} telas={[
          { titulo: 'Resumo', conteudo: (
            <div className="space-y-6">
              <p className="text-2xl leading-relaxed text-foreground">{frase}</p>
              {atencao.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {atencao.map((a) => (
                    <span key={a.texto} className={cn('rounded-md px-3 py-1.5 text-base font-semibold',
                      a.cor === 'perigo' ? 'badge-danger' : a.cor === 'aviso' ? 'badge-warning' : 'badge-neutral')}>{a.texto}</span>
                  ))}
                </div>
              )}
            </div>
          ) },
          { titulo: 'Chamados', conteudo: cartoesDosChamados },
          { titulo: 'Chamados por categoria', conteudo: <CategoriasDosChamados chamados={metrics?.chamados ?? []} modulo="tickets" /> },
          ...(podeVerEquipe ? [{ titulo: 'Equipe', conteudo: (
            <div className="space-y-6"><CartoesDaEquipe numeros={equipe.numeros} /><BarrasDaEquipe equipe={equipe} /></div>
          ) }] : []),
          { titulo: 'Projetos da TI', conteudo: <ProjetosDaTI id="apresentacao-projetos" /> },
        ]} />
      )}

      <ExportPDFDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        reportData={{
          metrics: metrics || null, previousMetrics: previousMetrics || null, trends: trends || null,
          filter: filterWithTech, activeAssets: assetsInUse, totalAssets, expiringLicenses: licencasVencendo.length,
          expiringContractsCount: contratosVencendo.length, scheduledMaintenancesCount: manutencoesProximas.length,
          technicianName: technicians?.find(t => t.id === collaboratorId)?.full_name || technicians?.find(t => t.id === collaboratorId)?.email,
          ti: dadosDaTINoPDF,
        }}
      />

      {iaLigada && (
        <AIIndicatorAnalysis
          open={aiAnalysisOpen}
          onClose={() => setAiAnalysisOpen(false)}
          period={subtitulo}
          metrics={{
            chamados: {
              abertos: metrics?.open || 0,
              em_andamento: metrics?.inProgress || 0,
              resolvidos: metrics?.resolved || 0,
              sla_cumprido_percent: metrics?.slaCompliance || 0,
              tempo_medio_resolucao_horas: metrics?.avgResolutionTime || 0,
              por_prioridade: metrics?.byPriority || {},
              por_categoria: metrics?.byCategory || {},
            },
            inventario: {
              ativos_operacionais: assetsInUse,
              total_cadastrados: totalAssets,
            },
            licencas_expirando_30d: licencasVencendo.length,
            contratos_expirando_30d: contratosVencendo.length,
            manutencoes_agendadas: manutencoesProximas.length,
            kanban: km ? {
              total_cards: km.total,
              em_andamento: km.inProgress,
              concluidos: km.completed,
              atrasados: km.overdue,
              pendentes: km.pending,
            } : null,
          }}
        />
      )}
    </div>
  );
}
