// Comercial › Indicadores — o Painel do Gestor da planilha de Gestão Comercial (manual §6 e §7).
//
// Quatro blocos, na ordem da planilha: os indicadores de cada vendedora com meta, realizado e
// farol; o FAROL de ações do mês; o resumo das carteiras com as três leituras de ticket; e a
// situação da base (ativos, inativos, nunca compraram).
//
// A VENDA é a das notas: o Forteplus até a última nota importada e, depois dela, o lançamento com Nº da nota
// (dono, 2026-10-03 e 2026-10-15). Contatos e ações vêm dos lançamentos das vendedoras.
//
// Esta rota existia como redirect para `insights?visao=atendimento` desde que o CRM virou
// módulo próprio. Nenhum código navegava para ela; o endereço que alguém esperaria para
// "indicadores do comercial" passa a ser, enfim, os indicadores do comercial.
import { FonteDoNumero } from '@/components/comercial/FonteDoNumero';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Info, Printer, Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { TutorialDoRelatorio } from '@/components/ajuda/TutorialDoRelatorio';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { FarolDaMeta } from '@/components/comercial/FarolDaMeta';
import { SeletorPeriodoDaCompetencia } from '@/components/comercial/SeletorPeriodoDaCompetencia';
import { useQueryState } from '@/hooks/useQueryState';
import { useDepartmentPermissions, usePodeGerirCarteiras } from '@/hooks/useAccessProfiles';
import { useLacunasDoCadastro } from '@/hooks/useComercialCliente';
import { usePeriodoImportado } from '@/hooks/useComercialPainel';
import {
  useFarolDeAcoes, useNotasQueNaoBateram, usePainelDoGestor, useResumoDaCarteira, useRitmoDoMes, useSalvarMetaIndicador, useVendaAtribuida,
  type LinhaPainel, type ResumoCarteira,
} from '@/hooks/useComercialLancamentos';
import { projecaoDoMes, type RitmoDoMes } from '@/lib/projecao-do-mes';
import { conversaoDeContato } from '@/lib/resumo-equipe';
import { ExportarATela } from '@/components/comercial/ExportarATela';
import { competenciaCurta } from '@/lib/competencia-comercial';
import { avisoDeMesesInteiros } from '@/lib/period';
import { usePeriodoDaCompetencia } from '@/hooks/usePeriodoDaCompetencia';
import { totalDaEquipe } from '@/lib/resumo-equipe';
import { formatBRL, formatDateBR } from '@/types/financeiro';
import { LinhaDaConferencia } from '@/components/financeiro/LinhaDaConferencia';
import { SeletorVisao } from '@/components/comercial/SeletorVisao';
import { useVisaoRelatorio } from '@/hooks/useVisaoRelatorio';
import { toLocalISODate } from '@/lib/dates';
import { LancamentosDaVendedora } from '@/components/comercial/LancamentosDaVendedora';
import { NotasQueNaoBateram } from '@/components/comercial/NotasQueNaoBateram';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const eValor = (metrica: string) => metrica === 'valor_vendas';
/** O item "Equipe toda" do seletor — o Select não aceita valor vazio. */
const EQUIPE = '__equipe__';

function formatar(l: LinhaPainel, v: number | null): string {
  if (v === null) return '—';
  if (eValor(l.metrica)) return formatBRL(v);
  if (l.metrica === 'pct_meta') return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  return v.toLocaleString('pt-BR');
}

