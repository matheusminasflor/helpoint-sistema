// Financeiro › Relatório da Caixinha (dono, 2026-10-14): entradas e saídas do período, por setor (o da compra,
// quando a saída veio de um pedido), e o PDF com ou sem os recibos. Tudo na Caixinha já é dinheiro que saiu do
// caixa: não há "em aberto" nem forma de pagamento aqui — esses filtros estão no Relatório de compras.
// Duas Caixinhas (dono, 2026-10-20): escolhe-se INBRAS, MF ou as duas; a coluna diz de qual é cada lançamento.
import { useMemo, useState } from 'react';
import { useCaixinhas } from '@/hooks/useCaixinha';
import { ArrowDownCircle, ArrowUpCircle, FileDown, FileText, Paperclip, PiggyBank } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { KPICard } from '@/components/glpi/KPICard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { FiltroDePeriodo } from '@/components/financeiro/FiltroDePeriodo';
import { baixarAnexo, useCaixinhaDoRelatorio, type LancamentoDoRelatorio } from '@/hooks/useRelatoriosDoFinanceiro';
import { urlDoRecibo } from '@/hooks/useCaixinha';
import { intervaloDoPeriodo, type Intervalo, type TipoDePeriodo } from '@/lib/periodo-do-relatorio';
import { gerarRelatorioPdf } from '@/lib/relatorio-pdf';
import { rotuloDoSetor } from '@/lib/setores';
import { todayISO } from '@/lib/dates';
import { formatBRL, formatDateBR } from '@/types/financeiro';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Tipo = 'tudo' | 'entrada' | 'saida';
const SEM_SETOR = '__sem__';
const setorDo = (l: LancamentoDoRelatorio) => l.compra?.department ?? null;

