// Comercial › Carteiras — as abas "VIP - Fenício", "MG - Júlia" e "Outros Estados - Jaqueline"
// da planilha de Gestão Comercial (manual §8), dentro do sistema.
//
// DUAS DECISÕES DO DONO (2026-09-28) moldam a tela:
//   * sem meta por cliente — "a meta é definida diretamente pelo diretor … a meta de cada
//     carteira". O cabeçalho compara a meta da Diretoria com a venda; as linhas não têm meta;
//   * uma linha por GRUPO (cliente de acompanhamento), não por código do Forteplus.
//
// O redesenho de 2026-10-15 (dono): Simplificado com 6 colunas (Cliente, Venda no mês, Média por mês, Tendência,
// A faturar, Último contato) e o resto no Analítico; a explicação de cada coluna ao passar o mouse; um mês OU um
// período; o filtro de filial; clicar no cliente abre o mês a mês dele. A venda é uma só
// (`com_vendas_unificadas`): o Forteplus até a última nota importada, depois o lançamento com nota.
//
// A vendedora vê a carteira dela — e a vê INTEIRA, inclusive a venda que uma colega lançou para
// um cliente dela pelo escape "fora da minha carteira". O gestor escolhe qualquer carteira.
import { FonteDoNumero } from '@/components/comercial/FonteDoNumero';
import { useMemo, useState, type ReactNode } from 'react';
import { Briefcase, ChevronDown, Info, Printer } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { TutorialDoRelatorio } from '@/components/ajuda/TutorialDoRelatorio';
import { ExplicacaoDoIndicador } from '@/components/ajuda/ExplicacaoDoIndicador';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FarolDaMeta } from '@/components/comercial/FarolDaMeta';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { SeletorPeriodoDaCompetencia } from '@/components/comercial/SeletorPeriodoDaCompetencia';
import { SeletorVisao } from '@/components/comercial/SeletorVisao';
import { useVisaoRelatorio } from '@/hooks/useVisaoRelatorio';
import { usePeriodoDaCompetencia } from '@/hooks/usePeriodoDaCompetencia';
import { useQueryState } from '@/hooks/useQueryState';
import { usePodeGerirCarteiras } from '@/hooks/useAccessProfiles';
import { useCarteiras } from '@/hooks/useComercialCarteirasMetas';
import {
  STATUS_INTERACAO, useAcompanhamentoDaCarteira, useCarteiraMesAMes, useClienteMesAMes, useMinhasCarteiras, useVendaAtribuida,
  type FiltroFilial, type LinhaAcompanhamento,
} from '@/hooks/useComercialLancamentos';
import { competenciaAtual } from '@/lib/competencia-comercial';
import { fromLocalISODate, toLocalISODate, todayISO } from '@/lib/dates';
import { rotuloDoIntervalo } from '@/lib/period';
import { tendenciaDoCliente, type Tendencia } from '@/lib/tendencia-do-cliente';
import { formatBRL, formatDateBR } from '@/types/financeiro';

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const ROTULO_SITUACAO = { ativo: 'Ativo', inativo: 'Inativo', nunca_comprou: 'Nunca comprou' } as const;
// A bolinha do cliente: a mesma régua de cor da casa — verde bom, vermelho atenção, cinza sem dado.
const COR_SITUACAO = { ativo: 'bg-status-success', inativo: 'bg-status-danger', nunca_comprou: 'bg-status-muted' } as const;

// "Ritmo" (dono, 2026-10-16: "Tendência" e "Esfriando" confundiam): o nome diz o que o selo mede.
const CHIP_TENDENCIA: Record<Tendencia, { rotulo: string; classe: string }> = {
  alta: { rotulo: '↑ Comprando mais', classe: 'badge-success' },
  estavel: { rotulo: '→ Normal', classe: 'badge-neutral' },
  esfriando: { rotulo: '↓ Comprando menos', classe: 'badge-warning' },
  inativo: { rotulo: 'Parado', classe: 'badge-danger' },
  sem_base: { rotulo: '—', classe: '' },
};

