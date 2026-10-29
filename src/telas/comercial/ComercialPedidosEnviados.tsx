// Comercial › Pedidos enviados (dono, 2026-10-29): "o Comercial precisa de visibilidade sobre todos os lançamentos já
// enviados ao Financeiro, com ferramentas para agrupar e filtrar por status, e a opção de reajustar os finalizados,
// pagos ou em negociação". A vendedora vê os dela; o gestor, a equipe — o RLS de `ped_checklists` decide.
//
// Leis de UX (as da casa, lawsofux.com):
//   * Jakob — as mesmas filas e colunas da Conferência do Financeiro: os dois lados falam a mesma língua;
//   * Zeigarnik / posição serial — "Devolvidos" (o que espera a vendedora) vem logo depois de "Todos", e em "Todos" o
//     grupo dos devolvidos aparece primeiro;
//   * Hick — poucas abas, cada uma com a contagem, e uma busca; o filtro de vendedora só aparece para quem vê a equipe;
//   * Região comum / proximidade — em "Todos", um cartão por situação, com o título e a soma do grupo;
//   * Von Restorff — a cor diz o estado: devolvido em âmbar, cancelado em vermelho, finalizado em verde.
import { useMemo, useState } from 'react';
import { PackageCheck } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { AbasSegmentadas } from '@/components/ui/abas-segmentadas';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChecklistPreenchido, ResumoDaConferencia } from '@/components/financeiro/ResumoDaConferencia';
import { HistoricoDeReajustes } from '@/components/financeiro/HistoricoDeReajustes';
import { AvisoDeCancelado } from '@/components/financeiro/CancelarChecklist';
import { PedidoDeReajuste } from '@/components/comercial/PedidoDeReajuste';
import { useAuth } from '@/contexts/AuthContext';
import { usePodeGerirCarteiras } from '@/hooks/useAccessProfiles';
import { useQueryState } from '@/hooks/useQueryState';
import { useChecklistDoLancamento, useChecklists, useItensDoChecklist, type ChecklistResumo } from '@/hooks/usePedidosChecklist';
import { formatBRL, formatDateBR } from '@/types/financeiro';
import { cn } from '@/lib/utils';

type Grupo = 'devolvidos' | 'analise' | 'reajustes' | 'negociacao' | 'pagos' | 'finalizados' | 'cancelados';

const GRUPOS: { valor: Grupo; rotulo: string; cor: string; cabe: (c: ChecklistResumo) => boolean }[] = [
  { valor: 'devolvidos', rotulo: 'Devolvidos — corrigir', cor: 'badge-warning', cabe: (c) => c.situacao === 'Recusado' },
  { valor: 'analise', rotulo: 'Em análise', cor: 'badge-info', cabe: (c) => c.situacao === 'Em análise' },
  { valor: 'reajustes', rotulo: 'Reajuste pedido', cor: 'badge-info', cabe: (c) => !!c.reajuste_pendente },
  { valor: 'negociacao', rotulo: 'Em negociação', cor: 'badge-info', cabe: (c) => c.situacao === 'Aprovado' && c.pagamento_status !== 'Pago' },
  { valor: 'pagos', rotulo: 'Pagos', cor: 'badge-success', cabe: (c) => c.situacao === 'Aprovado' && c.pagamento_status === 'Pago' },
  { valor: 'finalizados', rotulo: 'Finalizados', cor: 'badge-success', cabe: (c) => c.situacao === 'Finalizado' },
  { valor: 'cancelados', rotulo: 'Cancelados', cor: 'badge-danger', cabe: (c) => c.situacao === 'Cancelado' },
];
// "Reajuste pedido" cruza as outras (o checklist continua na situação dele): no agrupado, cada um aparece uma vez só.
const GRUPOS_DO_TODOS = GRUPOS.filter((g) => g.valor !== 'reajustes');
const TODAS = '__todas';

