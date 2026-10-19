// Financeiro › Relatório de compras (dono, 2026-10-14): as compras feitas no período, com filtro por setor, forma
// de pagamento e situação (em aberto para pagar ou liquidado), e o PDF com ou sem as notas anexadas. Em 2026-10-19
// (dono): as pagas que aguardam a nota entram pela data do pagamento, e um quadro por filial vai na tela e no PDF.
import { useMemo, useState } from 'react';
import { FileDown, FileText, Hourglass, Paperclip, ShoppingCart } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { KPICard } from '@/components/glpi/KPICard';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { FiltroDePeriodo } from '@/components/financeiro/FiltroDePeriodo';
import {
  baixarAnexo, resumoPorFilial, situacaoDaCompra, useComprasDoRelatorio, type CompraDoRelatorio,
} from '@/hooks/useRelatoriosDoFinanceiro';
import { getPurchaseFileUrl } from '@/hooks/usePurchases';
import { intervaloDoPeriodo, type Intervalo, type TipoDePeriodo } from '@/lib/periodo-do-relatorio';
import { gerarRelatorioPdf } from '@/lib/relatorio-pdf';
import { rotuloDoSetor } from '@/lib/setores';
import { todayISO } from '@/lib/dates';
import { formatBRL, formatDateBR } from '@/types/financeiro';
import { FORMA_PAGAMENTO_LABEL, FILIAIS_DA_COMPRA, rotuloDoPagamento, type FormaPagamento } from '@/types/purchases';
import { toast } from 'sonner';

type Situacao = 'todas' | 'aberto' | 'liquidado' | 'sem-nota';

const formaDa = (c: CompraDoRelatorio): FormaPagamento | null => (c.caixinha ? 'caixinha' : c.forma_pagamento);
const pagamentoDa = (c: CompraDoRelatorio) => {
  const f = formaDa(c);
  return f ? rotuloDoPagamento(f, c.parcelas) : '—';
};

