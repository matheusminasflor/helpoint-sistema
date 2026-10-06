// Os lançamentos de UMA vendedora no mês, para o gestor (revisão do sistema, 2026-10-01).
//
// O dono: "quero ver a carteira da Júlia, o andamento dela, os lançamentos dela" — na planilha cada
// vendedora tem a aba dela, e o gestor passeia entre as abas. Aqui é o mesmo, dentro de
// Comercial › Indicadores, quando o gestor escolhe uma vendedora. O banco já deixava o gestor ler
// (`com_interacoes_select`: dono da linha, quem gere carteiras ou Diretoria); faltava a tela.
//
// CORRIGIR E APAGAR SÃO DAQUI (2026-10-02): depois de salvo, o lançamento não muda para a vendedora
// — "lançou, não pode editar os indicadores e farol mais". O erro de verdade quem corrige ou apaga é
// quem tem a caixinha no perfil ("Lançamentos › Corrigir / Apagar") ou o administrador; a correção
// fica em `audit_logs`.
import { useMemo, useState } from 'react';
import { AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { LancamentoDialog } from '@/components/comercial/LancamentoDialog';
import { usePodeNoLancamento } from '@/hooks/useAccessProfiles';
import {
  STATUS_INTERACAO, useApagarInteracao, useIndicadoresCatalogo, useInteracoes, useInteracoesDoPeriodo, type Interacao,
} from '@/hooks/useComercialLancamentos';
import { todayISO } from '@/lib/dates';
import type { IntervaloDeDias } from '@/lib/period';
import { formatBRL, formatDateBR } from '@/types/financeiro';

export function LancamentosDaVendedora({ vendedorId, nome, competencia, intervalo }: {
  vendedorId: string;
  nome: string;
  competencia: string;
  /** Um período (2026-10-03) no lugar do mês: os lançamentos dos dias exatos dele. */
  intervalo?: IntervaloDeDias | null;
}) {
  const doMes = useInteracoes(competencia, vendedorId, !intervalo);
  const doPeriodo = useInteracoesDoPeriodo(intervalo ?? null, vendedorId);
  const lancamentos = (intervalo ? doPeriodo.data?.linhas : doMes.data) ?? [];
  const isLoading = intervalo ? doPeriodo.isLoading : doMes.isLoading;
  const cortou = !!intervalo && !!doPeriodo.data?.cortou;
  const noRecorte = intervalo ? 'no período' : 'no mês';
  const { data: catalogo = [] } = useIndicadoresCatalogo();
  const nomePorId = useMemo(() => new Map(catalogo.map((c) => [c.id, c])), [catalogo]);
  const hoje = todayISO();
  const vendido = lancamentos
    .filter((l) => l.status === 'concluido' && (l.valor_venda ?? 0) > 0)
    .reduce((s, l) => s + (l.valor_venda ?? 0), 0);
  const vencidos = lancamentos.filter((l) => !!l.prazo && l.prazo < hoje && l.status !== 'concluido').length;
  const { corrigir: podeCorrigir, apagar: podeApagar } = usePodeNoLancamento();
  const apagar = useApagarInteracao();
  const [corrigindo, setCorrigindo] = useState<Interacao | null>(null);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Lançamentos de {nome} {noRecorte}</h2>
        <span className="text-[13px] text-muted-foreground">
          {lancamentos.length} lançamentos · vendido {formatBRL(vendido)}
          {vencidos > 0 && <span className="text-destructive font-semibold"> · {vencidos} prazo(s) vencido(s)</span>}
        </span>
      </div>
      {/* Lista cortada pelo teto: as contas acima são só dos mostrados — o total certo é o dos indicadores. */}
      {cortou && (
        <p className="text-[13px] text-status-warning">
          O período tem mais lançamentos do que cabem aqui: aparecem os {lancamentos.length} mais recentes, e a
          contagem e o vendido acima são só deles. O total do período está nos indicadores, acima.
        </p>
      )}
      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : lancamentos.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Nenhum lançamento {intervalo ? 'neste período' : 'neste mês'}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-2 font-medium">Data</th>
                <th className="py-1 pr-2 font-medium">Cliente</th>
                <th className="py-1 pr-2 font-medium">Status</th>
                <th className="py-1 pr-2 font-medium">Marcado</th>
                <th className="py-1 pr-2 font-medium text-right">Venda</th>
                <th className="py-1 font-medium">Prazo</th>
                {(podeCorrigir || podeApagar) && <th className="py-1"><span className="sr-only">Corrigir</span></th>}
              </tr>
            </thead>
            <tbody>
              {lancamentos.map((l) => {
                const vencido = !!l.prazo && l.prazo < hoje && l.status !== 'concluido';
                const somou = l.status === 'concluido' && (l.valor_venda ?? 0) > 0;
                return (
                  <tr key={l.id} className="border-t border-border align-top">
                    <td className="py-1.5 pr-2 font-mono whitespace-nowrap">{formatDateBR(l.data)}</td>
                    <td className="py-1.5 pr-2">
                      {l.cliente ? (
                        <>
                          <span className="font-medium">{l.cliente.razao_social}</span>
                          {l.fora_da_carteira && <Badge className="ml-1.5 text-[12px] badge-warning">fora da carteira</Badge>}
                          {l.observacoes && <p className="text-muted-foreground line-clamp-2">{l.observacoes}</p>}
                        </>
                      ) : (
                        <span className="text-muted-foreground">Ação interna{l.observacoes ? ` — ${l.observacoes}` : ''}</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{STATUS_INTERACAO.find((s) => s.valor === l.status)?.rotulo}</td>
                    <td className="py-1.5 pr-2">
                      <div className="flex flex-wrap gap-1 max-w-[260px]">
                        {l.marcas.map((m) => {
                          const ind = nomePorId.get(m);
                          return ind ? (
                            <Badge key={m} variant={ind.tipo === 'acao' ? 'outline' : 'secondary'} className="text-[12px] font-normal">
                              {ind.nome}
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono whitespace-nowrap">
                      {l.valor_venda ? (
                        <span className={somou ? '' : 'text-muted-foreground line-through'}
                          title={somou ? undefined : 'Não soma: a venda só soma quando está Concluída.'}>
                          {formatBRL(l.valor_venda)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className={`py-1.5 whitespace-nowrap ${vencido ? 'text-destructive font-semibold' : ''}`}>
                      {l.prazo ? (
                        <span className="inline-flex items-center gap-1">
                          {vencido && <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />}
                          {formatDateBR(l.prazo)}
                        </span>
                      ) : '—'}
                    </td>
                    {(podeCorrigir || podeApagar) && (
                      <td className="py-1.5 whitespace-nowrap text-right">
                        {podeCorrigir && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Corrigir lançamento"
                            onClick={() => setCorrigindo(l)}>
                            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                          </Button>
                        )}
                        {/* Com checklist o banco recusa (a conferência do Financeiro iria junto). */}
                        {podeApagar && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Apagar lançamento"
                            disabled={apagar.isPending} onClick={() => apagar.mutate(l.id)}>
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {podeCorrigir && (
        <LancamentoDialog open={!!corrigindo} onOpenChange={(aberto) => { if (!aberto) setCorrigindo(null); }}
          minhasCarteiras={[]} catalogo={catalogo} editando={corrigindo} />
      )}
    </Card>
  );
}
