// Visão "Resumo" da Diretoria (Frente 3, item 4.1 do plano) — abertura do
// painel do diretor. Só os cinco indicadores do ano (§15) e o gráfico meta
// × realizado, nada mais: é recorte do que já existia numa aba só ("Meta ×
// realizado") que empilhava isto, mais duas tabelas por carteira e o
// simulador — as tabelas foram para "Metas e carteiras".
//
// A conta mora em `useMetaXRealizadoAno` (extraída para não duplicar entre
// esta tela e as tabelas por carteira — mesmo dado, dois recortes).
//
// ── Etapa 4 (2026-09-25) ────────────────────────────────────────────────
// O Resumo absorveu a aba "Setores" e virou o painel do diretor de verdade:
// além dos cinco indicadores e do gráfico, os OBJETIVOS DA EMPRESA e os
// CHAMADOS POR SETOR. O dono perguntou "o que o diretor faz ali?" sobre
// Setores — a resposta é esta: ele vê, sem procurar, o que está atrasado.
//
// Simplificado mostra os dois como FAROL (uma linha por item, só o que pede
// ação hoje); analítico traz a tabela completa de chamados, com o seletor de
// período, e os objetivos em cartão. Nada da aba antiga foi apagado.
import { ExportarATela } from '@/components/comercial/ExportarATela';
import { Link } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader } from '@/components/layout/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SeletorVisao } from '@/components/comercial/SeletorVisao';
import { useVisaoRelatorio } from '@/hooks/useVisaoRelatorio';
import { useMetaXRealizadoAno } from '@/hooks/useDiretoriaMetaXRealizado';
import { useTenantPath } from '@/hooks/useTenantPath';
import { rotaDaVisaoDiretoria, VISOES_DIRETORIA } from '@/config/diretoria-insights';
import { TutorialDoRelatorio } from '@/components/ajuda/TutorialDoRelatorio';
import { formatBRL } from '@/types/financeiro';
import { todayISO } from '@/lib/dates';
import { projecaoDoMes } from '@/lib/projecao-do-mes';
import { useRitmoDoMes } from '@/hooks/useComercialLancamentos';
import {
  CartoesObjetivos, FarolChamadosPorSetor, FarolObjetivos, TabelaChamadosPorSetor,
} from './ObjetivosEChamados';
import { estaPausada } from '@/config/telas-pausadas';
import { useConfiguracaoDosSetores } from '@/hooks/useAccessProfiles';
import { useClientesATrabalhar, useTendenciaProdutos } from '@/hooks/useComercialPainel';
import { alertasDoResumo, clientesQuePararam, type AlertaDaDiretoria } from '@/lib/alertas-da-diretoria';
import { limparNomeCliente } from '@/lib/nome-cliente';

// Metas pausadas pelo dono (2026-10-03): os objetivos da empresa saem do Resumo junto.
const metasPausadas = estaPausada('/metas');

