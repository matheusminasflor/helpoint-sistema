// A nota de cada pedido (dono, 2026-10-16; migration 20270127070000). O checklist aprovado não muda mais, e a nota só
// existe depois do faturamento: aqui a vendedora (ou o Financeiro) informa o Nº da nota de cada pedido, e a conferência
// diz se a nota que chegou do Forteplus está na série e no tipo certos. O Financeiro não finaliza com pedido sem nota
// ou com a nota errada ("trava o pedido até corrigir").
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { lerValor } from '@/lib/checklist-de-pedidos';
import { todayISO } from '@/lib/dates';
import {
  useInformarNota, useSituacaoDasNotas, type PedidoGravado, type SituacaoDaNota,
} from '@/hooks/usePedidosChecklist';

const SELO: Record<SituacaoDaNota, { rotulo: string; classe: string }> = {
  sem_nota: { rotulo: 'Falta a nota', classe: 'badge-warning' },
  aguardando_importacao: { rotulo: 'A confirmar', classe: 'badge-warning' },
  divergente: { rotulo: 'Série ou tipo errado', classe: 'badge-danger' },
  ok: { rotulo: 'Confirmada', classe: 'badge-success' },
};

export function NotasDosPedidos({ checklistId, pedidos, podeEditar }: {
  checklistId: string; pedidos: PedidoGravado[]; podeEditar: boolean;
}) {
  const { data: situacoes = [] } = useSituacaoDasNotas(checklistId);
  const informar = useInformarNota();
  const [digitado, setDigitado] = useState<Record<string, string>>({});
  const [valores, setValores] = useState<Record<string, string>>({});
  const [datas, setDatas] = useState<Record<string, string>>({});
  const comSerie = pedidos.filter((p) => p.serie);
  if (comSerie.length === 0) return null;

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <p className="text-[14px] font-semibold">Notas dos pedidos</p>
      <p className="text-[12px] text-muted-foreground">
        Depois de faturar, informe o número, o valor faturado e a data de emissão da nota de cada pedido. Quando a nota chega na importação do Forteplus, o
        sistema confere a série e o tipo. Sem a nota, ou com a nota errada, o Financeiro não finaliza.
      </p>
      <ul className="divide-y divide-border">
        {comSerie.map((p) => {
          const s = situacoes.find((x) => x.pedido_id === p.id);
          const valor = digitado[p.id] ?? p.nota_fiscal ?? '';
          const venda = p.tipo === 'Venda';
          const valorNota = valores[p.id] ?? (p.nota_valor ? String(p.nota_valor).replace('.', ',') : '');
          const valorNumero = lerValor(valorNota);
          const emissao = datas[p.id] ?? p.nota_em ?? '';
          const incompleto = !!valor.trim() && venda && (!valorNumero || !emissao || emissao > todayISO());
          const igual = valor.trim() === (p.nota_fiscal ?? '') && (valorNumero ?? 0) === Number(p.nota_valor ?? 0) && emissao === (p.nota_em ?? '');
          return (
            <li key={p.id} className="py-2 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="font-medium">Pedido {p.ordem}</span>
                <span className="text-muted-foreground">{p.tipo} · série {p.serie} · {p.filial} · nº {p.numero}</span>
                {s && <Badge variant="outline" className={`text-[12px] ${SELO[s.situacao].classe}`}>{SELO[s.situacao].rotulo}</Badge>}
              </div>
              {podeEditar ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input className="h-8 w-36 font-mono" inputMode="numeric" placeholder="Nº da nota" aria-label={`Nº da nota do pedido ${p.ordem}`}
                    value={valor} onChange={(e) => setDigitado({ ...digitado, [p.id]: e.target.value })} />
                  {venda && (
                    <>
                      <Input className="h-8 w-32 font-mono" inputMode="decimal" placeholder="Valor faturado" aria-label={`Valor faturado do pedido ${p.ordem}`}
                        value={valorNota} onChange={(e) => setValores({ ...valores, [p.id]: e.target.value })} />
                      <Input className="h-8 w-40" type="date" max={todayISO()} aria-label={`Data de emissão do pedido ${p.ordem}`}
                        value={emissao} onChange={(e) => setDatas({ ...datas, [p.id]: e.target.value })} />
                    </>
                  )}
                  <Button size="sm" variant="outline" className="h-8"
                    disabled={informar.isPending || igual || incompleto}
                    onClick={() => informar.mutate({ pedidoId: p.id, nota: valor, valor: venda ? valorNumero : null, emissao: venda ? emissao : null })}>
                    Salvar nota
                  </Button>
                </div>
              ) : (
                <p className="text-[13px]">Nota: <span className="font-mono">{p.nota_fiscal ?? '—'}</span></p>
              )}
              {s && s.situacao !== 'ok' && s.situacao !== 'sem_nota' && (
                <p className={`text-[12px] ${s.situacao === 'divergente' ? 'text-status-danger' : 'text-muted-foreground'}`}>{s.mensagem}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