export default function FinRelatorioCaixinha() {
  const [periodo, setPeriodo] = useState<TipoDePeriodo>('mes');
  const [personalizado, setPersonalizado] = useState<Partial<Intervalo>>({});
  const [setor, setSetor] = useState('');
  const [tipo, setTipo] = useState<Tipo>('tudo');
  const [gerando, setGerando] = useState(false);
  const intervalo = intervaloDoPeriodo(periodo, todayISO(), personalizado);
  const { data: lancamentos = [], isLoading } = useCaixinhaDoRelatorio(intervalo);
  const { data: caixinhas = [] } = useCaixinhas();
  const [caixinha, setCaixinha] = useState('');
  const filialDe = (id: string) => caixinhas.find((c) => c.id === id)?.filial ?? '—';

  const setores = useMemo(() => [...new Set(lancamentos.map((l) => setorDo(l) ?? SEM_SETOR))].sort(), [lancamentos]);
  const linhas = lancamentos.filter((l) => (tipo === 'tudo' || l.tipo === tipo)
    && (!caixinha || l.caixinha_id === caixinha)
    && (!setor || (setorDo(l) ?? SEM_SETOR) === setor));
  const nomeDaCaixinha = caixinha ? `Caixinha ${filialDe(caixinha)}` : 'INBRAS e MF';
  const entradas = linhas.filter((l) => l.tipo === 'entrada').reduce((s, l) => s + l.valor, 0);
  const saidas = linhas.filter((l) => l.tipo === 'saida').reduce((s, l) => s + l.valor, 0);
  const rotuloSetor = (s: string) => (s === SEM_SETOR ? 'Sem setor (lançado direto)' : rotuloDoSetor(s));

  const imprimir = async (comRecibos: boolean) => {
    setGerando(true);
    try {
      await gerarRelatorioPdf({
        titulo: caixinha ? `Relatório da ${nomeDaCaixinha}` : 'Relatório das Caixinhas (INBRAS e MF)',
        linhasDoCabecalho: [
          `Período: ${formatDateBR(intervalo.de)} a ${formatDateBR(intervalo.ate)} · Caixinha: ${nomeDaCaixinha}`,
          `Setor: ${setor ? rotuloSetor(setor) : 'todos'} · Lançamentos: ${tipo === 'tudo' ? 'entradas e saídas' : tipo === 'entrada' ? 'só entradas' : 'só saídas'}`,
          `Gerado em ${formatDateBR(todayISO())}`,
        ],
        colunas: [
          { titulo: 'Data', largura: 9 }, { titulo: 'Caixinha', largura: 8 }, { titulo: 'Descrição', largura: 40 },
          { titulo: 'Setor', largura: 14 }, { titulo: 'Entrada', largura: 11, direita: true }, { titulo: 'Saída', largura: 11, direita: true },
        ],
        linhas: linhas.map((l) => [formatDateBR(l.data), filialDe(l.caixinha_id), l.descricao, setorDo(l) ? rotuloDoSetor(setorDo(l)) : '—',
          l.tipo === 'entrada' ? formatBRL(l.valor) : '', l.tipo === 'saida' ? formatBRL(l.valor) : '']),
        totais: ['', '', `Saldo do período: ${formatBRL(entradas - saidas)}`, '', formatBRL(entradas), formatBRL(saidas)],
        anexos: comRecibos
          ? linhas.filter((l) => l.recibo_path).map((l) => ({
            titulo: `${formatDateBR(l.data)} · ${l.descricao} · ${formatBRL(l.valor)}`, path: l.recibo_path!,
          }))
          : [],
        baixar: baixarAnexo,
        nomeDoArquivo: `caixinha-${caixinha ? filialDe(caixinha).toLowerCase() + '-' : ''}${intervalo.de}-a-${intervalo.ate}.pdf`,
      });
    } catch (e) {
      toast.error(`Não gerou o PDF: ${(e as Error).message}`);
    } finally {
      setGerando(false);
    }
  };

  const abrirRecibo = async (path: string) => {
    const url = await urlDoRecibo(path);
    if (url) window.open(url, '_blank', 'noopener');
  };

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Relatório da Caixinha" icon={PiggyBank}
        description="O que entrou e saiu da Caixinha no período, com os recibos."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={gerando || linhas.length === 0} onClick={() => imprimir(false)}>
              <FileText className="w-4 h-4 mr-1.5" aria-hidden="true" />Só o relatório
            </Button>
            <Button disabled={gerando || linhas.length === 0} onClick={() => imprimir(true)}>
              <FileDown className="w-4 h-4 mr-1.5" aria-hidden="true" />{gerando ? 'Gerando…' : 'Relatório com os recibos'}
            </Button>
          </div>
        }>
        <div className="flex flex-wrap items-center gap-2">
          <FiltroDePeriodo tipo={periodo} onTipo={setPeriodo} personalizado={personalizado} onPersonalizado={setPersonalizado} />
          <select aria-label="Caixinha" value={caixinha} onChange={(e) => setCaixinha(e.target.value)}
            className="h-7 rounded-md border border-border bg-background px-2 text-xs">
            <option value="">As duas Caixinhas</option>
            {caixinhas.map((c) => <option key={c.id} value={c.id}>Caixinha {c.filial}</option>)}
          </select>
          <select aria-label="Setor" value={setor} onChange={(e) => setSetor(e.target.value)}
            className="h-7 rounded-md border border-border bg-background px-2 text-xs">
            <option value="">Todos os setores</option>
            {setores.map((s) => <option key={s} value={s}>{rotuloSetor(s)}</option>)}
          </select>
          <select aria-label="Lançamentos" value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}
            className="h-7 rounded-md border border-border bg-background px-2 text-xs">
            <option value="tudo">Entradas e saídas</option>
            <option value="entrada">Só entradas</option>
            <option value="saida">Só saídas</option>
          </select>
        </div>
      </PageHeader>

      <div className="p-4 lg:p-6 space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <KPICard value={formatBRL(entradas)} label="Entrou no período" icon={ArrowDownCircle} color="blue" />
          <KPICard value={formatBRL(saidas)} label="Saiu no período" icon={ArrowUpCircle} color="purple" />
          <KPICard value={formatBRL(entradas - saidas)} label="Saldo do período" icon={PiggyBank} color="green" />
        </div>
        <Card className="overflow-hidden">
          {isLoading ? <Skeleton className="h-48 w-full" /> : linhas.length === 0 ? (
            <EmptyState icon={PiggyBank} title="Nada no período" description="Nenhum lançamento da Caixinha com estes filtros." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-border bg-secondary/60 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">Data</th>
                    <th className="px-3 py-2 font-semibold">Caixinha</th>
                    <th className="px-3 py-2 font-semibold">Descrição</th>
                    <th className="px-3 py-2 font-semibold">Setor</th>
                    <th className="px-3 py-2 font-semibold text-right">Valor</th>
                    <th className="px-3 py-2 font-semibold">Recibo</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.id} className="border-b border-border">
                      <td className="px-3 py-2 font-mono text-xs">{formatDateBR(l.data)}</td>
                      <td className="px-3 py-2">{filialDe(l.caixinha_id)}</td>
                      <td className="px-3 py-2">{l.descricao}</td>
                      <td className="px-3 py-2">{setorDo(l) ? rotuloDoSetor(setorDo(l)) : '—'}</td>
                      <td className={cn('px-3 py-2 font-mono text-right', l.tipo === 'entrada' ? 'text-status-success' : 'text-status-danger')}>
                        {l.tipo === 'entrada' ? '+' : '−'} {formatBRL(l.valor)}
                      </td>
                      <td className="px-3 py-2">
                        {l.recibo_path ? (
                          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => abrirRecibo(l.recibo_path!)}>
                            <Paperclip className="w-3.5 h-3.5 mr-1" aria-hidden="true" />ver
                          </Button>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