export default function ComercialPedidosEnviados() {
  const { user } = useAuth();
  const podeGerirCarteiras = usePodeGerirCarteiras();
  const { data: checklists = [], isLoading } = useChecklists();
  const [aba, setAba] = useQueryState<'todos' | Grupo>('aba', 'todos');
  const [busca, setBusca] = useQueryState<string>('q', '');
  const [vendedora, setVendedora] = useQueryState<string>('vendedora', TODAS);
  const [aberto, setAberto] = useState<ChecklistResumo | null>(null);

  const vendedoras = useMemo(() => [...new Map(checklists.map((c) => [c.vendedor_id, c.vendedor_nome ?? 'Sem nome'])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1])), [checklists]);
  const daVendedora = useMemo(() => checklists.filter((c) => vendedora === TODAS || c.vendedor_id === vendedora), [checklists, vendedora]);
  const buscados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return daVendedora.filter((c) => !t || c.protocolo.toLowerCase().includes(t) || c.cliente_nome.toLowerCase().includes(t)
      || c.cliente_codigo.includes(t));
  }, [daVendedora, busca]);
  const contagem = (g: (typeof GRUPOS)[number]) => daVendedora.filter(g.cabe).length;
  const grupoAtual = GRUPOS.find((g) => g.valor === aba);

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Pedidos enviados" icon={PackageCheck}
        description="Os checklists que você enviou ao Financeiro e em que pé cada um está. Clique para ver o detalhe e, se precisar, pedir reajuste." />
      <div className="px-4 lg:px-8 pb-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <AbasSegmentadas<'todos' | Grupo> rotulo="Filtrar por situação" valor={aba} onValor={setAba}
            opcoes={[{ valor: 'todos', rotulo: `Todos (${daVendedora.length})` },
              ...GRUPOS.map((g) => ({ valor: g.valor, rotulo: `${g.rotulo} (${contagem(g)})` }))]} />
          <Input className="max-w-xs" placeholder="Protocolo ou cliente" value={busca}
            onChange={(e) => setBusca(e.target.value)} aria-label="Buscar pedido" />
          {vendedoras.length > 1 && (
            <Select value={vendedora} onValueChange={setVendedora}>
              <SelectTrigger className="h-9 w-56" aria-label="Vendedora"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todas as vendedoras</SelectItem>
                {vendedoras.map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        {isLoading ? <Skeleton className="h-64 w-full" /> : aba === 'todos' ? (
          buscados.length === 0 ? <Vazio /> : GRUPOS_DO_TODOS.map((g) => {
            const linhas = buscados.filter(g.cabe);
            return linhas.length === 0 ? null : (
              <section key={g.valor} className="space-y-2">
                <h2 className="flex items-center gap-2 text-[16px] font-bold">
                  {g.rotulo}
                  <span className="text-muted-foreground font-semibold text-[14px]">
                    · {linhas.length} · {formatBRL(linhas.reduce((s, c) => s + Number(c.valor_total), 0))}
                  </span>
                </h2>
                <Tabela linhas={linhas} mostrarVendedora={vendedoras.length > 1} onAbrir={setAberto} />
              </section>
            );
          })
        ) : (() => {
          const linhas = grupoAtual ? buscados.filter(grupoAtual.cabe) : [];
          return linhas.length === 0 ? <Vazio /> : <Tabela linhas={linhas} mostrarVendedora={vendedoras.length > 1} onAbrir={setAberto} />;
        })()}
      </div>
      <DetalheDoPedido c={aberto} onClose={() => setAberto(null)}
        podePedirReajuste={!!aberto && (aberto.vendedor_id === user?.id || podeGerirCarteiras)} />
    </div>
  );
}

function Vazio() {
  return (
    <div className="panel p-6">
      <EmptyState icon={PackageCheck} title="Nenhum pedido aqui"
        description="Quando você marca &quot;Fechou pedido&quot; num lançamento e envia o checklist, ele aparece nesta lista." />
    </div>
  );
}

function Situacao({ c }: { c: ChecklistResumo }) {
  const g = GRUPOS_DO_TODOS.find((x) => x.cabe(c));
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge className={cn('text-[12px]', g?.cor)}>{g?.rotulo ?? c.situacao}</Badge>
      {c.reajuste_pendente && <Badge className="text-[12px] badge-info">reajuste pedido</Badge>}
    </span>
  );
}

