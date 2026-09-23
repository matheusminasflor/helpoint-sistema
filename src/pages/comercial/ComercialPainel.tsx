// O Painel Comercial (L6a) — a porta do módulo. Sobe as planilhas do
// Forteplus e vê o faturamento aparecer; ver `.scratch/plano-painel-
// comercial.md`.
import { useMemo, useState } from 'react';
import { BarChart3, TrendingUp, Upload, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FiltrosComerciais } from '@/components/comercial/FiltrosComerciais';
import {
  useAnoComVenda, useFaturamentoMensal, usePainelTotais, usePeriodoImportado, useRankingClientes,
  useUltimasImportacoes,
} from '@/hooks/useComercialPainel';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { ImportarVendasDialog } from '@/components/comercial/ImportarVendasDialog';
import { ImportarClientesDialog } from '@/components/comercial/ImportarClientesDialog';
import { CfopForaDaCurva } from '@/components/comercial/CfopForaDaCurva';
import { formatBRL, competenceLabel, formatDateBR } from '@/types/financeiro';
import type { Filial, Serie } from '@/types/comercial';

export function ComercialPainel() {
  // Os anos que existem de verdade (pedido do dono, 2026-09-21): nunca uma
  // janela fixa — o go-live importa de 2022 até hoje, e uma janela fixa
  // deixaria os anos mais antigos gravados e inalcançáveis na tela. Sem
  // nenhuma importação ainda, a lista volta vazia e o seletor mostra só o
  // ano corrente. `useAnoComVenda` (achado 7 da auditoria da L6c) reúne o
  // ano, a lista e o reajuste — a mesma cópia existia nas cinco telas do
  // Insights.
  const { ano, setAno, anos } = useAnoComVenda();
  const [filial, setFilial] = useState<Filial | null>(null);
  const [serie, setSerie] = useState<Serie | null>(null);
  const [abrirImportarVendas, setAbrirImportarVendas] = useState(false);
  const [abrirImportarClientes, setAbrirImportarClientes] = useState(false);

  const { canComoOBanco } = useDepartmentPermissions('comercial');
  const podeImportar = canComoOBanco('vendas', 'importar');
  const podeImportarClientes = canComoOBanco('vendas', 'importar');

  const { data: meses, isLoading } = useFaturamentoMensal(ano, filial, serie);
  const { data: ultimas } = useUltimasImportacoes();
  // §5 da Frente 1 (pedido do dono): a verdade sobre o que está PUBLICADO,
  // nunca sobre a última importação — as duas linhas do rodapé respondem
  // perguntas diferentes.
  const { data: periodoImportado } = usePeriodoImportado(filial);

  const ultimaVendas = ultimas?.find((i) => i.tipo === 'vendas');

  const periodo = useMemo(() => ({ de: `${ano}-01-01`, ate: `${ano}-12-31` }), [ano]);
  const { data: ranking } = useRankingClientes(periodo.de, periodo.ate, filial, serie, 20);

  // Os quatro KPIs do topo vêm de com_painel_totais, nunca somados a partir
  // de `meses` (achado 1 da auditoria): count(distinct …) não se soma entre
  // grupos de mês/filial/série — somar dava 129 clientes onde a verdade era 58.
  const { data: totais } = usePainelTotais(ano, filial, serie);
  const faturamento = totais?.venda ?? 0;
  const bonificacao = totais?.bonificacao ?? 0;
  const devolucao = totais?.devolucao ?? 0;
  const bonificacaoSobreVenda = faturamento > 0 ? (bonificacao / faturamento) * 100 : 0;

  const semImportacaoNenhuma = !isLoading && (meses ?? []).length === 0 && !ultimaVendas;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Vendas</h1>
          <p className="text-[13px] text-muted-foreground">Faturamento, clientes e curva de produtos — a partir do relatório do Forteplus.</p>
        </div>
        <div className="flex gap-2">
          {/* Achado 5 da auditoria: os botões não eram gateados — um member
              sem `vendas.importar` subia o arquivo inteiro e só levava 42501
              no fim. Ver é `has_comercial_access`; importar é outra coisa. */}
          {podeImportarClientes && (
            <Button variant="outline" onClick={() => setAbrirImportarClientes(true)}>
              <Upload className="w-4 h-4 mr-2" aria-hidden="true" />
              Importar clientes
            </Button>
          )}
          {podeImportar && (
            <Button onClick={() => setAbrirImportarVendas(true)}>
              <Upload className="w-4 h-4 mr-2" aria-hidden="true" />
              Importar vendas
            </Button>
          )}
        </div>
      </div>

      {semImportacaoNenhuma ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-[13px] text-muted-foreground">
          Nenhuma planilha importada ainda. Importe o relatório de vendas do Forteplus para o painel aparecer.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <FiltrosComerciais ano={ano} anos={anos} onAnoChange={setAno} filial={filial} onFilialChange={setFilial} />
            <Select value={serie ?? 'todas'} onValueChange={(v) => setSerie(v === 'todas' ? null : (v as Serie))}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Série" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">As duas séries</SelectItem>
                <SelectItem value="1">Série 1 (venda faturada)</SelectItem>
                <SelectItem value="75">Série 75 (o talão especial)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground"><TrendingUp className="w-4 h-4" aria-hidden="true" />Faturamento</div>
              <div className="mt-1 text-xl font-semibold font-mono">{formatBRL(faturamento)}</div>
              {/* Achado 4 da auditoria: o cartão continua mostrando a venda
                  bruta — é o número que o dono confere contra o Forteplus.
                  A devolução aparece aqui só quando existe; nada muda
                  quando ela é zero, que é o caso de hoje. */}
              {devolucao > 0 && (
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  − {formatBRL(devolucao)} em devolução · líquido {formatBRL(totais?.liquido ?? 0)}
                </div>
              )}
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground"><Users className="w-4 h-4" aria-hidden="true" />Clientes ativos</div>
              <div className="mt-1 text-xl font-semibold font-mono">{totais?.clientes_ativos ?? 0}</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground"><BarChart3 className="w-4 h-4" aria-hidden="true" />SKUs vendidos</div>
              <div className="mt-1 text-xl font-semibold font-mono">{totais?.skus_vendidos ?? 0}</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground"><TrendingUp className="w-4 h-4" aria-hidden="true" />Bonificação sobre a venda</div>
              <div className="mt-1 text-xl font-semibold font-mono">{bonificacaoSobreVenda.toFixed(1)}%</div>
            </div>
          </div>

          <div className="rounded-lg border border-border overflow-x-auto">
            <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">O ano mês a mês</div>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-secondary/60 text-left text-muted-foreground">
                  <th className="px-3 py-1.5 font-semibold">Competência</th>
                  <th className="px-3 py-1.5 font-semibold">Filial</th>
                  <th className="px-3 py-1.5 font-semibold">Série</th>
                  <th className="px-3 py-1.5 font-semibold text-right">Venda</th>
                  <th className="px-3 py-1.5 font-semibold text-right">Devolução</th>
                  <th className="px-3 py-1.5 font-semibold text-right">Bonificação</th>
                  <th className="px-3 py-1.5 font-semibold text-right">Líquido</th>
                </tr>
              </thead>
              <tbody>
                {(meses ?? []).map((m, idx) => (
                  <tr key={idx} className="border-t border-border">
                    <td className="px-3 py-1.5">{competenceLabel(m.competencia)}</td>
                    <td className="px-3 py-1.5">{m.filial}</td>
                    {/* Achado 9 da auditoria: o rótulo mentia para série
                        diferente de '1'/'75' — `serie` é texto livre vindo
                        do arquivo, sem check no banco. Rotular pelo valor
                        real: uma série nova aparece como "Série X", nunca
                        como "Série 1" mentido. */}
                    <td className="px-3 py-1.5">{`Série ${m.serie}`}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{formatBRL(m.venda)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{formatBRL(m.devolucao)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{formatBRL(m.bonificacao)}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-semibold">{formatBRL(m.liquido)}</td>
                  </tr>
                ))}
                {(meses ?? []).length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">Sem movimento em {ano}.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-border overflow-x-auto">
            <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Maiores compradores</div>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-secondary/60 text-left text-muted-foreground">
                  <th className="px-3 py-1.5 font-semibold">Cliente</th>
                  <th className="px-3 py-1.5 font-semibold">Tabela</th>
                  <th className="px-3 py-1.5 font-semibold text-right">Faturamento</th>
                  <th className="px-3 py-1.5 font-semibold text-right">Participação</th>
                </tr>
              </thead>
              <tbody>
                {(ranking ?? []).map((r) => (
                  <tr key={r.cliente_codigo} className="border-t border-border">
                    <td className="px-3 py-1.5">{r.nome}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{r.tabela_preco ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{formatBRL(r.faturamento)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{r.participacao.toFixed(1)}%</td>
                  </tr>
                ))}
                {(ranking ?? []).length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">Sem venda em {ano}.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <CfopForaDaCurva de={periodo.de} ate={periodo.ate} />
        </>
      )}

      {/* Pedido do dono, 2026-09-21: o sistema é a fonte a partir de agora —
          o painel HTML gerado por fora antes desta leva não é mais
          referência de nada (o go-live reimporta 2022 até hoje do zero). */}
      {ultimaVendas && (
        <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
          Última importação de vendas: {ultimaVendas.file_name} ({ultimaVendas.filial ?? '—'}), em {formatDateBR(ultimaVendas.created_at)}.
        </p>
      )}

      {/* §5 da Frente 1 (pedido do dono): o período coberto de verdade
          (com_periodo_importado), não o da última importação — as duas
          linhas respondem perguntas diferentes. */}
      <p className="text-[11px] text-muted-foreground">
        {periodoImportado && periodoImportado.competencias > 0
          ? `O sistema tem vendas de ${competenceLabel(periodoImportado.competencia_de)} a ${competenceLabel(periodoImportado.competencia_ate)} (${periodoImportado.competencias} ${periodoImportado.competencias === 1 ? 'mês' : 'meses'}).`
          : 'Nenhuma venda importada ainda.'}
      </p>

      {/* Achado 5 da auditoria: nada de botão fantasma — quando ninguém dos
          dois passa, a barra fica sem eles e o motivo aparece aqui. */}
      {!podeImportar && !podeImportarClientes && (
        <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
          Importar dados do Forteplus depende de permissão no seu perfil de acesso — fale com o administrador.
        </p>
      )}

      <ImportarVendasDialog open={abrirImportarVendas} onOpenChange={setAbrirImportarVendas} />
      <ImportarClientesDialog open={abrirImportarClientes} onOpenChange={setAbrirImportarClientes} />
    </div>
  );
}

export default ComercialPainel;
