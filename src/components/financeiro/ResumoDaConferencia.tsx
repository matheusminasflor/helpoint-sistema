// O resumo que o Financeiro lê para conferir (LEVA S, 2026-09-30) — o do sistema antigo, que o dono
// mandou em imagem: uma tabela de três colunas (rótulo · dado · destaque) com o cliente, quem enviou,
// UMA LINHA POR PEDIDO (tipo e filial · número · valor), o desconto, a colorimetria, a tabela, o
// contato e o valor total com o ST ao lado. Em vermelho o que o Financeiro precisa bater com o
// Forteplus: rota, desconto, tabela e ST (é o `vermelho` do `historico.html` antigo).
//
// Depois do resumo, o checklist que o Comercial preencheu, pedido a pedido.
import { cn } from '@/lib/utils';
import { situacaoDoSt, type ItemDoChecklist } from '@/lib/checklist-de-pedidos';
import type { ChecklistResumo, PedidoGravado } from '@/hooks/usePedidosChecklist';
import { formatBRL } from '@/types/financeiro';

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

interface Props {
  c: ChecklistResumo;
  pedidos: PedidoGravado[];
  itens: (ItemDoChecklist & { ativo: boolean })[];
}

export function ResumoDaConferencia({ c, pedidos, itens }: Props) {
  const itemSt = itens.find((i) => i.regra === 'st');
  const st = situacaoDoSt(pedidos.map((p) => p.ped_respostas.find((r) => r.item_id === itemSt?.id)?.resposta));
  const desconto = pedidos.reduce((s, p) => s + Number(p.desconto || 0), 0);
  const coloracao = pedidos.reduce((s, p) => s + (p.qtd_coloracao ?? 0), 0);
  const tonalizante = pedidos.reduce((s, p) => s + (p.qtd_tonalizante ?? 0), 0);

  const linhas: [string, React.ReactNode, React.ReactNode][] = [
    ['Cliente:', `${c.cliente_nome} - ${c.cliente_codigo}`, c.rota ? <span className="text-destructive">{c.rota}</span> : null],
    ['Enviado em:', `${dataHora(c.enviado_em)} por ${c.criado_por_nome ?? c.vendedor_nome ?? '—'}${c.versao > 1 ? ` (tentativa ${c.versao})` : ''}`,
      <span className="text-primary font-semibold">{c.vendedor_nome}</span>],
    ...pedidos.map((p): [string, React.ReactNode, React.ReactNode] => [`${p.tipo} ${p.filial}`, p.numero, formatBRL(Number(p.valor))]),
  ];
  if (desconto > 0) linhas.push(['Desconto', <span className="text-destructive font-semibold">{formatBRL(desconto)}</span>, null]);
  if (coloracao > 0) linhas.push(['Coloração', `${coloracao} un`, null]);
  if (tonalizante > 0) linhas.push(['Tonalizante', `${tonalizante} un`, null]);
  linhas.push(['Tabela', <span className="text-destructive font-semibold">{c.tabela_preco ?? '—'}</span>, null]);
  linhas.push(['Contato', c.contato, null]);
  linhas.push(['Valor Total:', formatBRL(Number(c.valor_total)),
    <span className={cn('font-semibold', st === 'ST atualizado' ? 'text-primary' : 'text-destructive')}>{st}</span>]);

  return (
    <table className="w-full text-[14px] border border-border">
      <tbody>
        {linhas.map(([rotulo, dado, destaque], i) => (
          <tr key={i} className="border-t border-border first:border-t-0">
            <td className="w-[30%] px-3 py-1.5 font-semibold bg-muted/50 align-top">{rotulo}</td>
            <td className="px-3 py-1.5 align-top">{dado}</td>
            <td className="w-[22%] px-3 py-1.5 align-top text-right whitespace-nowrap">{destaque}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const COR: Record<string, string> = { Sim: 'text-primary', Não: 'text-destructive', 'Não se aplica': 'text-muted-foreground' };

/** O checklist que o Comercial preencheu, um bloco por pedido, na ordem dos itens. */
export function ChecklistPreenchido({ c, pedidos, itens }: Props) {
  const rotulo = new Map(itens.map((i) => [i.id, i.rotulo]));
  return (
    <div className="space-y-3">
      {pedidos.map((p) => (
        <div key={p.id} className="rounded-lg border border-border p-3">
          <p className="text-[14px] font-semibold pb-1">
            {p.tipo} {p.filial} — {p.numero}
            {p.importado_em && (
              <span className="font-normal text-muted-foreground">
                {' '}· espelho: {formatBRL(Number(p.espelho_total ?? 0))}, ST {formatBRL(Number(p.espelho_st ?? 0))}
              </span>
            )}
          </p>
          <ul className="text-[13px] divide-y divide-border/60">
            {p.ped_respostas.map((r) => (
              <li key={r.item_id} className="flex justify-between gap-3 py-0.5">
                <span>
                  {rotulo.get(r.item_id) ?? 'Item'}
                  {r.justificativa && <span className="text-muted-foreground"> — {r.justificativa}</span>}
                </span>
                <strong className={cn('whitespace-nowrap', COR[r.resposta])}>{r.resposta}</strong>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {c.observacao && (
        <p className="text-[13px] border-t border-border pt-2">Observação do Comercial: {c.observacao}</p>
      )}
    </div>
  );
}