/** "em out/26" e até onde o número vai ("01 a 16/10" no mês que está correndo) — o título diz o recorte. */
function rotuloDoRecorte(competencia: string, intervalo: { de: string; ate: string } | null, hoje: string) {
  if (intervalo) return { curto: 'no período', detalhe: rotuloDoIntervalo(intervalo) };
  const mes = rotuloDoMes(Number(competencia.slice(0, 4)), Number(competencia.slice(5, 7)) - 1);
  const correndo = hoje.slice(0, 7) === competencia.slice(0, 7);
  return {
    curto: `em ${mes}`,
    detalhe: correndo ? `de 01 a ${hoje.slice(8, 10)}/${hoje.slice(5, 7)} (o mês está correndo)` : 'o mês inteiro',
  };
}

/** "jan/26": o mês `indice` (0 = jan) do ano, aceitando índice negativo ou acima de 11. */
function rotuloDoMes(ano: number, indice: number): string {
  const d = new Date(ano, indice, 1);
  return `${MESES_CURTOS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
}

/** "jan/26 a set/26": os `meses` completos antes do mês de `base` ('aaaa-mm-dd'). */
function janelaAntes(base: string, meses: number): string {
  if (meses <= 0) return 'sem meses importados antes';
  const ano = Number(base.slice(0, 4));
  const mes = Number(base.slice(5, 7)) - 1;
  return meses === 1 ? rotuloDoMes(ano, mes - 1) : `${rotuloDoMes(ano, mes - meses)} a ${rotuloDoMes(ano, mes - 1)}`;
}

const SITUACOES = [
  { valor: '', rotulo: 'Todas as situações' },
  { valor: 'ativo', rotulo: 'Ativos' },
  { valor: 'inativo', rotulo: 'Inativos' },
  { valor: 'nunca_comprou', rotulo: 'Nunca comprou' },
] as const;

const FILIAIS = [
  { valor: '', rotulo: 'Todas as filiais' },
  { valor: 'INBRAS', rotulo: 'INBRAS' },
  { valor: 'MF', rotulo: 'MF' },
] as const;

// Os direcionais (dono, 2026-10-15): "ter apontamento dos seus clientes e facilitar o comercial a quem procurar".
// Cartões que filtram a lista; passar o mouse mostra quais. "Comprou menos": o recorte contra o anterior inteiro.
const DIRECIONAIS = [
  { id: 'sem_contato', titulo: 'Sem contato', filtro: (l: LinhaAcompanhamento) => l.contatos_mes === 0 },
  { id: 'com_contato', titulo: 'Com contato', filtro: (l: LinhaAcompanhamento) => l.contatos_mes > 0 },
  { id: 'nao_comprou', titulo: 'Não comprou', filtro: (l: LinhaAcompanhamento) => l.venda_mes <= 0 },
  { id: 'comprou_menos', titulo: 'Comprou menos que no mês anterior',
    filtro: (l: LinhaAcompanhamento) => l.venda_mes_passado > 0 && l.venda_mes < l.venda_mes_passado },
  { id: 'esfriando', titulo: 'Ritmo: comprando menos', filtro: (l: LinhaAcompanhamento) => tendenciaDoCliente(l) === 'esfriando' },
] as const;

export default function ComercialCarteiras() {
  const recorte = usePeriodoDaCompetencia();
  const { intervalo } = recorte;
  // Mês depois do atual não tem venda (dono, 2026-10-15: "novembro tem dados se nem chegou?").
  const competencia = recorte.competencia > competenciaAtual() ? competenciaAtual() : recorte.competencia;
  const geraCarteiras = usePodeGerirCarteiras();
  const { data: minhas = [], isLoading: carregandoMinha } = useMinhasCarteiras();
  const { data: todas = [] } = useCarteiras();
  const [escolhida, setEscolhida] = useQueryState('carteira', '');
  const [filialNaUrl, setFilial] = useQueryState<string>('filial', '');
  const filial = (FILIAIS.some((f) => f.valor === filialNaUrl) ? filialNaUrl : '') as FiltroFilial;
  const [visao, setVisao] = useVisaoRelatorio('comercial-carteira', 'simplificado');
  const analitico = visao === 'analitico';

  // O gestor escolhe entre todas; a vendedora, entre as dela (pode ter mais de uma desde 2026-10-01).
  const opcoes = geraCarteiras ? todas : minhas;
  const carteira = (escolhida && opcoes.includes(escolhida) ? escolhida : null) ?? minhas[0] ?? opcoes[0] ?? null;
  const ano = Number(competencia.slice(0, 4));
  const mesIndice = Number(competencia.slice(5, 7));

  const { data: linhas = [], isLoading } = useAcompanhamentoDaCarteira(carteira, competencia, intervalo, filial);
  const { data: meses = [] } = useCarteiraMesAMes(carteira, ano);
  const doMes = intervalo ? null : meses.find((m) => m.mes === mesIndice);
  const meta = doMes?.meta ?? null;
  const hoje = todayISO();
  const noRecorte = intervalo ? 'no período' : 'no mês';
  const recorteRotulo = rotuloDoRecorte(competencia, intervalo, hoje);
  const { data: vendaAtribuida } = useVendaAtribuida(competencia, intervalo);

  const [direcional, setDirecional] = useQueryState<string>('direcional', '');
  const ativo = DIRECIONAIS.find((d) => d.id === direcional) ?? null;
  // Filtro de situação (dono, 2026-10-15: "filtrar o que é inativo e o que está ativo"), junto com o direcional.
  const [situacao, setSituacao] = useQueryState<string>('situacao', '');
  const visiveis = useMemo(
    () => linhas.filter((l) => (!ativo || ativo.filtro(l)) && (!situacao || l.situacao === situacao)),
    [linhas, ativo, situacao]);
  const [clienteAberto, setClienteAberto] = useState<LinhaAcompanhamento | null>(null);

  // A janela de 12 e de 3 meses é a mesma para todas as linhas: começa antes do mês da tela (ou do início do
  // período) e não vai antes do dado importado — o banco devolve quantos meses ela tem.
  const base = intervalo?.de ?? competencia;
  const meses12 = linhas[0]?.meses_12 ?? 12;
  const meses3 = linhas[0]?.meses_3 ?? 3;
  const mesesPeriodo = linhas[0]?.meses_periodo ?? 1;

  const totais = useMemo(() => ({
    grupos: linhas.length,
    ativos: linhas.filter((l) => l.situacao === 'ativo').length,
    inativos: linhas.filter((l) => l.situacao === 'inativo').length,
    trabalhados: linhas.filter((l) => l.contatos_mes > 0).length,
    venda: linhas.reduce((s, l) => s + l.venda_mes, 0),
    aFaturar: linhas.reduce((s, l) => s + l.a_faturar, 0),
  }), [linhas]);

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={carteira ? `Carteira ${carteira}` : 'Carteiras'}
        description="Cada cliente da carteira: quanto comprou, se está comprando mais ou menos que o normal dele, e o último contato."
        icon={Briefcase}
        status={<FonteDoNumero fonte="os-dois" />}
        actions={<TutorialDoRelatorio id="comercial-carteiras" />}
      />

      <div className="p-4 sm:p-6 space-y-5 print:block">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Cada filtro com o nome em cima (dono, 2026-10-16: "saibam usar os filtros"). */}
          <div className="flex flex-wrap items-end gap-3 print:hidden">
            {opcoes.length > 1 && (
              <Filtro rotulo="Carteira">
                <Select value={carteira ?? ''} onValueChange={setEscolhida}>
                  <SelectTrigger className="h-9 w-48" aria-label="Carteira"><SelectValue placeholder="Carteira" /></SelectTrigger>
                  <SelectContent>{opcoes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </Filtro>
            )}
            <Filtro rotulo="Período (um mês, ou de uma data a outra)">
              <SeletorPeriodoDaCompetencia {...recorte} competencia={competencia} ateOMesAtual />
            </Filtro>
            <Filtro rotulo="Filial da nota">
              <Select value={filial || 'todas'} onValueChange={(v) => setFilial(v === 'todas' ? '' : v)}>
                <SelectTrigger className="h-9 w-40" aria-label="Filial"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FILIAIS.map((f) => <SelectItem key={f.rotulo} value={f.valor || 'todas'}>{f.rotulo}</SelectItem>)}
                </SelectContent>
              </Select>
            </Filtro>
            <Filtro rotulo="Situação do cliente">
              <Select value={situacao || 'todas'} onValueChange={(v) => setSituacao(v === 'todas' ? '' : v)}>
                <SelectTrigger className="h-9 w-44" aria-label="Situação do cliente"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SITUACOES.map((s) => <SelectItem key={s.rotulo} value={s.valor || 'todas'}>{s.rotulo}</SelectItem>)}
                </SelectContent>
              </Select>
            </Filtro>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <SeletorVisao visao={visao} onChange={setVisao} />
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1.5" aria-hidden="true" /> Imprimir / PDF
            </Button>
          </div>
        </div>

        {!carteira ? (
          carregandoMinha ? <Skeleton className="h-40 w-full" /> : (
            <Card className="p-6">
              <EmptyState
                icon={Briefcase}
                title={geraCarteiras ? 'Nenhuma carteira montada ainda' : 'Você ainda não está numa carteira'}
                description={geraCarteiras
                  ? 'Crie as carteiras em Comercial › Configurações › Carteiras e vendedoras.'
                  : 'Sua carteira aparece aqui assim que o gestor colocar você numa. Fale com ele.'}
              />
            </Card>
          )
        ) : (
          <>
            <ComoLer corte={vendaAtribuida?.corte ?? null} />
            {/* ── Cabeçalho: meta da Diretoria × venda (§8.1) ─────────────────────────── */}
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <ExplicacaoDoIndicador id="carteira.meta">
                <Card className="p-3 h-full">
                  <p className="text-[12px] text-muted-foreground">Meta {intervalo ? '' : 'do mês'}</p>
                  <p className="text-[18px] font-semibold font-mono">{meta === null ? '—' : formatBRL(meta)}</p>
                  {intervalo && <p className="text-[12px] text-muted-foreground">A meta é mensal: escolha "Um mês".</p>}
                </Card>
              </ExplicacaoDoIndicador>
              <ExplicacaoDoIndicador id="carteira.venda">
                <Card className="p-3 h-full">
                  <p className="text-[12px] text-muted-foreground">Vendido {recorteRotulo.curto}{filial ? ` · ${filial}` : ''}</p>
                  <p className="text-[18px] font-semibold font-mono">{formatBRL(totais.venda)}</p>
                  <p className="text-[12px] text-muted-foreground">{recorteRotulo.detalhe}</p>
                </Card>
              </ExplicacaoDoIndicador>
              <ExplicacaoDoIndicador id="carteira.cobertura">
                <Card className="p-3 h-full space-y-1">
                  <p className="text-[12px] text-muted-foreground">Cobertura da meta</p>
                  <p className="text-[18px] font-semibold font-mono">
                    {meta && meta > 0 ? `${((totais.venda / meta) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—'}
                  </p>
                  {/* A cor vem pronta do banco (`com_cor_do_farol`) — a mesma régua do painel; com filial, não há cor. */}
                  {meta !== null && !filial && <FarolDaMeta cor={doMes?.cor ?? 'sem_meta'} />}
                </Card>
              </ExplicacaoDoIndicador>
              <ExplicacaoDoIndicador id="carteira.a_faturar">
                <Card className="p-3 h-full">
                  <p className="text-[12px] text-muted-foreground">Pedido sem nota (a faturar)</p>
                  <p className="text-[18px] font-semibold font-mono">{formatBRL(totais.aFaturar)}</p>
                  <p className="text-[12px] text-muted-foreground">fechado, ainda não faturado</p>
                </Card>
              </ExplicacaoDoIndicador>
            </div>

            {/* ── O ano: meta × venda mês a mês (só no Analítico) ─────────────────────── */}
            {analitico && (
              <Card className="p-4 overflow-x-auto">
                <h2 className="text-sm font-semibold mb-2">
                  {ano}, mês a mês{filial && <span className="font-normal text-muted-foreground"> (as duas filiais)</span>}
                </h2>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="py-1 pr-2 text-left font-medium" />
                      {MESES_CURTOS.map((m, i) => (
                        <th key={m} className={`py-1 px-1.5 text-right font-medium ${!intervalo && i + 1 === mesIndice ? 'text-foreground' : ''}`}>{m}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-border">
                      <td className="py-1.5 pr-2 text-muted-foreground">Meta</td>
                      {meses.map((m) => <td key={m.mes} className="py-1.5 px-1.5 text-right font-mono">{m.meta === null ? '—' : formatBRL(m.meta)}</td>)}
                    </tr>
                    <tr className="border-t border-border">
                      <td className="py-1.5 pr-2 text-muted-foreground">Venda</td>
                      {meses.map((m) => <td key={m.mes} className="py-1.5 px-1.5 text-right font-mono">{m.venda ? formatBRL(m.venda) : '—'}</td>)}
                    </tr>
                  </tbody>
                </table>
              </Card>
            )}

            <p className="text-[13px] text-muted-foreground">
              {totais.grupos} clientes · {totais.ativos} ativos · {totais.inativos} inativos · {totais.trabalhados} com contato {noRecorte}
              {intervalo && <> · período <strong className="text-foreground">{rotuloDoIntervalo(intervalo)}</strong> ({mesesPeriodo} {mesesPeriodo === 1 ? 'mês' : 'meses'})</>}
            </p>

            {/* ── A quem procurar: os direcionais ─────────────────────────────────────── */}
            <h2 className="text-sm font-semibold print:hidden">
              A quem procurar <span className="font-normal text-muted-foreground">· clique num cartão para ver só esses clientes na lista</span>
            </h2>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-5 print:hidden">
              {DIRECIONAIS.map((d) => {
                const quais = linhas.filter(d.filtro);
                const marcado = ativo?.id === d.id;
                const titulo = d.id === 'esfriando' || d.id === 'comprou_menos' ? d.titulo : `${d.titulo} ${recorteRotulo.curto}`;
                return (
                  <HoverCard key={d.id} openDelay={150}>
                    <HoverCardTrigger asChild>
                      <button type="button" aria-pressed={marcado}
                        onClick={() => setDirecional(marcado ? '' : d.id)}
                        className={`rounded-lg border p-3 text-left transition-colors ${marcado ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted/50'}`}>
                        <p className="text-[22px] font-semibold font-mono leading-none">{quais.length}</p>
                        <p className="text-[12px] text-muted-foreground mt-1">{titulo}</p>
                        <p className="text-[11px] text-primary mt-0.5">{marcado ? 'filtrando · clique para tirar' : 'clique para filtrar'}</p>
                      </button>
                    </HoverCardTrigger>
                    <HoverCardContent side="bottom" className="w-72 p-0">
                      <p className="px-3 py-2 text-xs font-semibold border-b border-border">{titulo} · clique para filtrar</p>
                      <ul className="max-h-60 overflow-y-auto text-xs">
                        {quais.length === 0 ? <li className="px-3 py-2 text-muted-foreground">Nenhum.</li>
                          : quais.slice(0, 30).map((l) => <li key={l.grupo_chave} className="px-3 py-1.5 border-b border-border/40 last:border-0">{l.grupo_nome}</li>)}
                        {quais.length > 30 && <li className="px-3 py-1.5 text-muted-foreground">+ {quais.length - 30} outros</li>}
                      </ul>
                    </HoverCardContent>
                  </HoverCard>
                );
              })}
            </div>
            {(ativo || situacao) && (
              <p className="text-[13px]">
                Mostrando <strong>{visiveis.length}</strong> de {linhas.length}
                {ativo ? `: ${ativo.titulo.toLowerCase()}` : ''}
                {situacao ? ` · ${SITUACOES.find((s) => s.valor === situacao)?.rotulo.toLowerCase()}` : ''}.{' '}
                <button type="button" className="text-primary underline" onClick={() => { setDirecional(''); setSituacao(''); }}>Mostrar todos</button>
              </p>
            )}

            {/* ── As linhas: uma por grupo (§8.2) ─────────────────────────────────────── */}
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : linhas.length === 0 ? (
              <Card className="p-6">
                <EmptyState icon={Briefcase} title="Carteira sem clientes"
                  description="Atribua clientes a esta carteira em Configurações › Cadastro de clientes." />
              </Card>
            ) : (
              <Card className="overflow-x-auto">
                <p className="px-3 py-2 text-[12px] text-muted-foreground border-b border-border flex flex-wrap gap-x-4 gap-y-1">
                  <span><span className="inline-block h-2 w-2 rounded-full bg-status-success mr-1" />ativo</span>
                  <span><span className="inline-block h-2 w-2 rounded-full bg-status-danger mr-1" />parado: sem compra há mais de 120 dias</span>
                  <span><span className="text-status-danger font-semibold">valor vermelho</span>: comprou menos que no mês anterior</span>
                  <span><span className="text-status-success font-semibold">valor verde</span>: comprou mais</span>
                  <span>clique no nome do cliente para ver o mês a mês · passe o mouse no título da coluna para a explicação</span>
                </p>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-secondary/60 text-left text-muted-foreground">
                      <th className="px-3 py-2 font-semibold">Cliente</th>
                      <Coluna id="carteira.venda_cliente_mes" direita
                        titulo={`Comprou ${recorteRotulo.curto}`}
                        sub={intervalo ? rotuloDoIntervalo(intervalo) : 'embaixo: o mês anterior'} />
                      <Coluna id="carteira.media_12m" direita titulo="Média mensal"
                        sub={`${janelaAntes(base, meses12)}${meses12 < 12 ? ` (${meses12} ${meses12 === 1 ? 'mês' : 'meses'})` : ''}`} />
                      {analitico && <Coluna id="carteira.media_3m" direita titulo="Média 3 meses" sub={janelaAntes(base, meses3)} />}
                      <Coluna id="carteira.tendencia" titulo="Ritmo" sub={`últimos 3 meses (${janelaAntes(base, meses3)})`} />
                      <Coluna id="carteira.a_faturar" direita titulo="Pedido sem nota" sub="a faturar" />
                      {analitico && <Coluna id="carteira.venda_12m" direita titulo="Venda 12 meses" sub="e meses com compra" />}
                      {analitico && <Coluna id="carteira.contatos" direita titulo="Contatos" sub={noRecorte} />}
                      <Coluna id="carteira.ultimo_contato" titulo="Último contato" sub={recorteRotulo.curto} />
                      {analitico && <Coluna id="carteira.proximo_prazo" titulo="Próximo prazo" />}
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((l) => {
                      const vencido = !!l.proximo_prazo && l.proximo_prazo < hoje && l.status_ultimo_contato !== 'concluido';
                      const tendencia = CHIP_TENDENCIA[tendenciaDoCliente(l)];
                      const caiu = l.venda_mes_passado > 0 && l.venda_mes < l.venda_mes_passado;
                      const subiu = l.venda_mes > 0 && l.venda_mes > l.venda_mes_passado;
                      return (
                        <tr key={l.grupo_chave} className="border-t border-border align-top">
                          <td className="px-3 py-2">
                            <button type="button" className="flex items-start gap-2 text-left hover:underline"
                              onClick={() => setClienteAberto(l)} title="Ver o mês a mês do cliente">
                              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${COR_SITUACAO[l.situacao]}`}
                                aria-label={ROTULO_SITUACAO[l.situacao]} title={ROTULO_SITUACAO[l.situacao]} />
                              <span className="font-medium">{l.grupo_nome}</span>
                            </button>
                            <p className="text-muted-foreground pl-[18px]">
                              {ROTULO_SITUACAO[l.situacao]}{l.ultima_compra ? ` · última compra ${formatDateBR(l.ultima_compra)}` : ''}
                            </p>
                            {analitico && (
                              <p className="text-muted-foreground pl-[18px]">
                                {l.codigos.join(', ')}{l.uf_cidade ? ` · ${l.uf_cidade}` : ''}{l.tabelas ? ` · ${l.tabelas}` : ''}
                              </p>
                            )}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono whitespace-nowrap ${caiu ? 'text-status-danger' : subiu ? 'text-status-success' : ''}`}>
                            {l.venda_mes ? formatBRL(l.venda_mes) : '—'}
                            <p className="text-muted-foreground font-sans">
                              {intervalo ? 'período anterior' : 'mês anterior'}: {l.venda_mes_passado ? formatBRL(l.venda_mes_passado) : '—'}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{l.media_12m ? formatBRL(l.media_12m) : '—'}</td>
                          {analitico && <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{l.media_3m ? formatBRL(l.media_3m) : '—'}</td>}
                          <td className="px-3 py-2 whitespace-nowrap">
                            {tendencia.classe ? (
                              <Badge variant="outline" className={`text-[12px] ${tendencia.classe}`}
                                title={`Últimos 3 meses: ${formatBRL(l.media_3m)} por mês · média mensal: ${formatBRL(l.media_12m)}`}>
                                {tendencia.rotulo}
                              </Badge>
                            )
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{l.a_faturar ? formatBRL(l.a_faturar) : '—'}</td>
                          {analitico && (
                            <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                              {formatBRL(l.venda_12m)}
                              <p className="text-muted-foreground font-sans">{l.meses_com_compra} de {meses12} meses{l.recompra ? ' · recompra' : ''}</p>
                            </td>
                          )}
                          {analitico && <td className="px-3 py-2 text-right font-mono">{l.contatos_mes}</td>}
                          <td className="px-3 py-2">
                            {l.ultimo_contato ? (
                              <>
                                <span className="whitespace-nowrap">{formatDateBR(l.ultimo_contato)}</span>
                                <span className="text-muted-foreground"> · {STATUS_INTERACAO.find((s) => s.valor === l.status_ultimo_contato)?.rotulo}</span>
                                {analitico && l.observacao && <p className="text-muted-foreground line-clamp-2 max-w-[260px]">{l.observacao}</p>}
                              </>
                            ) : <span className="text-status-warning">Sem contato</span>}
                          </td>
                          {analitico && (
                            <td className={`px-3 py-2 whitespace-nowrap ${vencido ? 'text-destructive font-semibold' : ''}`}>
                              {l.proximo_prazo ? formatDateBR(l.proximo_prazo) : '—'}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            )}
          </>
        )}
      </div>

      <ClienteMesAMes linha={clienteAberto} onClose={() => setClienteAberto(null)} carteira={carteira}
        competencia={competencia} intervalo={intervalo} filial={filial} />
    </div>
  );
}

/** O nome do filtro em cima dele. */
function Filtro({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[12px] font-medium text-muted-foreground">{rotulo}</p>
      {children}
    </div>
  );
}

const CHAVE_COMO_LER = 'carteira-como-ler-recolhido';

/**
 * "Como ler esta tela" (dono, 2026-10-16: "precisa ser intuitivo para o comercial saber do que se trata esses
 * números"). Aberta na primeira visita; recolher fica lembrado neste navegador.
 */
function ComoLer({ corte }: { corte: string | null }) {
  const [recolhido, setRecolhido] = useState(() => {
    try { return localStorage.getItem(CHAVE_COMO_LER) === '1'; } catch { return false; }
  });
  const alternar = () => {
    const novo = !recolhido;
    setRecolhido(novo);
    try { localStorage.setItem(CHAVE_COMO_LER, novo ? '1' : '0'); } catch { /* sem armazenamento: vale só nesta visita */ }
  };
  return (
    <Card className="p-3 print:hidden">
      <button type="button" onClick={alternar} aria-expanded={!recolhido}
        className="flex w-full items-center gap-2 text-left text-sm font-semibold">
        <Info className="w-4 h-4 text-primary" aria-hidden="true" />
        Como ler esta tela
        <span className="ml-auto text-[12px] font-normal text-primary">{recolhido ? 'abrir' : 'recolher'}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${recolhido ? '' : 'rotate-180'}`} aria-hidden="true" />
      </button>
      {!recolhido && (
        <ul className="mt-2 space-y-1 text-[13px] text-muted-foreground list-disc pl-5">
          <li>
            <strong className="text-foreground">De onde vem a venda:</strong> das notas do Forteplus
            {corte && <> até <strong className="text-foreground">{formatDateBR(corte)}</strong></>} e, depois disso, dos lançamentos
            com nota fiscal. Lançamento sem nota não conta. Bonificação, publicidade e cashback não são venda.
          </li>
          <li>
            <strong className="text-foreground">Comprou:</strong> quanto o cliente comprou no mês (ou período) do filtro Período.
            Embaixo, o mês anterior, para comparar.
          </li>
          <li>
            <strong className="text-foreground">Média mensal:</strong> o normal do cliente, só com os meses antes do escolhido.{' '}
            <strong className="text-foreground">Ritmo:</strong> os últimos 3 meses fechados comparados com essa média; o mês que
            está correndo não entra.
          </li>
          <li>
            <strong className="text-foreground">Filtros:</strong> carteira, período (um mês, ou de uma data a outra), filial da
            nota e situação do cliente. Os cartões de "A quem procurar" também filtram: clique para ligar e desligar.
          </li>
        </ul>
      )}
    </Card>
  );
}

/** O título da coluna com a explicação ao passar o mouse (dono, 2026-10-15: "de onde vem cada número"). */
function Coluna({ id, titulo, sub, direita }: {
  id: Parameters<typeof ExplicacaoDoIndicador>[0]['id']; titulo: string; sub?: string; direita?: boolean;
}) {
  return (
    <th className={`px-3 py-2 font-semibold ${direita ? 'text-right' : ''}`}>
      <ExplicacaoDoIndicador id={id} className="underline decoration-dotted underline-offset-4">
        {titulo}
        {sub && <p className="font-normal text-[12px] no-underline">{sub}</p>}
      </ExplicacaoDoIndicador>
    </th>
  );
}

/** Clicar no cliente: a venda dele mês a mês — no período escolhido, ou nos 12 meses até o mês da tela. */
function ClienteMesAMes({ linha, onClose, carteira, competencia, intervalo, filial }: {
  linha: LinhaAcompanhamento | null; onClose: () => void; carteira: string | null; competencia: string;
  intervalo: { de: string; ate: string } | null; filial: FiltroFilial;
}) {
  const inicio = fromLocalISODate(competencia);
  const de = intervalo?.de ?? toLocalISODate(new Date(inicio.getFullYear(), inicio.getMonth() - 11, 1));
  const ate = intervalo?.ate ?? toLocalISODate(new Date(inicio.getFullYear(), inicio.getMonth() + 1, 0));
  const { data: meses = [], isLoading } = useClienteMesAMes(carteira, linha?.codigos ?? null, de, ate, filial);
  const maior = Math.max(0, ...meses.map((m) => m.venda));
  const total = meses.reduce((s, m) => s + m.venda, 0);
  return (
    <Dialog open={!!linha} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{linha?.grupo_nome}</DialogTitle>
        </DialogHeader>
        <p className="text-[13px] text-muted-foreground">
          Venda mês a mês de {formatDateBR(de)} a {formatDateBR(ate)}{filial ? ` · ${filial}` : ' · as duas filiais'}.
        </p>
        {isLoading ? <Skeleton className="h-48 w-full" /> : (
          <table className="w-full text-[13px]">
            <tbody>
              {meses.map((m) => (
                <tr key={m.mes} className="border-t border-border">
                  <td className="py-1.5 pr-2 w-16">{rotuloDoMes(Number(m.mes.slice(0, 4)), Number(m.mes.slice(5, 7)) - 1)}</td>
                  <td className="py-1.5 pr-2">
                    <div className="h-2 rounded bg-primary/70" style={{ width: maior > 0 ? `${Math.max(0, (m.venda / maior) * 100)}%` : 0 }} />
                  </td>
                  <td className="py-1.5 text-right font-mono whitespace-nowrap w-32">{m.venda ? formatBRL(m.venda) : '—'}</td>
                </tr>
              ))}
              <tr className="border-t border-border font-semibold">
                <td className="py-1.5" colSpan={2}>Total · média {meses.length ? formatBRL(total / meses.length) : '—'} por mês</td>
                <td className="py-1.5 text-right font-mono">{formatBRL(total)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </DialogContent>
    </Dialog>
  );
}
