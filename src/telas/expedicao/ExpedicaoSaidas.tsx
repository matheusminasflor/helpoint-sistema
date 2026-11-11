// Expedição › Saídas (dono, 2026-11-11; migration 20270212721100): depois que o Financeiro sobe a nota, a Expedição marca
// "Aguardando coleta" e "Entregue à transportadora", e a vendedora é avisada a cada passo. A transportadora já vem do XML.
//
// Leis de UX: Hick — duas ações por pedido, só a próxima aparece em destaque; Von Restorff — o que espera a Expedição
// vem primeiro, em âmbar, e o entregue fica verde; Tesler — a transportadora vem preenchida do XML.
import { useState } from 'react';
import { FileText, Truck } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ROTULO_DA_SAIDA, abrirArquivoDaNota, useMarcarSaida, useSaidas, type SaidaDaExpedicao,
} from '@/hooks/usePedidosChecklist';
import { formatDateBR } from '@/types/financeiro';

export default function ExpedicaoSaidas() {
  const { data: saidas = [], isLoading, isError } = useSaidas();
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Saídas" icon={Truck}
        description="Os pedidos com nota emitida. Marque quando estiver aguardando a coleta e quando entregar à transportadora: a vendedora é avisada." />
      <div className="px-4 lg:px-8 pb-6 space-y-3">
        {isError ? <p className="text-[13px] text-status-danger">Não consegui carregar as saídas.</p>
          : isLoading ? <Skeleton className="h-48 w-full" />
          : saidas.length === 0 ? <EmptyState icon={Truck} title="Nenhum pedido para sair" description="Quando o Financeiro subir a nota de um pedido, ele aparece aqui." />
          : saidas.map((s) => <Saida key={s.checklist_id} saida={s} />)}
      </div>
    </div>
  );
}

function Saida({ saida: s }: { saida: SaidaDaExpedicao }) {
  const marcar = useMarcarSaida();
  const daNota = s.notas.find((n) => n.transportadora)?.transportadora ?? '';
  const [transportadora, setTransportadora] = useState(s.transportadora ?? daNota);
  const [rastreio, setRastreio] = useState(s.rastreio ?? '');
  const entregue = s.situacao === 'com_transportadora';
  return (
    <Card className="p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[14px]"><strong>{s.cliente}</strong> <span className="text-muted-foreground">· {s.protocolo}{s.vendedor ? ` · ${s.vendedor}` : ''}</span></p>
        <Badge variant="outline" className={`text-[12px] ${entregue ? 'badge-success' : 'badge-warning'}`}>
          {s.situacao ? ROTULO_DA_SAIDA[s.situacao] : 'Nota emitida'}
          {s.marcado_em ? ` · ${formatDateBR(s.marcado_em)}${s.marcado_por ? ` · ${s.marcado_por}` : ''}` : ''}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-2 text-[13px]">
        {s.notas.map((n) => (
          <span key={`${n.filial}-${n.numero}`} className="inline-flex items-center gap-1.5">
            Nota <span className="font-mono">{n.numero}</span> · {n.filial} · {n.tipo}
            {n.pdf && (
              <Button size="sm" variant="outline" className="h-7" onClick={() => abrirArquivoDaNota(n.pdf!)}>
                <FileText className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> PDF
              </Button>
            )}
          </span>
        ))}
      </div>
      {entregue ? (
        <p className="text-[13px] text-muted-foreground">Com {s.transportadora}{s.rastreio ? ` · rastreio ${s.rastreio}` : ''}.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Input className="h-8 w-56" placeholder="Transportadora" aria-label={`Transportadora do ${s.protocolo}`}
            value={transportadora} onChange={(e) => setTransportadora(e.target.value)} />
          <Input className="h-8 w-40" placeholder="Rastreio (se tiver)" aria-label={`Rastreio do ${s.protocolo}`}
            value={rastreio} onChange={(e) => setRastreio(e.target.value)} />
          {!s.situacao && (
            <Button size="sm" variant="outline" className="h-8" disabled={marcar.isPending}
              onClick={() => marcar.mutate({ checklistId: s.checklist_id, situacao: 'aguardando_coleta', transportadora, rastreio })}>
              Aguardando coleta
            </Button>
          )}
          <Button size="sm" className="h-8" disabled={marcar.isPending || !transportadora.trim()}
            onClick={() => marcar.mutate({ checklistId: s.checklist_id, situacao: 'com_transportadora', transportadora, rastreio })}>
            Entregue à transportadora
          </Button>
        </div>
      )}
    </Card>
  );
}
