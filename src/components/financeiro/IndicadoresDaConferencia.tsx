// Os indicadores da conferência de pedidos (LEVA S, parte 5) — o painel 18.4 do dono: registrado,
// conciliado, pendente, divergente, recebido e o % de conciliação, com o faturamento fiscal ao lado
// (18.5: "distinguir vendas registradas, faturamento fiscal e valores efetivamente recebidos").
//
// Tudo vem pronto de `ped_indicadores`; a tela só mostra. `resumido` é a versão da Diretoria:
// só os totais, sem a lista por cliente.
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useIndicadoresDaConferencia, type QtdEValor } from '@/hooks/usePedidosChecklist';
import { todayISO } from '@/lib/dates';
import { formatBRL } from '@/types/financeiro';

function Numero({ titulo, dado, ajuda }: { titulo: string; dado: QtdEValor; ajuda: string }) {
  return (
    <Card className="p-3" title={ajuda}>
      <p className="text-[11px] text-muted-foreground">{titulo}</p>
      <p className="text-[15px] font-semibold font-mono">{formatBRL(Number(dado.valor))}</p>
      <p className="text-[11px] text-muted-foreground">{dado.qtd} {dado.qtd === 1 ? 'checklist' : 'checklists'}</p>
    </Card>
  );
}

export function IndicadoresDaConferencia({ resumido = false }: { resumido?: boolean }) {
  const hoje = todayISO();
  const [de, setDe] = useState(`${hoje.slice(0, 7)}-01`);
  const [ate, setAte] = useState(hoje);
  const { data, isLoading, isError } = useIndicadoresDaConferencia(de, ate);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="ind-de" className="text-[11px]">De</Label>
          <Input id="ind-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ind-ate" className="text-[11px]">Até</Label>
          <Input id="ind-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="w-40" />
        </div>
        <p className="text-[11px] text-muted-foreground max-w-md">
          Checklists enviados no período. Valor = pedidos tipo Venda. O faturado é a nota fiscal do Forteplus desses
          clientes no período — a nota não traz o número do pedido, então o cruzamento é por cliente.
        </p>
      </div>

      {isError ? (
        <p className="text-[12px] badge-danger rounded-md px-3 py-2">Não foi possível carregar os indicadores.</p>
      ) : isLoading || !data ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Numero titulo="Vendas registradas (Comercial)" dado={data.registrado} ajuda="Todo checklist enviado no período." />
            <Numero titulo="Vendas conciliadas" dado={data.conciliado} ajuda="O Financeiro conferiu e aprovou." />
            <Numero titulo="Recebimentos confirmados" dado={data.recebido} ajuda="Pagamento registrado como Pago." />
            <Card className="p-3">
              <p className="text-[11px] text-muted-foreground">Conciliação no período</p>
              <p className="text-[15px] font-semibold font-mono">
                {data.percentual_conciliacao === null ? '—' : `${String(data.percentual_conciliacao).replace('.', ',')}%`}
              </p>
              <p className="text-[11px] text-muted-foreground">valor conciliado ÷ registrado</p>
            </Card>
            <Numero titulo="Pendências" dado={data.pendente} ajuda="Em análise ou recusado, ainda sem aprovação." />
            <Numero titulo="Divergências" dado={data.divergente} ajuda="Checklists que o Financeiro recusou ao menos uma vez." />
            <Card className="p-3">
              <p className="text-[11px] text-muted-foreground">Faturamento fiscal (Forteplus)</p>
              <p className="text-[15px] font-semibold font-mono">{formatBRL(Number(data.faturado))}</p>
              <p className="text-[11px] text-muted-foreground">notas dos mesmos clientes</p>
            </Card>
          </div>

          {!resumido && (
            <div className="grid gap-3 lg:grid-cols-3">
              <Card className="p-3 space-y-2">
                <p className="text-[13px] font-semibold">Motivos de recusa</p>
                {data.motivos.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">Nenhuma recusa no período.</p>
                ) : (
                  <ul className="text-[12px] space-y-0.5">
                    {data.motivos.map((m) => (
                      <li key={m.motivo} className="flex justify-between gap-2"><span>{m.motivo}</span><span className="font-mono">{m.vezes}</span></li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card className="p-3 lg:col-span-2 overflow-x-auto">
                <p className="text-[13px] font-semibold pb-2">Por cliente</p>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1 pr-2 font-semibold">Cliente</th>
                      <th className="py-1 px-2 font-semibold text-right">Registrado</th>
                      <th className="py-1 px-2 font-semibold text-right">Conciliado</th>
                      <th className="py-1 px-2 font-semibold text-right">Recebido</th>
                      <th className="py-1 pl-2 font-semibold text-right">Faturado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.por_cliente.map((c) => (
                      <tr key={c.codigo} className="border-t border-border">
                        <td className="py-1 pr-2">{c.nome} <span className="text-muted-foreground">· {c.codigo}</span></td>
                        <td className="py-1 px-2 text-right font-mono">{formatBRL(Number(c.registrado))}</td>
                        <td className="py-1 px-2 text-right font-mono">{formatBRL(Number(c.conciliado))}</td>
                        <td className="py-1 px-2 text-right font-mono">{formatBRL(Number(c.recebido))}</td>
                        <td className="py-1 pl-2 text-right font-mono">{formatBRL(Number(c.faturado))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
