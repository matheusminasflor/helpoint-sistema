// O Painel Comercial (L6a) — a porta do módulo. Sobe as planilhas do
// Forteplus e vê o faturamento aparecer; ver `.scratch/plano-painel-
// comercial.md`.
import { useMemo, useState } from 'react';
import { BarChart3, TrendingUp, Upload, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFaturamentoMensal, useRankingClientes, useUltimasImportacoes } from '@/hooks/useComercialPainel';
import { ImportarVendasDialog } from '@/components/comercial/ImportarVendasDialog';
import { ImportarClientesDialog } from '@/components/comercial/ImportarClientesDialog';
import { CfopForaDaCurva } from '@/components/comercial/CfopForaDaCurva';
import { formatBRL, competenceLabel, formatDateBR } from '@/types/financeiro';
import type { Filial, Serie } from '@/types/comercial';

const ANO_ATUAL = new Date().getFullYear();
const ANOS = [ANO_ATUAL, ANO_ATUAL - 1, ANO_ATUAL - 2];

export function ComercialPainel() {
  const [ano, setAno] = useState(ANO_ATUAL);
  const [filial, setFilial] = useState<Filial | null>(null);
  const [serie, setSerie] = useState<Serie | null>(null);
  const [abrirImportarVendas, setAbrirImportarVendas] = useState(false);
  const [abrirImportarClientes, setAbrirImportarClientes] = useState(false);

  const { data: meses, isLoading } = useFaturamentoMensal(ano, filial, serie);
  const { data: ultimas } = useUltimasImportacoes();

  const ultimaVendas = ultimas?.find((i) => i.tipo === 'vendas');

  const periodo = useMemo(() => ({ de: `${ano}-01-01`, ate: `${ano}-12-31` }), [ano]);
  const { data: ranking } = useRankingClientes(periodo.de, periodo.ate, filial, serie, 20);

  const totais = useMemo(() => {
    const linhas = meses ?? [];
    return {
      faturamento: linhas.reduce((s, m) => s + m.venda, 0),
      clientesAtivos: linhas.reduce((s, m) => s + m.clientes_ativos, 0),
      skusVendidos: linhas.reduce((s, m) => s + m.skus_vendidos, 0),
      bonificacao: linhas.reduce((s, m) => s + m.bonificacao, 0),
    };
  }, [meses]);

  const bonificacaoSobreVenda = totais.faturamento > 0 ? (totais.bonificacao / totais.faturamento) * 100 : 0;

  const semImportacaoNenhuma = !isLoading && (meses ?? []).length === 0 && !ultimaVendas;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Painel Comercial</h1>
          <p className="text-[13px] text-muted-foreground">Faturamento, clientes e curva de produtos — a partir do relatório do Forteplus.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAbrirImportarClientes(true)}>
            <Upload className="w-4 h-4 mr-2" aria-hidden="true" />
            Importar clientes
          </Button>
          <Button onClick={() => setAbrirImportarVendas(true)}>
            <Upload className="w-4 h-4 mr-2" aria-hidden="true" />
            Importar vendas
          </Button>
        </div>
      </div>

      {semImportacaoNenhuma ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-[13px] text-muted-foreground">
          Nenhuma planilha importada ainda. Importe o relatório de vendas do Forteplus para o painel aparecer.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ANOS.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filial ?? 'todas'} onValueChange={(v) => setFilial(v === 'todas' ? null : (v as Filial))}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Filial" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">As duas filiais</SelectItem>
                <SelectItem value="MF">MF</SelectItem>
                <SelectItem value="INBRAS">INBRAS</SelectItem>
              </SelectContent>
            </Select>
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
              <div className="mt-1 text-xl font-semibold font-mono">{formatBRL(totais.faturamento)}</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground"><Users className="w-4 h-4" aria-hidden="true" />Clientes ativos</div>
              <div className="mt-1 text-xl font-semibold font-mono">{totais.clientesAtivos}</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground"><BarChart3 className="w-4 h-4" aria-hidden="true" />SKUs vendidos</div>
              <div className="mt-1 text-xl font-semibold font-mono">{totais.skusVendidos}</div>
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
                    <td className="px-3 py-1.5">{m.serie === '75' ? 'Série 75' : 'Série 1'}</td>
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

      <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
        {ultimaVendas
          ? `Última importação de vendas: ${ultimaVendas.file_name} (${ultimaVendas.filial ?? '—'}), em ${formatDateBR(ultimaVendas.created_at)}. `
          : ''}
        Os números vêm das planilhas importadas aqui. O HTML gerado antes saiu de outra exportação
        e não vai bater — compare com o Forteplus, não com o arquivo antigo.
      </p>

      <ImportarVendasDialog open={abrirImportarVendas} onOpenChange={setAbrirImportarVendas} />
      <ImportarClientesDialog open={abrirImportarClientes} onOpenChange={setAbrirImportarClientes} />
    </div>
  );
}

export default ComercialPainel;
