// Comercial › Indicadores — o Painel do Gestor da planilha de Gestão Comercial (manual §6 e §7).
//
// Quatro blocos, na ordem da planilha: os indicadores de cada vendedora com meta, realizado e
// farol; o FAROL de ações do mês; o resumo das carteiras com as três leituras de ticket; e a
// situação da base (ativos, inativos, nunca compraram).
//
// TODO NÚMERO AQUI SAI DO LANÇAMENTO DAS VENDEDORAS, não da nota fiscal (decisão do dono,
// 2026-09-28). A nota fiscal importada entra num lugar só: dizer desde quando um cliente não
// compra, para a classificação de 120 dias — que é o que o manual manda (§10).
//
// Esta rota existia como redirect para `insights?visao=atendimento` desde que o CRM virou
// módulo próprio. Nenhum código navegava para ela; o endereço que alguém esperaria para
// "indicadores do comercial" passa a ser, enfim, os indicadores do comercial.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Info, Printer, Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { FarolDaMeta } from '@/components/comercial/FarolDaMeta';
import { SeletorCompetencia } from '@/components/comercial/SeletorCompetencia';
import { useQueryState } from '@/hooks/useQueryState';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { useLacunasDoCadastro } from '@/hooks/useComercialCliente';
import { usePeriodoImportado } from '@/hooks/useComercialPainel';
import {
  useFarolDeAcoes, usePainelDoGestor, useResumoDaCarteira, useSalvarMetaIndicador,
  type LinhaPainel, type ResumoCarteira,
} from '@/hooks/useComercialLancamentos';
import { competenciaAtual, competenciaCurta, lerCompetencia } from '@/lib/competencia-comercial';
import { totalDaEquipe } from '@/lib/resumo-equipe';
import { contarSolicitacoes, useSolicitacoesCadastro } from '@/hooks/useComercialSolicitacoes';
import { formatBRL } from '@/types/financeiro';

const eValor = (metrica: string) => metrica === 'valor_vendas';

function formatar(l: LinhaPainel, v: number | null): string {
  if (v === null) return '—';
  if (eValor(l.metrica)) return formatBRL(v);
  if (l.metrica === 'pct_meta') return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  return v.toLocaleString('pt-BR');
}