export default function DiretoriaResumo() {
  const [visao, setVisao] = useVisaoRelatorio('diretoria-resumo');
  const tenantPath = useTenantPath();
  // Cada aba tem "Ver" no perfil da Diretoria (decisão 5, 2026-10-24): atalho só para a que abre.
  const perfil = useConfiguracaoDosSetores();
  const abre = (aba: string) => perfil.isLoading || perfil.isError || perfil.pode('diretoria', aba, 'view');
  const {
    ano, setAno, anosDisponiveis, isLoading, dadosGrafico,
    vendidoAteHoje, metaAteHoje, metaDoAno, realizadoDoPeriodo, mesmoPeriodoAnoAnterior,
  } = useMetaXRealizadoAno();
  const hoje = todayISO();
  // "até 16/10" no ano corrente; ano passado é o ano inteiro.
  const ateQuando = ano === Number(hoje.slice(0, 4)) ? `até ${hoje.slice(8, 10)}/${hoje.slice(5, 7)}` : 'no ano';
  const pct = vendidoAteHoje != null && metaAteHoje ? (vendidoAteHoje / metaAteHoje) * 100 : null;
  // Contra o ano anterior só nos meses FECHADOS: o mês em curso não tem o "até o mesmo dia" do ano passado (a venda
  // é mensal), e comparar o mês pela metade com o mês inteiro faria o ano parecer pior.
  const contraAnterior = realizadoDoPeriodo != null && mesmoPeriodoAnoAnterior ? (realizadoDoPeriodo / mesmoPeriodoAnoAnterior - 1) * 100 : null;
  const mesesFechados = Number(hoje.slice(0, 4)) === ano ? Number(hoje.slice(5, 7)) - 1 : 12;
  // O Resumo de 1 minuto (etapa 4, 2026-10-25): clientes que pararam e produtos que caem, no ano escolhido.
  const ateDoAno = Number(hoje.slice(0, 4)) === ano ? hoje : `${ano}-12-31`;
  const clientes = useClientesATrabalhar(ano, null);
  const produtos = useTendenciaProdutos(`${ano}-01-01`, ateDoAno, null, 'valor');
  const parados = clientesQuePararam(clientes.data?.linhas ?? []);
  const alertas = alertasDoResumo(clientes.data?.linhas ?? [], produtos.data?.linhas ?? []);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        icon={BarChart3}
        title="Resumo"
        description="O ano até aqui, os objetivos da empresa e quais setores estão atrasados."
        actions={<><ExportarATela arquivo="diretoria-resumo" setor="diretoria" /><TutorialDoRelatorio id="diretoria-resumo" /></>}
      />
      <div className="flex-1 overflow-y-auto px-4 lg:px-8 pb-6 space-y-5">
        <div className="flex items-center justify-end gap-2">
          <SeletorVisao visao={visao} onChange={setVisao} />
          {/* Não há seletor de filial de propósito — a meta é consolidada
              (confirmado com o dono, 2026-09-22): filtrar o realizado por
              INBRAS ou MF contra uma meta que vale pelas duas faria a
              cobertura mentir. Ver docs/nao-funciona.md. */}
          <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {anosDisponiveis.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? <Skeleton className="h-72 w-full" /> : (
          <>
            {/* VISÃO GERAL ENXUTA (revisão do sistema, 2026-10-01, decisão do dono): no simplificado,
                três números grandes e o gráfico. Desde 2026-10-15 "até aqui" inclui o mês corrente (até hoje, a meta
                dele proporcional aos dias), o % tem as três cores, e a comparação com o ano anterior mora só no
                Comparativo (Metas e carteiras), com o link aqui. */}
            {visao === 'simplificado' ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 rounded-lg border border-border bg-card divide-y sm:divide-y-0 sm:divide-x divide-border">
                <NumeroGrande titulo={`Vendido em ${ano} ${ateQuando}`} valor={vendidoAteHoje == null ? null : formatBRL(vendidoAteHoje)}
                  frase={contraAnterior == null || mesesFechados < 1 ? undefined
                    : `${contraAnterior >= 0 ? '+' : ''}${Math.round(contraAnterior)}% contra ${ano - 1} nos meses fechados (${mesesFechados === 12 ? 'o ano' : `jan–${MESES_CURTOS[mesesFechados - 1]}`})`}
                  ruim={contraAnterior != null && contraAnterior < 0} />
                <NumeroGrande titulo={`Meta ${ateQuando}`} valor={metaAteHoje == null ? null : formatBRL(metaAteHoje)}
                  frase={pct == null ? undefined : `${Math.round(pct)}% atingido`} ruim={pct != null && pct < 100} />
                <NumeroGrande titulo="Clientes que pararam de comprar" valor={clientes.isLoading ? null : String(parados.quantos)}
                  frase={clientes.isError ? 'não foi possível ler' : parados.quantos ? `${formatBRL(parados.emRisco)} nos 3 meses antes de parar` : undefined}
                  link={abre('clientes') ? tenantPath(rotaDaVisaoDiretoria('clientes')) : undefined} />
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Indicador titulo={`Realizado ${ateQuando}`} valor={vendidoAteHoje} />
                <Indicador titulo={`Meta ${ateQuando}`} valor={metaAteHoje} />
                <Indicador titulo="Meta do ano" valor={metaDoAno} />
              </div>
            )}
            {ano === Number(hoje.slice(0, 4)) && (
              <ProjecaoDoMesDaEmpresa mes={dadosGrafico[Number(hoje.slice(5, 7)) - 1]} competencia={`${hoje.slice(0, 7)}-01`} />
            )}
            {abre('metas') && <p className="text-[13px] text-muted-foreground">
              A comparação com os anos anteriores está no{' '}
              <Link to={tenantPath(rotaDaVisaoDiretoria('metas'))} className="text-primary underline">Comparativo, em Metas e carteiras</Link>.
            </p>}

            <div className="rounded-lg border border-border p-3">
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={dadosGrafico} margin={{ left: 8, right: 16, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="mes" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(v) => formatBRL(v)} width={70} />
                  <Tooltip formatter={(v: number | null) => (v == null ? 'sem dado' : formatBRL(v))} />
                  <Bar dataKey="realizado" name="Realizado" radius={[3, 3, 0, 0]}>
                    {dadosGrafico.map((d) => (
                      <Cell key={d.mes} fill={d.bate == null ? 'hsl(var(--primary))' : d.bate ? 'hsl(var(--status-success))' : 'hsl(var(--status-danger))'} />
                    ))}
                  </Bar>
                  <Line dataKey="meta" name="Meta" stroke="hsl(var(--foreground))" strokeDasharray="5 5" dot={false} connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {/* O conteúdo da antiga aba "Setores". Fica FORA do `isLoading` do
            meta × realizado de propósito: são outras consultas (`goals` e
            `tickets`), e esperar o carregamento das metas para mostrar quais
            chamados estão atrasados atrasaria justamente o número que pede
            ação hoje. */}
        {visao === 'simplificado' ? (
          <>
            {/* Atalhos: cada relatório da Diretoria com a frase do que ele responde. */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {VISOES_DIRETORIA.filter((v) => v.valor !== 'resumo' && abre(v.valor)).map((v) => (
                <Link key={v.valor} to={tenantPath(rotaDaVisaoDiretoria(v.valor))}
                  className="rounded-lg border border-border p-3 hover:border-primary/40 hover:bg-muted/40 transition-colors">
                  <p className="text-[14px] font-semibold text-foreground">{v.rotulo}</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">{v.descricao}</p>
                </Link>
              ))}
            </div>
            <PedeAtencao alertas={alertas} carregando={clientes.isLoading || produtos.isLoading}
              erro={clientes.isError || produtos.isError}
              linkDe={(a) => abre(a.tipo === 'cliente' ? 'clientes' : 'produtos')
                ? tenantPath(`${rotaDaVisaoDiretoria(a.tipo === 'cliente' ? 'clientes' : 'produtos')}&${a.tipo}=${encodeURIComponent(a.codigo)}`)
                : null} />
            <div className={metasPausadas ? 'grid gap-4' : 'grid gap-4 lg:grid-cols-2'}>
              {!metasPausadas && <FarolObjetivos />}
              <FarolChamadosPorSetor />
            </div>
          </>
        ) : (
          <>
            {!metasPausadas && <CartoesObjetivos />}
            <TabelaChamadosPorSetor />
          </>
        )}
      </div>
    </div>
  );
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Faixa dividida (nova cara): rótulo, número, uma frase. Cor só na frase, e só quando o número está fora do esperado. */
function NumeroGrande({ titulo, valor, frase, ruim, link }: { titulo: string; valor: string | null; frase?: string; ruim?: boolean; link?: string }) {
  const corpo = (
    <>
      <p className="text-[13px] text-muted-foreground">{titulo}</p>
      <p className="text-2xl font-semibold mt-1 tabular-nums text-foreground">
        {valor ?? <span className="text-muted-foreground text-base font-normal">sem dado</span>}
      </p>
      {frase && <p className={`text-[13px] mt-0.5 ${ruim ? 'text-status-danger' : 'text-muted-foreground'}`}>{frase}</p>}
    </>
  );
  return link
    ? <Link to={link} className="block p-4 hover:bg-muted/40 transition-colors">{corpo}</Link>
    : <div className="p-4">{corpo}</div>;
}

/** Os três alertas mais fortes de clientes e produtos (`alertasDoResumo`), cada um levando à ficha. */
function PedeAtencao({ alertas, carregando, erro, linkDe }: {
  alertas: AlertaDaDiretoria[]; carregando: boolean; erro: boolean; linkDe: (a: AlertaDaDiretoria) => string | null;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <h2 className="text-[14px] font-semibold px-4 pt-3 pb-2">Pede atenção</h2>
      {carregando ? <Skeleton className="h-16 mx-4 mb-3" />
        : erro ? <p className="px-4 pb-3 text-[13px] text-status-danger">Não foi possível ler clientes e produtos agora.</p>
        : alertas.length === 0 ? <p className="px-4 pb-3 text-[13px] text-muted-foreground">Nenhum cliente parou e nenhum produto está caindo no ano.</p>
        : (
          <ul className="divide-y divide-border border-t border-border">
            {alertas.map((a) => {
              const texto = a.tipo === 'cliente'
                ? <><b className="font-medium">{limparNomeCliente(a.nome)}</b> parou de comprar
                    <span className="text-muted-foreground"> · comprava {formatBRL(a.valor!)} nos 3 meses antes{a.ultimaCompra ? `, a última em ${a.ultimaCompra.slice(8, 10)}/${a.ultimaCompra.slice(5, 7)}` : ''}</span></>
                : <><b className="font-medium">{a.nome}</b> está caindo
                    <span className="text-muted-foreground"> · {Math.round(a.variacao! * 100)}% da primeira para a segunda metade do ano</span></>;
              const link = linkDe(a);
              return (
                <li key={`${a.tipo}-${a.codigo}`} className="text-[14px]">
                  {link ? <Link to={link} className="block px-4 py-2.5 hover:bg-muted/40">{texto}</Link> : <p className="px-4 py-2.5">{texto}</p>}
                </li>
              );
            })}
          </ul>
        )}
    </section>
  );
}

/**
 * A projeção do fechamento do mês da empresa (R6): o realizado e a meta do mês que o gráfico abaixo já mostra (a mesma
 * conta de `useMetaXRealizadoAno`), no ritmo dos dias úteis até o último dado. `data-novo-r6`: número novo da R6.
 */
export function ProjecaoDoMesDaEmpresa({ mes, competencia }: { mes?: { mes: string; realizado: number | null; meta: number | null }; competencia: string }) {
  const { data: ritmo } = useRitmoDoMes(competencia);
  const p = projecaoDoMes(mes?.realizado ?? null, mes?.meta ?? null, ritmo);
  if (!p || !ritmo || !mes) return null;
  return (
    <p data-novo-r6 className="text-[14px] rounded-lg border border-border bg-card px-4 py-3">
      Projeção do fechamento de {mes.mes}: <strong className="tabular-nums">{formatBRL(p.valor)}</strong>
      {p.pctMeta != null && <> · <strong className={p.pctMeta >= 100 ? 'text-status-success' : 'text-status-warning'}>{Math.round(p.pctMeta)}% da meta</strong></>}
      <span className="text-muted-foreground"> · no ritmo de {ritmo.dias_uteis_ate} de {ritmo.dias_uteis_mes} dias úteis
        {ritmo.ultimo_dado ? `, com dado até ${ritmo.ultimo_dado.slice(8, 10)}/${ritmo.ultimo_dado.slice(5, 7)}` : ''}</span>
    </p>
  );
}

function Indicador({ titulo, valor }: { titulo: string; valor: number | null }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[12px] text-muted-foreground">{titulo}</p>
      <p className="text-sm font-semibold text-foreground mt-0.5">
        {valor == null ? <span className="text-muted-foreground font-normal">sem dado</span> : formatBRL(valor)}
      </p>
    </div>
  );
}