export default function ComercialIndicadores() {
  // O recorte (2026-10-03): o mês de sempre, ou um período ("Este trimestre", "Personalizado"…).
  // No período, o lançamento conta nos dias exatos e a meta soma os meses inteiros que ele toca.
  const recorteDaTela = usePeriodoDaCompetencia();
  const { competencia, intervalo } = recorteDaTela;
  const aviso = avisoDeMesesInteiros('As metas são mensais', intervalo);
  const { data: painel = [], isLoading } = usePainelDoGestor(competencia, intervalo);
  const { data: farol = [] } = useFarolDeAcoes(competencia, intervalo);
  const { data: resumo = [] } = useResumoDaCarteira(competencia, intervalo);
  const { data: venda } = useVendaAtribuida(competencia, intervalo);
  // A projeção (R6) só no "Um mês": num período de vários meses não há um mês para fechar.
  const { data: ritmo } = useRitmoDoMes(competencia, !intervalo);
  const { data: notasErradas = [] } = useNotasQueNaoBateram(competencia, intervalo);
  const [visao, setVisao] = useVisaoRelatorio('comercial-indicadores', 'simplificado');
  const analitico = visao === 'analitico';
  const { data: lacunas } = useLacunasDoCadastro();
  const { data: periodo } = usePeriodoImportado();
  const { canComoOBanco } = useDepartmentPermissions('comercial');
  const podeDefinirMeta = canComoOBanco('metas', 'definir');
  const geraCarteiras = usePodeGerirCarteiras();

  const porVendedora = useMemo(() => {
    const mapa = new Map<string, { nome: string; carteira: string | null; linhas: LinhaPainel[] }>();
    for (const l of painel) {
      const v = mapa.get(l.vendedor_id) ?? { nome: l.vendedor_nome, carteira: l.carteira, linhas: [] };
      v.linhas.push(l);
      mapa.set(l.vendedor_id, v);
    }
    return [...mapa.entries()];
  }, [painel]);

  // QUEM ESTÁ OLHANDO (pedido do dono, 2026-09-28: "cada vendedor consegue visualizar os seus,
  // para apresentar"). O banco já entrega à vendedora só a linha dela; a tela só precisa falar
  // com ela como dona dos números, e não como gestora de uma equipe de uma pessoa.
  const visaoDeEquipe = geraCarteiras || porVendedora.length > 1;

  // ESCOLHER UMA VENDEDORA (revisão do sistema, 2026-10-01, decisão do dono): na planilha cada
  // vendedora tem a aba dela; aqui o gestor escolhe "Júlia" e a tela inteira passa a ser dela —
  // indicadores, farol, resumo da carteira e os lançamentos do mês. "Equipe" é a visão de todas.
  const [vendedoraNaUrl, setVendedora] = useQueryState<string>('vendedora', '');
  const escolhida = porVendedora.find(([id]) => id === vendedoraNaUrl) ?? null;
  const mostradas = escolhida ? [escolhida] : porVendedora;

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={visaoDeEquipe ? 'Indicadores do Comercial' : 'Meus indicadores'}
        status={<FonteDoNumero fonte="os-dois" />}
        description={visaoDeEquipe
          ? 'Meta, realizado e farol de cada vendedora, as ações do mês e o resumo das carteiras. A venda vem das notas fiscais (Forteplus e lançamentos com nota); contatos e ações, dos lançamentos.'
          : 'Sua meta, o que você realizou e o farol, suas ações do mês e o resumo da sua carteira. A venda vem das notas fiscais da sua carteira; contatos e ações, dos seus lançamentos.'}
        icon={BarChart3}
        actions={<TutorialDoRelatorio id="comercial-indicadores" />}
      />

      {/* `print:block` marca o que sai na impressão; o resto da tela some (`src/index.css`). É
          o "para apresentar" do pedido: imprimir ou salvar em PDF, sem biblioteca. */}
      <div className="p-4 sm:p-6 space-y-6 print:block">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <SeletorPeriodoDaCompetencia {...recorteDaTela} />
            {visaoDeEquipe && porVendedora.length > 0 && (
              <Select value={escolhida ? escolhida[0] : EQUIPE} onValueChange={(v) => setVendedora(v === EQUIPE ? '' : v)}>
                <SelectTrigger className="h-9 w-56" aria-label="Escolher vendedora"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={EQUIPE}>Equipe toda</SelectItem>
                  {porVendedora.map(([id, v]) => <SelectItem key={id} value={id}>{v.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
          <SeletorVisao visao={visao} onChange={setVisao} />
          <ExportarATela arquivo="indicadores-do-comercial" />
          <Button variant="outline" size="sm" className="max-[860px]:hidden" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-1.5" aria-hidden="true" /> Imprimir / salvar em PDF
          </Button>
          </div>
        </div>
        {aviso && <p className="text-[13px] text-muted-foreground">{aviso}</p>}
        {/* De onde vem a venda (dono, 2026-10-03 e 2026-10-15): as notas do Forteplus até a última importada; depois
            dela, os lançamentos com Nº da nota. Os dois nunca se somam. */}
        {venda && (
          <p className="text-[13px] text-muted-foreground">
            {venda.corte
              ? <>A venda vem das notas do Forteplus até <strong>{formatDateBR(venda.corte)}</strong> e, depois disso, dos lançamentos com nota fiscal.</>
              : <>Ainda não há nota importada do Forteplus: a venda é a dos lançamentos com nota fiscal.</>}
            {venda.previa > 0 && (
              <> Lançamentos com nota depois da última importação: <strong>{formatBRL(escolhida ? (venda.previaPorVendedora.get(escolhida[0]) ?? 0) : venda.previa)}</strong>.</>
            )}
          </p>
        )}

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : porVendedora.length === 0 ? (
          // Sem carteira, o painel não tem de quem falar. Zeros aqui pareceriam resultado — o
          // que falta é configuração, e a tela diz qual. Para a vendedora, dizer "monte as
          // carteiras" seria mandá-la a uma tela que ela não abre.
          <Card className="p-6">
            {geraCarteiras ? (
              <>
                <EmptyState
                  icon={Users}
                  title="Nenhuma vendedora em carteira ainda"
                  description={`Os indicadores nascem sozinhos para quem está numa carteira. ${
                    lacunas ? `Hoje ${lacunas.semCarteira} de ${lacunas.total} clientes estão no Histórico, sem carteira.` : ''
                  }`}
                />
                <p className="text-center text-[14px] mt-3 print:hidden">
                  <Link to="/comercial/configuracoes?aba=carteiras-vendedoras" className="underline">Montar as carteiras</Link>
                </p>
              </>
            ) : (
              <EmptyState
                icon={Users}
                title="Você ainda não está numa carteira"
                description="Seus indicadores aparecem aqui assim que o gestor colocar você numa carteira. Fale com ele."
              />
            )}
          </Card>
        ) : (
          <>
            {/* ── 1. Indicadores por vendedora ───────────────────────────────── */}
            <div className="grid gap-4 xl:grid-cols-2">
              {mostradas.map(([id, v]) => (
                <Card key={id} className="p-4 space-y-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="text-sm font-semibold">{v.nome}</h2>
                    <span className="text-[13px] text-muted-foreground">{v.carteira ? `Carteira ${v.carteira}` : 'Sem carteira'}</span>
                  </div>
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-1 font-medium">Indicador</th>
                        <th className="py-1 font-medium text-right w-28">Meta</th>
                        <th className="py-1 font-medium text-right w-24">Realizado</th>
                        <th className="py-1 font-medium text-right w-20" />
                      </tr>
                    </thead>
                    <tbody>
                      {v.linhas.map((l) => (
                        <tr key={l.metrica} className="border-t border-border">
                          <td className="py-1.5 pr-2">{l.rotulo}</td>
                          <td className="py-1.5 text-right">
                            {l.metrica === 'pct_meta' ? (
                              <span className="text-muted-foreground">{l.meta === null ? '—' : '100%'}</span>
                            ) : eValor(l.metrica) ? (
                              // A meta de valor é a da Diretoria, por carteira (decisão do dono,
                              // 2026-09-28) — aqui só se lê. Editar é em Diretoria › Metas.
                              <span className="font-mono" title="Meta da carteira, definida pela Diretoria">
                                {l.meta === null ? <span className="text-muted-foreground text-[12px]">sem meta da Diretoria</span> : formatar(l, l.meta)}
                              </span>
                            ) : podeDefinirMeta && !intervalo ? (
                              // Num período a meta é a SOMA dos meses — não há um mês para gravar.
                              <CelulaMeta linha={l} vendedorId={id} competencia={competencia} />
                            ) : (
                              <span className="font-mono">{formatar(l, l.meta)}</span>
                            )}
                          </td>
                          <td className="py-1.5 text-right font-mono">{formatar(l, l.realizado)}</td>
                          <td className="py-1.5 text-right"><FarolDaMeta cor={l.cor} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!intervalo && <ProjecaoDaVendedora linha={v.linhas.find((l) => eValor(l.metrica))} ritmo={ritmo} />}
                  <p className="text-[12px] text-muted-foreground">
                    A meta de valor é a da carteira, definida pela Diretoria.
                    {intervalo
                      ? ' No período, cada meta é a soma dos meses inteiros que ele toca (a semanal, das semanas inteiras). Para editar uma meta, escolha "Um mês".'
                      : podeDefinirMeta && ` As demais valem a partir de ${competenciaCurta(competencia)} e continuam nos meses seguintes até serem mudadas.`}
                  </p>
                  <NotasQueNaoBateram linhas={notasErradas.filter((n) => n.vendedor_id === id)} />
                </Card>
              ))}
            </div>

            {/* Simplificado (2026-10-15): os cartões de cada vendedora. O Analítico soma o farol de ações, o resumo
                das carteiras e os lançamentos. */}
            {analitico && (<>
            {/* ── 2. FAROL de ações ──────────────────────────────────────────── */}
            <FarolDeAcoes
              linhas={escolhida ? farol.filter((f) => f.vendedor_id === escolhida[0]) : farol}
              vendedoras={mostradas.map(([id, v]) => ({ id, nome: v.nome }))}
              noRecorte={intervalo ? 'no período' : 'no mês'}
            />

            {/* ── 3. Resumo das carteiras ────────────────────────────────────── */}
            <ResumoDasCarteiras
              linhas={escolhida ? resumo.filter((r) => r.vendedor_id === escolhida[0]) : resumo}
              mostrarTotal={visaoDeEquipe && !escolhida}
              simplificado={!analitico}
            />

            {/* ── 4. Os lançamentos dela (só quando uma vendedora está escolhida) ── */}
            {escolhida && <LancamentosDaVendedora vendedorId={escolhida[0]} nome={escolhida[1].nome} competencia={competencia} intervalo={intervalo} />}
            </>)}
          </>
        )}

        {/* ── 4. Conferência de pedidos (LEVA S): completa no Financeiro; aqui, a linha do resumo no mesmo período
            (dono, 2026-10-15). Quem gere as carteiras vê a equipe; o banco confere. */}
        {geraCarteiras && (
          <LinhaDaConferencia de={intervalo?.de ?? competencia}
            ate={intervalo?.ate ?? toLocalISODate(new Date(Number(competencia.slice(0, 4)), Number(competencia.slice(5, 7)), 0))} />
        )}

        {/* A âncora da classificação de 120 dias (§10). "Hoje" só vale se a importação
            está em dia: com ela atrasada, todo mundo parece inativo. Dizer a data evita
            ler inatividade onde há só importação faltando. */}
        <p className="flex items-start gap-1.5 text-[12px] text-muted-foreground">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            Ativo é quem comprou nos últimos 120 dias, contando a última compra do histórico importado do Forteplus
            {periodo?.competencia_ate ? ` (importado até ${competenciaCurta(periodo.competencia_ate)})` : ''} e a última
            venda lançada e concluída. Se a importação estiver atrasada, clientes que compraram podem aparecer como inativos.
          </span>
        </p>
      </div>
    </div>
  );
}

/** Meta editável ali mesmo, como a coluna C da planilha. Grava ao sair do campo. */
/**
 * A projeção do fechamento do mês (R6): o realizado de valor que a tabela acima mostra, no ritmo dos dias úteis até o
 * último dado. `data-novo-r6` marca o número novo (a conferência antes × depois da R6 compara só os que já existiam).
 */
function ProjecaoDaVendedora({ linha, ritmo }: { linha?: LinhaPainel; ritmo?: RitmoDoMes | null }) {
  const p = projecaoDoMes(linha?.realizado ?? null, linha?.meta ?? null, ritmo);
  if (!p || !ritmo) return null;
  return (
    <p data-novo-r6 className="text-[13px] rounded-md bg-muted/50 px-2 py-1.5">
      {p.fechado ? 'Mês fechado: ' : 'Projeção do fechamento: '}
      <strong className="tabular-nums">{formatBRL(p.valor)}</strong>
      {p.pctMeta != null && <> · <strong className={p.pctMeta >= 100 ? 'text-status-success' : 'text-status-warning'}>{p.pctMeta.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% da meta</strong></>}
      {!p.fechado && (
        <span className="text-muted-foreground"> · no ritmo de {ritmo.dias_uteis_ate} de {ritmo.dias_uteis_mes} dias úteis
          {ritmo.ultimo_dado ? `, com dado até ${formatDateBR(ritmo.ultimo_dado)}` : ''}</span>
      )}
    </p>
  );
}

function CelulaMeta({ linha, vendedorId, competencia }: { linha: LinhaPainel; vendedorId: string; competencia: string }) {
  const salvar = useSalvarMetaIndicador();
  const inicial = linha.meta === null ? '' : String(linha.meta);
  const [valor, setValor] = useState(inicial);
  const [editado, setEditado] = useState(false);

  const gravar = () => {
    if (!editado) return;
    const n = Number(valor.replace(',', '.'));
    if (valor.trim() === '' || !Number.isFinite(n) || n < 0) { setValor(inicial); setEditado(false); return; }
    salvar.mutate({ vendedorId, competencia, metrica: linha.metrica, meta: n }, { onSettled: () => setEditado(false) });
  };

  return (
    <Input
      className="h-7 w-24 ml-auto text-right font-mono text-[13px]"
      inputMode="decimal"
      aria-label={`Meta de ${linha.rotulo}`}
      value={editado ? valor : inicial}
      placeholder="—"
      onChange={(e) => { setValor(e.target.value); setEditado(true); }}
      onBlur={gravar}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}

function FarolDeAcoes({ linhas, vendedoras, noRecorte }: {
  linhas: { indicador_id: string; acao: string; ordem: number; vendedor_id: string; quantidade: number }[];
  vendedoras: { id: string; nome: string }[];
  /** "no mês" ou "no período". */
  noRecorte: string;
}) {
  const acoes = useMemo(() => {
    const mapa = new Map<string, { acao: string; ordem: number; por: Map<string, number> }>();
    for (const l of linhas) {
      const a = mapa.get(l.indicador_id) ?? { acao: l.acao, ordem: l.ordem, por: new Map() };
      a.por.set(l.vendedor_id, l.quantidade);
      mapa.set(l.indicador_id, a);
    }
    return [...mapa.values()].sort((x, y) => x.ordem - y.ordem);
  }, [linhas]);
  const total = acoes.reduce((s, a) => s + [...a.por.values()].reduce((x, y) => x + y, 0), 0);

  // Cartão comum, e não `BlocoFarol`: aquele envolve uma LISTA (`<ul>`), e isto é uma tabela
  // de ação × vendedora. A frase de vazio fica, pela mesma razão que lá: farol calado se lê
  // como falha de carregamento.
  return (
    <Card className="p-4 space-y-2">
      <div>
        <h2 className="text-sm font-semibold">FAROL — ações realizadas {noRecorte}</h2>
        <p className="text-[13px] text-muted-foreground">Quantas vezes cada vendedora marcou cada ação. Ação conta mesmo sem cliente.</p>
      </div>
      {total === 0 ? (
        <p className="text-[13px] text-muted-foreground">Nenhuma ação marcada {noRecorte}.</p>
      ) : (
        <div className="overflow-x-auto">
          {/* Rodada 3 (etapa D): é uma matriz ação × vendedora — no celular continua tabela (rolando de lado, com a ação
              presa à esquerda); virar lista dava "Ana: 3 Bia: 0" sem forma. Nenhum número muda. */}
          <table className="w-full text-[13px]" data-celular="tabela">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-3 font-medium sticky left-0 bg-card">Ação</th>
                {vendedoras.map((v) => <th key={v.id} className="py-1 font-medium text-right">{v.nome}</th>)}
                <th className="py-1 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {acoes.map((a) => {
                const soma = [...a.por.values()].reduce((x, y) => x + y, 0);
                return (
                  <tr key={a.acao} className="border-t border-border">
                    <td className="py-1.5 pr-3 sticky left-0 bg-card">{a.acao}</td>
                    {vendedoras.map((v) => <td key={v.id} className="py-1.5 text-right font-mono">{a.por.get(v.id) ?? 0}</td>)}
                    <td className="py-1.5 text-right font-mono font-semibold">{soma}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ResumoDasCarteiras({ linhas, mostrarTotal, simplificado }: { linhas: ResumoCarteira[]; mostrarTotal: boolean; simplificado: boolean }) {
  const total = useMemo(() => totalDaEquipe(linhas), [linhas]);
  // No simplificado, três colunas (etapa 4 · Comercial, 2026-10-24): eram 11, explicadas num parágrafo.
  const [todas, setTodas] = useState(false);
  const curto = simplificado && !todas;
  const ticket = (v: number | null) => (v === null ? '—' : formatBRL(v));
  // R6 (decisões do dono de 2026-10-26): "Positivados" é o nome de "Compradores"; "Novos" e "Conversão" saem dos
  // números que a função do banco já devolvia (`compradores_inativos`, `relacionados`, `relacionados_sem_compra`) —
  // nenhuma conta de venda nova. `novo` marca as colunas que a R6 acrescentou (a conferência antes × depois as ignora).
  const colunas: { rotulo: string; valor: (r: typeof total) => string; dica?: string; novo?: boolean }[] = [
    { rotulo: 'Carteira', valor: (r) => String(r.total_carteira) },
    { rotulo: 'Ativos', valor: (r) => String(r.ativos), dica: 'Compraram nos últimos 120 dias' },
    { rotulo: 'Inativos', valor: (r) => String(r.inativos) },
    { rotulo: 'Nunca compraram', valor: (r) => String(r.nunca_compraram) },
    { rotulo: 'Relacionados', valor: (r) => String(r.relacionados), dica: 'Clientes distintos com algum lançamento no mês' },
    { rotulo: 'Positivados', valor: (r) => String(r.compradores), dica: 'Clientes que compraram no período' },
    { rotulo: 'Novos', valor: (r) => String(r.compradores_inativos), novo: true,
      dica: 'Positivados que não tinham comprado nos 120 dias antes do período (novos ou reconquistados)' },
    { rotulo: 'Conversão', novo: true, dica: 'Dos clientes contatados (Relacionados), quantos compraram',
      valor: (r) => { const c = conversaoDeContato(r); return c === null ? '—' : `${c}%`; } },
    { rotulo: 'Sem compra', valor: (r) => String(r.relacionados_sem_compra), dica: 'Trabalhados, sem venda concluída no mês' },
    { rotulo: 'Vendido', valor: (r) => formatBRL(r.valor_vendido) },
    { rotulo: 'Ticket ativos', valor: (r) => ticket(r.ticket_ativos), dica: 'Vendas de ativos ÷ compradores ativos' },
    { rotulo: 'Ticket reativados', valor: (r) => ticket(r.ticket_inativos), dica: 'Vendas de inativos ÷ compradores inativos' },
    { rotulo: 'Média da base ativa', valor: (r) => ticket(r.media_base_ativa), dica: 'Vendas de ativos ÷ todos os ativos da carteira' },
  ];
  const SIMPLES = new Set(['Ativos', 'Relacionados', 'Positivados', 'Conversão', 'Vendido']);
  const mostradas = curto ? colunas.filter((c) => SIMPLES.has(c.rotulo)) : colunas;
  // O que a R6 pôs na tela: as colunas novas e, no simplificado, "Positivados" (antes só no completo).
  const novaNaTela = (c: (typeof colunas)[number]) => c.novo || (curto && c.rotulo === 'Positivados');

  return (
    <Card className="p-4 space-y-3">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Resumo das carteiras</h2>
          {simplificado && (
            <Button variant="ghost" size="sm" className="h-7 text-[13px]" onClick={() => setTodas((v) => !v)}>
              {todas ? 'Só o essencial' : `Ver as ${colunas.length} colunas`}
            </Button>
          )}
        </div>
        {/* O próprio manual insiste (§7.1): os dois números não devem ser iguais. Sem dizer
            por quê, alguém "conserta" o que está certo. */}
        {!curto && <p className="text-[13px] text-muted-foreground">
          O <strong>ticket</strong> divide as vendas só por quem comprou; a <strong>média da base ativa</strong> divide por
          todos os clientes ativos da carteira, inclusive os que não compraram. Os dois respondem perguntas diferentes e
          não devem dar o mesmo número: com 10 ativos, 2 comprando R$ 20.000, o ticket é R$ 10.000 e a média é R$ 2.000.
        </p>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 pr-2 font-medium">Vendedora</th>
              {mostradas.map((c) => <th key={c.rotulo} title={c.dica} data-novo-r6={novaNaTela(c) ? "" : undefined} className="py-1 px-2 font-medium text-right whitespace-nowrap">{c.rotulo}</th>)}
            </tr>
          </thead>
          <tbody>
            {linhas.map((r) => (
              <tr key={r.vendedor_id} className="border-t border-border">
                <td className="py-1.5 pr-2 whitespace-nowrap">{r.vendedor_nome}</td>
                {mostradas.map((c) => <td key={c.rotulo} data-novo-r6={novaNaTela(c) ? "" : undefined} className="py-1.5 px-2 text-right font-mono whitespace-nowrap">{c.valor(r)}</td>)}
              </tr>
            ))}
            {/* Para a vendedora sozinha, "total da equipe" seria ela mesma de novo, com um
                nome que diz outra coisa. */}
            {mostrarTotal && (
              <tr className="border-t-2 border-border font-semibold">
                <td className="py-1.5 pr-2">Total da equipe</td>
                {mostradas.map((c) => <td key={c.rotulo} data-novo-r6={novaNaTela(c) ? "" : undefined} className="py-1.5 px-2 text-right font-mono whitespace-nowrap">{c.valor(total)}</td>)}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