export default function ComercialIndicadores() {
  const [competenciaNaUrl, setCompetencia] = useQueryState('competencia', competenciaAtual());
  const competencia = lerCompetencia(competenciaNaUrl) ?? competenciaAtual();
  const { data: painel = [], isLoading } = usePainelDoGestor(competencia);
  const { data: farol = [] } = useFarolDeAcoes(competencia);
  const { data: resumo = [] } = useResumoDaCarteira(competencia);
  const { data: lacunas } = useLacunasDoCadastro();
  const { data: periodo } = usePeriodoImportado();
  const { canComoOBanco } = useDepartmentPermissions('comercial');
  const podeDefinirMeta = canComoOBanco('metas', 'definir');
  const geraCarteiras = canComoOBanco('carteiras', 'gerir');
  const { data: solicitacoes = [] } = useSolicitacoesCadastro();
  const filaCadastro = contarSolicitacoes(solicitacoes);

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

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={visaoDeEquipe ? 'Indicadores do Comercial' : 'Meus indicadores'}
        description={visaoDeEquipe
          ? 'Meta, realizado e farol de cada vendedora, as ações do mês e o resumo das carteiras — tudo a partir dos lançamentos.'
          : 'Sua meta, o que você realizou e o farol, suas ações do mês e o resumo da sua carteira — tudo a partir dos seus lançamentos.'}
        icon={BarChart3}
      />

      {/* `print:block` marca o que sai na impressão; o resto da tela some (`src/index.css`). É
          o "para apresentar" do pedido: imprimir ou salvar em PDF, sem biblioteca. */}
      <div className="p-4 sm:p-6 space-y-6 print:block">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SeletorCompetencia competencia={competencia} onChange={setCompetencia} />
          <Button variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-1.5" aria-hidden="true" /> Imprimir / salvar em PDF
          </Button>
        </div>

        {/* A fila de cadastro, como o bloco "FILA DE CADASTROS — APROVAÇÃO DO GESTOR" do
            Painel do Gestor da planilha. Só para quem decide, e só quando há o que decidir. */}
        {geraCarteiras && (filaCadastro.pendentes + filaCadastro.aAplicar) > 0 && (
          <Card className="p-3 badge-info text-[13px] print:hidden">
            Pedidos de cliente novo: <strong>{filaCadastro.pendentes}</strong> para aprovar e{' '}
            <strong>{filaCadastro.aAplicar}</strong> aprovados aguardando o código do Forteplus.{' '}
            <Link to="/comercial/clientes?aba=solicitacoes" className="underline">Ver pedidos</Link>
          </Card>
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
                <p className="text-center text-[13px] mt-3 print:hidden">
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
              {porVendedora.map(([id, v]) => (
                <Card key={id} className="p-4 space-y-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="text-sm font-semibold">{v.nome}</h2>
                    <span className="text-[12px] text-muted-foreground">{v.carteira ? `Carteira ${v.carteira}` : 'Sem carteira'}</span>
                  </div>
                  <table className="w-full text-[12px]">
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
                                {l.meta === null ? <span className="text-muted-foreground text-[11px]">sem meta da Diretoria</span> : formatar(l, l.meta)}
                              </span>
                            ) : podeDefinirMeta ? (
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
                  <p className="text-[11px] text-muted-foreground">
                    A meta de valor é a da carteira, definida pela Diretoria.
                    {podeDefinirMeta && ` As demais valem a partir de ${competenciaCurta(competencia)} e continuam nos meses seguintes até serem mudadas.`}
                  </p>
                </Card>
              ))}
            </div>

            {/* ── 2. FAROL de ações ──────────────────────────────────────────── */}
            <FarolDeAcoes linhas={farol} vendedoras={porVendedora.map(([id, v]) => ({ id, nome: v.nome }))} />

            {/* ── 3. Resumo das carteiras ────────────────────────────────────── */}
            <ResumoDasCarteiras linhas={resumo} mostrarTotal={visaoDeEquipe} />
          </>
        )}

        {/* A âncora da classificação de 120 dias (§10). "Hoje" só vale se a importação
            está em dia: com ela atrasada, todo mundo parece inativo. Dizer a data evita
            ler inatividade onde há só importação faltando. */}
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
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
      className="h-7 w-24 ml-auto text-right font-mono text-[12px]"
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

function FarolDeAcoes({ linhas, vendedoras }: {
  linhas: { indicador_id: string; acao: string; ordem: number; vendedor_id: string; quantidade: number }[];
  vendedoras: { id: string; nome: string }[];
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
        <h2 className="text-sm font-semibold">FAROL — ações realizadas no mês</h2>
        <p className="text-[12px] text-muted-foreground">Quantas vezes cada vendedora marcou cada ação. Ação conta mesmo sem cliente.</p>
      </div>
      {total === 0 ? (
        <p className="text-[12px] text-muted-foreground">Nenhuma ação marcada neste mês.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 font-medium">Ação</th>
                {vendedoras.map((v) => <th key={v.id} className="py-1 font-medium text-right">{v.nome}</th>)}
                <th className="py-1 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {acoes.map((a) => {
                const soma = [...a.por.values()].reduce((x, y) => x + y, 0);
                return (
                  <tr key={a.acao} className="border-t border-border">
                    <td className="py-1.5">{a.acao}</td>
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

function ResumoDasCarteiras({ linhas, mostrarTotal }: { linhas: ResumoCarteira[]; mostrarTotal: boolean }) {
  const total = useMemo(() => totalDaEquipe(linhas), [linhas]);
  const ticket = (v: number | null) => (v === null ? '—' : formatBRL(v));
  const colunas: { rotulo: string; valor: (r: typeof total) => string; dica?: string }[] = [
    { rotulo: 'Carteira', valor: (r) => String(r.total_carteira) },
    { rotulo: 'Ativos', valor: (r) => String(r.ativos), dica: 'Compraram nos últimos 120 dias' },
    { rotulo: 'Inativos', valor: (r) => String(r.inativos) },
    { rotulo: 'Nunca compraram', valor: (r) => String(r.nunca_compraram) },
    { rotulo: 'Relacionados', valor: (r) => String(r.relacionados), dica: 'Clientes distintos com algum lançamento no mês' },
    { rotulo: 'Compradores', valor: (r) => String(r.compradores) },
    { rotulo: 'Sem compra', valor: (r) => String(r.relacionados_sem_compra), dica: 'Trabalhados, sem venda concluída no mês' },
    { rotulo: 'Vendido', valor: (r) => formatBRL(r.valor_vendido) },
    { rotulo: 'Ticket ativos', valor: (r) => ticket(r.ticket_ativos), dica: 'Vendas de ativos ÷ compradores ativos' },
    { rotulo: 'Ticket reativados', valor: (r) => ticket(r.ticket_inativos), dica: 'Vendas de inativos ÷ compradores inativos' },
    { rotulo: 'Média da base ativa', valor: (r) => ticket(r.media_base_ativa), dica: 'Vendas de ativos ÷ todos os ativos da carteira' },
  ];

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Resumo das carteiras</h2>
        {/* O próprio manual insiste (§7.1): os dois números não devem ser iguais. Sem dizer
            por quê, alguém "conserta" o que está certo. */}
        <p className="text-[12px] text-muted-foreground">
          O <strong>ticket</strong> divide as vendas só por quem comprou; a <strong>média da base ativa</strong> divide por
          todos os clientes ativos da carteira, inclusive os que não compraram. Os dois respondem perguntas diferentes e
          não devem dar o mesmo número: com 10 ativos, 2 comprando R$ 20.000, o ticket é R$ 10.000 e a média é R$ 2.000.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 pr-2 font-medium">Vendedora</th>
              {colunas.map((c) => <th key={c.rotulo} title={c.dica} className="py-1 px-2 font-medium text-right whitespace-nowrap">{c.rotulo}</th>)}
            </tr>
          </thead>
          <tbody>
            {linhas.map((r) => (
              <tr key={r.vendedor_id} className="border-t border-border">
                <td className="py-1.5 pr-2 whitespace-nowrap">{r.vendedor_nome}</td>
                {colunas.map((c) => <td key={c.rotulo} className="py-1.5 px-2 text-right font-mono whitespace-nowrap">{c.valor(r)}</td>)}
              </tr>
            ))}
            {/* Para a vendedora sozinha, "total da equipe" seria ela mesma de novo, com um
                nome que diz outra coisa. */}
            {mostrarTotal && (
              <tr className="border-t-2 border-border font-semibold">
                <td className="py-1.5 pr-2">Total da equipe</td>
                {colunas.map((c) => <td key={c.rotulo} className="py-1.5 px-2 text-right font-mono whitespace-nowrap">{c.valor(total)}</td>)}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