function Tabela({ linhas, mostrarVendedora, onAbrir }: { linhas: ChecklistResumo[]; mostrarVendedora: boolean; onAbrir: (c: ChecklistResumo) => void }) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full text-[14px]">
        <thead>
          <tr className="bg-muted text-left text-[13px] font-bold text-foreground">
            <th className="px-4 py-3">Protocolo</th>
            <th className="px-4 py-3">Enviado</th>
            <th className="px-4 py-3">Cliente</th>
            {mostrarVendedora && <th className="px-4 py-3">Vendedora</th>}
            <th className="px-4 py-3 text-right">Valor (Venda)</th>
            <th className="px-4 py-3">Situação</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {linhas.map((c) => (
            <tr key={c.id} className="border-t border-border align-middle hover:bg-primary/5 cursor-pointer" onClick={() => onAbrir(c)}>
              <td className="px-4 py-3 font-semibold tabular-nums whitespace-nowrap">{c.protocolo}</td>
              <td className="px-4 py-3 tabular-nums whitespace-nowrap">{formatDateBR(c.enviado_em)}</td>
              <td className="px-4 py-3"><span className="font-semibold">{c.cliente_nome}</span> <span className="text-muted-foreground">· {c.cliente_codigo}</span></td>
              {mostrarVendedora && <td className="px-4 py-3">{c.vendedor_nome ?? '—'}</td>}
              <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatBRL(Number(c.valor_total))}</td>
              <td className="px-4 py-3"><Situacao c={c} /></td>
              <td className="px-4 py-3 text-right">
                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onAbrir(c); }}>Abrir</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetalheDoPedido({ c: linha, onClose, podePedirReajuste }: { c: ChecklistResumo | null; onClose: () => void; podePedirReajuste: boolean }) {
  const { data } = useChecklistDoLancamento(linha?.interacao_id ?? null);
  const { data: itens = [] } = useItensDoChecklist(true);
  // A linha pode estar velha (o reajuste acabou de ser pedido aqui): vale a que acabou de chegar.
  const c = data?.resumo ?? linha;
  if (!c) return null;
  return (
    <Dialog open={!!linha} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">{c.protocolo} <Situacao c={c} /></DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-[14px]">
          <AvisoDeCancelado c={c} />
          {c.situacao === 'Recusado' && (
            <div className="rounded-lg badge-warning p-3 text-[13px]">
              <p className="font-semibold">O Financeiro devolveu: {(c.retorno_motivos ?? []).join(', ')}</p>
              {c.retorno_observacao && <p>{c.retorno_observacao}</p>}
              <p className="pt-1">Corrija no Forteplus e, em Lançamentos, abra o lançamento deste cliente e salve para reenviar.</p>
            </div>
          )}
          <PedidoDeReajuste resumo={c} podePedir={podePedirReajuste} />
          {data ? (
            <>
              <div className="space-y-1">
                <p className="font-semibold">Resumo</p>
                <ResumoDaConferencia c={c} pedidos={data.pedidos} itens={itens} />
              </div>
              <div className="space-y-1">
                <p className="font-semibold">Checklist enviado</p>
                <ChecklistPreenchido c={c} pedidos={data.pedidos} itens={itens} />
              </div>
            </>
          ) : <Skeleton className="h-40 w-full" />}
          {c.historico_recusas.length > 0 && (
            <div className="space-y-1">
              <p className="font-semibold">Devoluções anteriores</p>
              <ul className="text-[13px] space-y-0.5">
                {c.historico_recusas.map((r, i) => (
                  <li key={i}>{r.depois_de_aprovado ? 'Devolvido depois de aprovado' : `Tentativa ${r.tentativa}`} · {formatDateBR(r.em)} · {r.por ?? '—'}: {r.motivos.join(', ')}{r.observacao ? ` — ${r.observacao}` : ''}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
