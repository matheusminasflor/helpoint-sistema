// Comercial › Carteiras — as abas "VIP - Fenício", "MG - Júlia" e "Outros Estados - Jaqueline"
// da planilha de Gestão Comercial (manual §8), dentro do sistema.
//
// DUAS DECISÕES DO DONO (2026-09-28) moldam a tela:
//   * sem meta por cliente — "a meta é definida diretamente pelo diretor … a meta de cada
//     carteira". O cabeçalho compara a meta da Diretoria com a venda lançada; as linhas não têm
//     meta individual;
//   * uma linha por GRUPO (cliente de acompanhamento), não por código do Forteplus.
//
// E as duas fontes, cada uma no seu lugar: o mês vem do LANÇAMENTO das vendedoras; o histórico
// (12 meses, meses com compra, recompra) vem do faturado do Forteplus, o único que existe.
//
// A vendedora vê a carteira dela — e a vê INTEIRA, inclusive a venda que uma colega lançou para
// um cliente dela pelo escape "fora da minha carteira". O gestor escolhe qualquer carteira.
import { useMemo } from 'react';
import { Briefcase, Printer } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FarolDaMeta } from '@/components/comercial/FarolDaMeta';
import { SeletorCompetencia } from '@/components/comercial/SeletorCompetencia';
import { useQueryState } from '@/hooks/useQueryState';
import { usePodeGerirCarteiras } from '@/hooks/useAccessProfiles';
import { useCarteiras } from '@/hooks/useComercialCarteirasMetas';
import {
  STATUS_INTERACAO, useAcompanhamentoDaCarteira, useCarteiraMesAMes, useMinhaCarteira,
} from '@/hooks/useComercialLancamentos';
import { competenciaAtual, lerCompetencia } from '@/lib/competencia-comercial';
import { todayISO } from '@/lib/dates';
import { formatBRL, formatDateBR } from '@/types/financeiro';

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const ROTULO_SITUACAO = { ativo: 'Ativo', inativo: 'Inativo', nunca_comprou: 'Nunca comprou' } as const;