export default function FinRelatorioCompras() {
  const [tipo, setTipo] = useState<TipoDePeriodo>('mes');
  const [personalizado, setPersonalizado] = useState<Partial<Intervalo>>({});
  const [setor, setSetor] = useState('');
  const [forma, setForma] = useState<FormaPagamento | ''>('');
  const [situacao, setSituacao] = useState<Situacao>('todas');
  const [filial, setFilial] = useState('');
  const [gerando, setGerando] = useState(false);
  const intervalo = intervaloDoPeriodo(tipo, todayISO(), personalizado);
  const { data: compras = [], isLoading } = useComprasDoRelatorio(intervalo);

  const setores = useMemo(() => [...new Set(compras.map((c) => c.department ?? ''))].sort(), [compras]);
  const linhas = compras.filter((c) => {
    const s = situacaoDaCompra(c);
    return (!setor || (c.department ?? '') === setor)
      && (!forma || formaDa(c) === forma)
      && (!filial || (c.filial ?? 'sem') === filial)
      && (situacao === 'todas' || (situacao === 'sem-nota' ? c.aguardandoNota : (situacao === 'aberto') === s.aberta));
  });
  const total = linhas.reduce((s, c) => s + Number(c.estimated_amount ?? 0), 0);
  const emAberto = linhas.reduce((s, c) => s + situacaoDaCompra(c).emAberto, 0);
  const semNota = linhas.filter((c) => c.aguardandoNota);
  const filiais = resumoPorFilial(linhas);

  const imprimir = async (comRecibos: boolean) => {
    setGerando(true);
    try {
      await gerarRelatorioPdf({
        titulo: 'Relatório de compras',
        linhasDoCabecalho: [
          `Período: ${formatDateBR(intervalo.de)} a ${formatDateBR(intervalo.ate)}`,
          `Setor: ${setor ? rotuloDoSetor(setor) : 'todos'} · Filial: ${filial === 'sem' ? 'sem filial' : filial || 'todas'} · Forma de pagamento: ${forma ? FORMA_PAGAMENTO_LABEL[forma] : 'todas'} · Situação: ${
            situacao === 'todas' ? 'todas' : situacao === 'aberto' ? 'em aberto' : situacao === 'liquidado' ? 'liquidadas' : 'aguardando a nota'}`,
          ...filiais.map((f) => `${f.filial}: ${f.compras} compra(s), ${formatBRL(f.total)} · em aberto ${formatBRL(f.emAberto)}`
            + ` · liquidado ${formatBRL(f.total - f.emAberto)} · aguardando a nota ${formatBRL(f.aguardandoNota)}`),
          `Gerado em ${formatDateBR(todayISO())}`,
        ],
        colunas: [
          { titulo: 'Data', largura: 9 }, { titulo: 'Produto', largura: 30 }, { titulo: 'Fornecedor', largura: 18 },
          { titulo: 'Setor', largura: 12 }, { titulo: 'Pagamento', largura: 12 }, { titulo: 'Filial', largura: 6 },
          { titulo: 'Valor', largura: 11, direita: true }, { titulo: 'Situação', largura: 16 },
        ],
        linhas: linhas.map((c) => {
          const s = situacaoDaCompra(c);
          return [formatDateBR(c.data), c.product_name, c.cotacao?.supplier ?? '—', rotuloDoSetor(c.department), pagamentoDa(c),
            c.filial ?? '—', formatBRL(Number(c.estimated_amount ?? 0)),
            (s.aberta ? `Em aberto (${formatBRL(s.emAberto)})` : 'Liquidado') + (c.aguardandoNota ? ' · aguardando a nota' : '')];
        }),
        totais: ['', `${linhas.length} compra(s)`, '', '', '', '', formatBRL(total), `Em aberto: ${formatBRL(emAberto)}`],
        anexos: comRecibos
          ? linhas.filter((c) => c.purchase_file_path).map((c) => ({
            titulo: `${formatDateBR(c.data)} · ${c.product_name} · ${formatBRL(Number(c.estimated_amount ?? 0))}`,
            path: c.purchase_file_path!,
          }))
          : [],
        baixar: baixarAnexo,
        nomeDoArquivo: `compras-${intervalo.de}-a-${intervalo.ate}.pdf`,
      });
    } catch (e) {
      toast.error(`Não gerou o PDF: ${(e as Error).message}`);
    } finally {
      setGerando(false);
    }
  };

  const abrirNota = async (path: string) => {
    const url = await getPurchaseFileUrl(path);
    if (url) window.open(url, '_blank', 'noopener');
  };

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Relatório de compras" icon={ShoppingCart}
        description="As compras feitas no período (as pagas sem nota pela data do pagamento), quanto ainda está em aberto para pagar e as notas."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={gerando || linhas.length === 0} onClick={() => imprimir(false)}>
              <FileText className="w-4 h-4 mr-1.5" aria-hidden="true" />Só o relatório
            </Button>
            <Button disabled={gerando || linhas.length === 0} onClick={() => imprimir(true)}>
              <FileDown className="w-4 h-4 mr-1.5" aria-hidden="true" />{gerando ? 'Gerando…' : 'Relatório com as notas'}
            </Button>
          </div>
        }>
        <div className="flex flex-wrap items-center gap-2">
          <FiltroDePeriodo tipo={tipo} onTipo={setTipo} personalizado={personalizado} onPersonalizado={setPersonalizado} />
          <select aria-label="Setor" value={setor} onChange={(e) => setSetor(e.target.value)}
            className="h-7 rounded-md border border-border bg-background px-2 text-xs">
            <option value="">Todos os setores</option>
            {setores.map((s) => <option key={s || 'sem'} value={s}>{rotuloDoSetor(s || null)}</option>)}
          </select>
          <select aria-label="Forma de pagamento" value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento | '')}
            className="h-7 rounded-md border border-border bg-background px-2 text-xs">
            <option value="">Todas as formas</option>
            {(Object.keys(FORMA_PAGAMENTO_LABEL) as FormaPagamento[]).map((f) => <option key={f} value={f}>{FORMA_PAGAMENTO_LABEL[f]}</option>)}
          </select>
          <select aria-label="Filial" value={filial} onChange={(e) => setFilial(e.target.value)}
            className="h-7 rounded-md border border-border bg-background px-2 text-xs">
            <option value="">Todas as filiais</option>
            {FILIAIS_DA_COMPRA.map((f) => <option key={f} value={f}>{f}</option>)}
            <option value="sem">Sem filial</option>
          </select>
          <select aria-label="Situação" value={situacao} onChange={(e) => setSituacao(e.target.value as Situacao)}
            className="h-7 rounded-md border border-border bg-background px-2 text-xs">
            <option value="todas">Em aberto e liquidadas</option>
            <option value="aberto">Só em aberto para pagar</option>
            <option value="liquidado">Só liquidadas</option>
            <option value="sem-nota">Só aguardando a nota</option>
          </select>
        </div>
      </PageHeader>

      <div className="p-4 lg:p-6 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard value={formatBRL(total)} label={`${linhas.length} compra(s) no período`} icon={ShoppingCart} color="blue" />
          <KPICard value={formatBRL(emAberto)} label="Em aberto para pagar" icon={FileText} color="orange" />
          <KPICard value={formatBRL(total - emAberto)} label="Liquidado" icon={FileText} color="green" />
          <KPICard value={formatBRL(semNota.reduce((s, c) => s + Number(c.estimated_amount ?? 0), 0))}
            label={`${semNota.length} paga(s) aguardando a nota`} icon={Hourglass} color="purple" />
        </div>
        {filiais.length > 0 && (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-border bg-secondary/60 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">Filial</th>
                    <th className="px-3 py-2 font-semibold text-right">Compras</th>
                    <th className="px-3 py-2 font-semibold text-right">Total</th>
                    <th className="px-3 py-2 font-semibold text-right">Em aberto</th>
                    <th className="px-3 py-2 font-semibold text-right">Liquidado</th>
                    <th className="px-3 py-2 font-semibold text-right">Aguardando a nota</th>
                  </tr>
                </thead>
                <tbody>
                  {filiais.map((f) => (
                    <tr key={f.filial} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 font-medium">{f.filial}</td>
                      <td className="px-3 py-2 font-mono text-right">{f.compras}</td>
                      <td className="px-3 py-2 font-mono text-right">{formatBRL(f.total)}</td>
                      <td className="px-3 py-2 font-mono text-right">{formatBRL(f.emAberto)}</td>
                      <td className="px-3 py-2 font-mono text-right">{formatBRL(f.total - f.emAberto)}</td>
                      <td className="px-3 py-2 font-mono text-right">{formatBRL(f.aguardandoNota)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        <Card className="overflow-hidden">
          {isLoading ? <Skeleton className="h-48 w-full" /> : linhas.length === 0 ? (
            <EmptyState icon={ShoppingCart} title="Nenhuma compra" description="Nenhuma compra registrada com estes filtros." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-border bg-secondary/60 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">Data</th>
                    <th className="px-3 py-2 font-semibold">Produto</th>
                    <th className="px-3 py-2 font-semibold">Fornecedor</th>
                    <th className="px-3 py-2 font-semibold">Setor</th>
                    <th className="px-3 py-2 font-semibold">Pagamento</th>
                    <th className="px-3 py-2 font-semibold">Filial</th>
                    <th className="px-3 py-2 font-semibold text-right">Valor</th>
                    <th className="px-3 py-2 font-semibold">Situação</th>
                    <th className="px-3 py-2 font-semibold">Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((c) => {
                    const s = situacaoDaCompra(c);
                    return (
                      <tr key={c.id} className="border-b border-border">
                        <td className="px-3 py-2 font-mono text-xs">{formatDateBR(c.data)}</td>
                        <td className="px-3 py-2 font-medium">{c.product_name}</td>
                        <td className="px-3 py-2">{c.cotacao?.supplier ?? '—'}</td>
                        <td className="px-3 py-2">{rotuloDoSetor(c.department)}</td>
                        <td className="px-3 py-2">{pagamentoDa(c)}</td>
                        <td className="px-3 py-2">{c.filial ?? '—'}</td>
                        <td className="px-3 py-2 font-mono text-right">{formatBRL(Number(c.estimated_amount ?? 0))}</td>
                        <td className="px-3 py-2">
                          {s.aberta
                            ? <Badge className="badge-warning">Em aberto · {formatBRL(s.emAberto)}</Badge>
                            : <Badge className="badge-success">Liquidado</Badge>}
                          {c.aguardandoNota && <Badge className="badge-info ml-1">Aguardando a nota</Badge>}
                        </td>
                        <td className="px-3 py-2">
                          {c.purchase_file_path ? (
                            <Button variant="link" size="sm" className="h-auto p-0" onClick={() => abrirNota(c.purchase_file_path!)}>
                              <Paperclip className="w-3.5 h-3.5 mr-1" aria-hidden="true" />ver
                            </Button>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
