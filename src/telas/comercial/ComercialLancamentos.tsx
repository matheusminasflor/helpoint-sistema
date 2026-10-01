// Comercial › Lançamentos — a aba da vendedora na planilha de Gestão Comercial (manual §3),
// dentro do sistema.
//
// POR QUE É MANUAL. O dono decidiu em 2026-09-28, recusando a proposta de puxar da nota
// fiscal: o lançamento é o GANCHO. Para lançar, o cliente precisa estar na carteira dela — e é
// isso que faz a carteira e o cadastro se montarem com o uso, em vez de ficarem vazios como
// estavam (zero linhas em `com_carteira_membros` no dia em que esta tela nasceu).
//
// A tela mostra SÓ os lançamentos de quem está logada, mesmo para o gestor: esta é a aba de
// trabalho de cada um. O gestor lê a equipe em Comercial › Indicadores.
import { useMemo, useState } from 'react';
import { AlertTriangle, ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { SeletorCompetencia } from '@/components/comercial/SeletorCompetencia';
import { LancamentoDialog } from '@/components/comercial/LancamentoDialog';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryState } from '@/hooks/useQueryState';
import {
  STATUS_INTERACAO, useApagarInteracao, useIndicadoresCatalogo, useInteracoes, useMinhasCarteiras,
  type Interacao,
} from '@/hooks/useComercialLancamentos';
import { useChecklists } from '@/hooks/usePedidosChecklist';
import { competenciaAtual, lerCompetencia } from '@/lib/competencia-comercial';
import { todayISO } from '@/lib/dates';
import { formatBRL, formatDateBR } from '@/types/financeiro';