export default function ComercialCarteiras() {
  const [competenciaNaUrl, setCompetencia] = useQueryState('competencia', competenciaAtual());
  const competencia = lerCompetencia(competenciaNaUrl) ?? competenciaAtual();
  const geraCarteiras = usePodeGerirCarteiras();
  const { data: minhaCarteira, isLoading: carregandoMinha } = useMinhaCarteira();
  const { data: todas = [] } = useCarteiras();
  const [escolhida, setEscolhida] = useQueryState('carteira', '');

  // A vendedora tem a dela; o gestor escolhe, e começa pela própria se tiver, ou pela primeira.
  const carteira = geraCarteiras ? (escolhida || minhaCarteira || todas[0] || null) : (minhaCarteira ?? null);
  const ano = Number(competencia.slice(0, 4));
  const mesIndice = Number(competencia.slice(5, 7));

  const { data: linhas = [], isLoading } = useAcompanhamentoDaCarteira(carteira, competencia);
  const { data: meses = [] } = useCarteiraMesAMes(carteira, ano);
  const doMes = meses.find((m) => m.mes === mesIndice);
  const meta = doMes?.meta ?? null;
  const venda = doMes?.venda ?? 0;
  const hoje = todayISO();

  const totais = useMemo(() => ({
    grupos: linhas.length,
    ativos: linhas.filter((l) => l.situacao === 'ativo').length,
    inativos: linhas.filter((l) => l.situacao === 'inativo').length,
    trabalhados: linhas.filter((l) => l.contatos_mes > 0).length,
  }), [linhas]);

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={carteira ? `Carteira ${carteira}` : 'Carteiras'}
        description="Cada cliente da carteira: a situação, o histórico de compra, o que foi feito no mês — e a carteira contra a meta da Diretoria."
        icon={Briefcase}
      />

      <div className="p-4 sm:p-6 space-y-5 print:block">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {geraCarteiras && todas.length > 0 && (
              <Select value={carteira ?? ''} onValueChange={setEscolhida}>
                <SelectTrigger className="h-8 w-48 print:hidden"><SelectValue placeholder="Carteira" /></SelectTrigger>
                <SelectContent>{todas.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <SeletorCompetencia competencia={competencia} onChange={setCompetencia} />
          </div>
          <Button variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-1.5" aria-hidden="true" /> Imprimir / salvar em PDF
          </Button>
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
            {/* ── Cabeçalho: meta da Diretoria × venda lançada (§8.1) ────────────── */}
            <div className="grid gap-3 sm:grid-cols-4">
              <Card className="p-3">
                <p className="text-[11px] text-muted-foreground">Meta da carteira (Diretoria)</p>
                <p className="text-[15px] font-semibold font-mono">{meta === null ? '—' : formatBRL(meta)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-[11px] text-muted-foreground">Venda lançada no mês</p>
                <p className="text-[15px] font-semibold font-mono">{formatBRL(venda)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-[11px] text-muted-foreground">Diferença</p>
                <p className="text-[15px] font-semibold font-mono">{meta === null ? '—' : formatBRL(venda - meta)}</p>
              </Card>
              <Card className="p-3 space-y-1">
                <p className="text-[11px] text-muted-foreground">Cobertura</p>
                <p className="text-[15px] font-semibold font-mono">
                  {meta && meta > 0 ? `${((venda / meta) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—'}
                </p>
                {/* A cor vem pronta do banco (`com_cor_do_farol`) — a mesma régua do painel. */}
                <FarolDaMeta cor={doMes?.cor ?? 'sem_meta'} />
              </Card>
            </div>

            {/* ── O ano: meta × venda mês a mês ─────────────────────────────────── */}
            <Card className="p-4 overflow-x-auto">
              <h2 className="text-sm font-semibold mb-2">{ano}, mês a mês</h2>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="py-1 pr-2 text-left font-medium" />
                    {MESES_CURTOS.map((m, i) => (
                      <th key={m} className={`py-1 px-1.5 text-right font-medium ${i + 1 === mesIndice ? 'text-foreground' : ''}`}>{m}</th>
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

            <p className="text-[12px] text-muted-foreground">
              {totais.grupos} clientes · {totais.ativos} ativos · {totais.inativos} inativos · {totais.trabalhados} trabalhados no mês
            </p>

            {/* ── As linhas: uma por grupo (§8.2) ───────────────────────────────── */}
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : linhas.length === 0 ? (
              <Card className="p-6">
                <EmptyState icon={Briefcase} title="Carteira sem clientes"
                  description="Atribua clientes a esta carteira em Comercial › Cadastro de clientes." />
              </Card>
            ) : (
              <Card className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-secondary/60 text-left text-muted-foreground">
                      <th className="px-3 py-2 font-semibold">Cliente</th>
                      <th className="px-3 py-2 font-semibold">Situação</th>
                      <th className="px-3 py-2 font-semibold text-right" title="Faturado do Forteplus nos 12 meses anteriores">12 meses</th>
                      <th className="px-3 py-2 font-semibold text-right" title="Média dos meses em que comprou">Média/mês</th>
                      <th className="px-3 py-2 font-semibold text-right">Venda no mês</th>
                      <th className="px-3 py-2 font-semibold text-right">Contatos</th>
                      <th className="px-3 py-2 font-semibold">Último contato</th>
                      <th className="px-3 py-2 font-semibold">Próximo prazo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l) => {
                      const vencido = !!l.proximo_prazo && l.proximo_prazo < hoje && l.status_ultimo_contato !== 'concluido';
                      return (
                        <tr key={l.grupo_chave} className={`border-t border-border align-top ${l.situacao === 'inativo' ? 'bg-destructive/5' : ''}`}>
                          <td className="px-3 py-2">
                            <p className="font-medium">{l.grupo_nome}</p>
                            <p className="text-muted-foreground">
                              {l.codigos.join(', ')}{l.uf_cidade ? ` · ${l.uf_cidade}` : ''}{l.tabelas ? ` · ${l.tabelas}` : ''}
                            </p>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {/* "Cliente inativo: linha destacada em vermelho" (§8.3). */}
                            <Badge variant="outline" className={`text-[10px] ${l.situacao === 'ativo' ? 'badge-success' : l.situacao === 'inativo' ? 'badge-danger' : ''}`}>
                              {ROTULO_SITUACAO[l.situacao]}
                            </Badge>
                            {l.ultima_compra && (
                              <p className="text-muted-foreground mt-0.5">última {formatDateBR(l.ultima_compra)}</p>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                            {formatBRL(l.faturado_12m)}
                            <p className="text-muted-foreground font-sans">{l.meses_com_compra} mês(es){l.recompra ? ' · recompra' : ''}</p>
                          </td>
                          <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{l.media_meses_compra === null ? '—' : formatBRL(l.media_meses_compra)}</td>
                          <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{l.venda_mes ? formatBRL(l.venda_mes) : '—'}</td>
                          <td className="px-3 py-2 text-right font-mono">{l.contatos_mes}</td>
                          <td className="px-3 py-2">
                            {l.ultimo_contato ? (
                              <>
                                <span className="whitespace-nowrap">{formatDateBR(l.ultimo_contato)}</span>
                                <span className="text-muted-foreground"> · {STATUS_INTERACAO.find((s) => s.valor === l.status_ultimo_contato)?.rotulo}</span>
                                {l.observacao && <p className="text-muted-foreground line-clamp-2 max-w-[260px]">{l.observacao}</p>}
                              </>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className={`px-3 py-2 whitespace-nowrap ${vencido ? 'text-destructive font-semibold' : ''}`}>
                            {l.proximo_prazo ? formatDateBR(l.proximo_prazo) : '—'}
                          </td>
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
    </div>
  );
}
