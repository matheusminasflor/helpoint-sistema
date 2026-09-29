// O checklist de pedidos dentro do lançamento (LEVA S, 2026-09-29). O dono: "primeiro o checklist e
// depois os dados que medem os indicadores" — por isso esta seção vem logo depois do cliente.
//
// A vendedora declara, pedido a pedido, que o lançamento no Forteplus está certo. "Não" em qualquer
// item bloqueia o envio: o erro se corrige no Forteplus, antes de chegar ao Financeiro (manual §2).
// Especificação: `docs/manual-checklist-pedidos.md`.
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  FILIAIS, MAXIMO_DE_PEDIDOS, RESPOSTAS, TIPOS_DE_PEDIDO, pedidoVazio,
  type ChecklistEmEdicao, type Filial, type ItemDoChecklist, type PedidoDoChecklist, type Resposta, type TipoDePedido,
} from '@/lib/checklist-de-pedidos';

interface Props {
  valor: ChecklistEmEdicao;
  onChange: (valor: ChecklistEmEdicao) => void;
  itens: ItemDoChecklist[];
  /** Aprovado ou finalizado: só leitura. */
  travado: boolean;
}

const COR_DA_RESPOSTA: Record<Resposta, string> = {
  Sim: 'bg-primary text-primary-foreground border-primary',
  Não: 'bg-destructive text-destructive-foreground border-destructive',
  'Não se aplica': 'bg-muted text-foreground border-border',
};

export function ChecklistDoLancamento({ valor, onChange, itens, travado }: Props) {
  const mudarPedido = (i: number, parte: Partial<PedidoDoChecklist>) =>
    onChange({ ...valor, pedidos: valor.pedidos.map((p, j) => (j === i ? { ...p, ...parte } : p)) });

  const responder = (i: number, itemId: string, r: Resposta) =>
    mudarPedido(i, { respostas: { ...valor.pedidos[i].respostas, [itemId]: r } });

  const justificar = (i: number, itemId: string, texto: string) =>
    mudarPedido(i, { justificativas: { ...valor.pedidos[i].justificativas, [itemId]: texto } });

  return (
    <fieldset disabled={travado} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ck-contato">Contato no cliente</Label>
          <Input id="ck-contato" value={valor.contato} placeholder="Com quem o pedido foi fechado"
            onChange={(e) => onChange({ ...valor, contato: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ck-rota">Rota <span className="font-normal text-muted-foreground">(opcional)</span></Label>
          <Input id="ck-rota" value={valor.rota} placeholder="Ex.: Rota Dona Clara"
            onChange={(e) => onChange({ ...valor, rota: e.target.value })} />
        </div>
      </div>

      {valor.pedidos.map((p, i) => (
        <div key={i} className="rounded-lg border border-border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold">Pedido {i + 1}</p>
            {valor.pedidos.length > 1 && !travado && (
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Tirar o pedido ${i + 1}`}
                onClick={() => onChange({ ...valor, pedidos: valor.pedidos.filter((_, j) => j !== i) })}>
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </Button>
            )}
          </div>
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-5">
            <div className="space-y-1">
              <Label className="text-[11px]">Tipo</Label>
              <Select value={p.tipo} onValueChange={(v) => mudarPedido(i, { tipo: v as TipoDePedido })}>
                <SelectTrigger aria-label={`Tipo do pedido ${i + 1}`}><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS_DE_PEDIDO.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Filial</Label>
              <Select value={p.filial} onValueChange={(v) => mudarPedido(i, { filial: v as Filial })}>
                <SelectTrigger aria-label={`Filial do pedido ${i + 1}`}><SelectValue /></SelectTrigger>
                <SelectContent>{FILIAIS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`ck-num-${i}`} className="text-[11px]">Nº no Forteplus</Label>
              <Input id={`ck-num-${i}`} inputMode="numeric" value={p.numero} onChange={(e) => mudarPedido(i, { numero: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`ck-valor-${i}`} className="text-[11px]">Valor líquido (R$)</Label>
              <Input id={`ck-valor-${i}`} inputMode="decimal" placeholder="0,00" value={p.valor}
                onChange={(e) => mudarPedido(i, { valor: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`ck-desc-${i}`} className="text-[11px]">Desconto (R$)</Label>
              <Input id={`ck-desc-${i}`} inputMode="decimal" placeholder="0,00" value={p.desconto}
                onChange={(e) => mudarPedido(i, { desconto: e.target.value })} />
            </div>
          </div>

          <ul className="divide-y divide-border rounded-md border border-border">
            {itens.map((item) => {
              const r = p.respostas[item.id];
              return (
                <li key={item.id} className={cn('px-3 py-2 space-y-1.5', r === 'Não' && 'bg-destructive/10')}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium">{item.rotulo}</p>
                      {item.ajuda && <p className="text-[11px] text-muted-foreground">{item.ajuda}</p>}
                    </div>
                    <div role="radiogroup" aria-label={`${item.rotulo} — pedido ${i + 1}`} className="flex gap-1">
                      {RESPOSTAS.map((opcao) => (
                        <button key={opcao} type="button" role="radio" aria-checked={r === opcao}
                          onClick={() => responder(i, item.id, opcao)}
                          className={cn('rounded-md border px-2 py-1 text-[11px] font-medium',
                            r === opcao ? COR_DA_RESPOSTA[opcao] : 'border-border text-muted-foreground hover:bg-muted/60')}>
                          {opcao}
                        </button>
                      ))}
                    </div>
                  </div>
                  {item.pede_justificativa && r === 'Sim' && (
                    <Input aria-label={`Justificativa: ${item.rotulo} — pedido ${i + 1}`} placeholder="Qual pedido anterior concedeu"
                      value={p.justificativas[item.id] ?? ''} onChange={(e) => justificar(i, item.id, e.target.value)} />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {!travado && valor.pedidos.length < MAXIMO_DE_PEDIDOS && (
        <Button type="button" variant="outline" size="sm"
          onClick={() => onChange({ ...valor, pedidos: [...valor.pedidos, pedidoVazio()] })}>
          <Plus className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Outro pedido do mesmo cliente
        </Button>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="ck-obs">Recado ao Financeiro <span className="font-normal text-muted-foreground">(opcional)</span></Label>
        <Textarea id="ck-obs" rows={2} value={valor.observacao} onChange={(e) => onChange({ ...valor, observacao: e.target.value })} />
      </div>
    </fieldset>
  );
}