export default function ComercialLancamentos() {
  const { user } = useAuth();
  const [competenciaNaUrl, setCompetencia] = useQueryState('competencia', competenciaAtual());
  // Link editado à mão (`?competencia=abc`) não pode chegar ao banco como data: vira o mês atual.
  const competencia = lerCompetencia(competenciaNaUrl) ?? competenciaAtual();
  const { data: minhasCarteiras = [], isLoading: carregandoCarteira } = useMinhasCarteiras();
  const { data: catalogo = [] } = useIndicadoresCatalogo();
  const { data: lancamentos = [], isLoading } = useInteracoes(competencia, user?.id);
  const apagar = useApagarInteracao();
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<Interacao | null>(null);

  const nomePorId = useMemo(() => new Map(catalogo.map((c) => [c.id, c])), [catalogo]);
  // O checklist de pedidos de cada lançamento (LEVA S): a vendedora vê aqui o que o Financeiro fez.
  const { data: checklists = [] } = useChecklists();
  const checklistPorLancamento = useMemo(() => new Map(checklists.map((c) => [c.interacao_id, c])), [checklists]);
  const hoje = todayISO();

  // O manual (§3.1): "prazos vencidos e não concluídos recebem alerta visual".
  const vencidos = lancamentos.filter((l) => l.prazo && l.prazo < hoje && l.status !== 'concluido').length;
  // "Vendas só somam com Concluído" — o que ela vê aqui é exatamente o que o painel soma.
  const vendido = lancamentos
    .filter((l) => l.status === 'concluido' && (l.valor_venda ?? 0) > 0 && l.cliente_codigo)
    .reduce((s, l) => s + (l.valor_venda ?? 0), 0);

  const abrirNovo = () => { setEditando(null); setAberto(true); };
  const abrirEdicao = (l: Interacao) => { setEditando(l); setAberto(true); };

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Lançamentos"
        description="Uma linha por interação com o cliente: o que aconteceu, a venda, o próximo prazo. É daqui que saem todos os indicadores."
        icon={ClipboardList}
      />

      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SeletorCompetencia competencia={competencia} onChange={setCompetencia} />
          <Button onClick={abrirNovo}>
            <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" /> Novo lançamento
          </Button>
        </div>

        {!carregandoCarteira && minhasCarteiras.length === 0 && (
          <Card className="p-3 badge-warning text-[13px]">
            <strong>Você ainda não está em nenhuma carteira.</strong> Seus indicadores só aparecem no painel quando o
            gestor colocar você numa carteira (Comercial › Configurações › Carteiras). Até lá, dá para registrar ações
            internas e atender cliente de outra carteira.
          </Card>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-3">
            <p className="text-[11px] text-muted-foreground">{minhasCarteiras.length > 1 ? 'Carteiras' : 'Carteira'}</p>
            <p className="text-[15px] font-semibold">{minhasCarteiras.join(', ') || '—'}</p>
          </Card>
          <Card className="p-3">
            <p className="text-[11px] text-muted-foreground">Vendido no mês (concluído)</p>
            <p className="text-[15px] font-semibold font-mono">{formatBRL(vendido)}</p>
          </Card>
          <Card className={`p-3 ${vencidos > 0 ? 'badge-danger' : ''}`}>
            <p className="text-[11px] opacity-80">Prazos vencidos em aberto</p>
            <p className="text-[15px] font-semibold">{vencidos}</p>
          </Card>
        </div>

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : lancamentos.length === 0 ? (
          <Card className="p-6">
            <EmptyState
              icon={ClipboardList}
              title="Nenhum lançamento neste mês"
              description="Registre cada contato, venda ou ação no dia em que aconteceu — a data define em que mês e semana ela conta."
            />
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-secondary/60 text-left text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Data</th>
                  <th className="px-3 py-2 font-semibold">Cliente</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Marcado</th>
                  <th className="px-3 py-2 font-semibold text-right">Venda</th>
                  <th className="px-3 py-2 font-semibold">Prazo</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {lancamentos.map((l) => {
                  const vencido = !!l.prazo && l.prazo < hoje && l.status !== 'concluido';
                  const somou = l.status === 'concluido' && (l.valor_venda ?? 0) > 0;
                  const ck = checklistPorLancamento.get(l.id);
                  return (
                    <tr key={l.id} className="border-t border-border align-top">
                      <td className="px-3 py-2 font-mono whitespace-nowrap">{formatDateBR(l.data)}</td>
                      <td className="px-3 py-2">
                        {l.cliente ? (
                          <>
                            <span className="font-medium">{l.cliente.razao_social}</span>
                            {l.fora_da_carteira && <Badge className="ml-1.5 text-[9px] badge-warning">fora da carteira</Badge>}
                            {ck && (
                              <Badge className={`ml-1.5 text-[9px] ${ck.situacao === 'Recusado' ? 'badge-danger' : 'badge-info'}`}
                                title={ck.situacao === 'Recusado' ? `Devolvido: ${(ck.retorno_motivos ?? []).join(', ')}` : undefined}>
                                {ck.protocolo} · {ck.situacao}{ck.pagamento_status ? ` · ${ck.pagamento_status}` : ''}
                              </Badge>
                            )}
                            {l.observacoes && <p className="text-muted-foreground line-clamp-2">{l.observacoes}</p>}
                          </>
                        ) : (
                          <span className="text-muted-foreground">Ação interna{l.observacoes ? ` — ${l.observacoes}` : ''}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{STATUS_INTERACAO.find((s) => s.valor === l.status)?.rotulo}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1 max-w-[280px]">
                          {l.marcas.map((m) => {
                            const ind = nomePorId.get(m);
                            return ind ? (
                              <Badge key={m} variant={ind.tipo === 'acao' ? 'outline' : 'secondary'} className="text-[10px] font-normal">
                                {ind.nome}
                              </Badge>
                            ) : null;
                          })}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                        {l.valor_venda ? (
                          <span className={somou ? '' : 'text-muted-foreground line-through'} title={somou ? undefined : 'Não soma: a venda só soma quando está Concluída.'}>
                            {formatBRL(l.valor_venda)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className={`px-3 py-2 whitespace-nowrap ${vencido ? 'text-destructive font-semibold' : ''}`}>
                        {l.prazo ? (
                          <span className="inline-flex items-center gap-1">
                            {vencido && <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />}
                            {formatDateBR(l.prazo)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Editar lançamento" onClick={() => abrirEdicao(l)}>
                          <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                        </Button>
                        {/* Lançamento com checklist não se apaga: o histórico da conferência iria junto. */}
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Apagar lançamento"
                          title={ck ? 'Tem checklist de pedido: não pode ser apagado.' : undefined}
                          disabled={apagar.isPending || !!ck} onClick={() => apagar.mutate(l.id)}>
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <LancamentoDialog
        open={aberto}
        onOpenChange={setAberto}
        minhasCarteiras={minhasCarteiras}
        catalogo={catalogo}
        editando={editando}
      />
    </div>
  );
}
