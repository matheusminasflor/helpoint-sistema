// O PDF do checklist de pedidos (LEVA S) — o que o sistema antigo gerava pelas regras de impressão
// do CSS (manual §5, `estilo.css`): cabeçalho, pedidos com as respostas, recusas e pagamento.
// `jspdf` já é dependência do projeto; o arquivo é gerado no navegador e baixado.
import { jsPDF } from 'jspdf';
import type { ChecklistResumo, PedidoGravado } from '@/hooks/usePedidosChecklist';
import { formatBRL, formatDateBR } from '@/types/financeiro';

export function imprimirChecklist(c: ChecklistResumo, pedidos: PedidoGravado[], rotuloDoItem: Map<string, string>) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margem = 14;
  const largura = 210 - margem * 2;
  let y = margem;

  const linha = (texto: string, tamanho = 10, negrito = false) => {
    doc.setFont('helvetica', negrito ? 'bold' : 'normal');
    doc.setFontSize(tamanho);
    for (const parte of doc.splitTextToSize(texto, largura) as string[]) {
      if (y > 283) { doc.addPage(); y = margem; }
      doc.text(parte, margem, y);
      y += tamanho * 0.45;
    }
  };

  linha(`Checklist de pedido ${c.protocolo}`, 15, true);
  linha(`Situação: ${c.situacao}${c.pagamento_status ? ` · Pagamento: ${c.pagamento_status}` : ''}`, 10);
  y += 2;
  linha(`Cliente: ${c.cliente_nome} (${c.cliente_codigo}) · Tabela: ${c.tabela_preco ?? '—'}`);
  linha(`Vendedora: ${c.vendedor_nome ?? '—'} · Contato: ${c.contato}${c.rota ? ` · Rota: ${c.rota}` : ''}`);
  linha(`Enviado em ${formatDateBR(c.enviado_em)}${c.versao > 1 ? ` (tentativa ${c.versao})` : ''} · Valor (Venda): ${formatBRL(Number(c.valor_total))}`);
  if (c.observacao) linha(`Recado ao Financeiro: ${c.observacao}`);

  for (const p of pedidos) {
    y += 3;
    linha(`Pedido ${p.ordem}: ${p.tipo} · ${p.filial} · nº ${p.numero} · ${formatBRL(Number(p.valor))}`
      + (Number(p.desconto) > 0 ? ` (desconto ${formatBRL(Number(p.desconto))})` : ''), 11, true);
    if (p.importado_em) {
      linha(`Espelho: total ${formatBRL(Number(p.espelho_total ?? 0))} · ST ${formatBRL(Number(p.espelho_st ?? 0))}`
        + (p.qtd_coloracao != null ? ` · ${p.qtd_coloracao} coloração · ${p.qtd_tonalizante ?? 0} tonalizante` : ''), 9);
    }
    for (const r of p.ped_respostas) {
      linha(`${rotuloDoItem.get(r.item_id) ?? 'Item'}: ${r.resposta}${r.justificativa ? ` — ${r.justificativa}` : ''}`, 9);
    }
  }

  if (c.historico_recusas.length > 0) {
    y += 3;
    linha('Recusas', 11, true);
    for (const r of c.historico_recusas) {
      linha(`Tentativa ${r.tentativa} · ${formatDateBR(r.em)} · ${r.por ?? '—'}: ${r.motivos.join(', ')}${r.observacao ? ` — ${r.observacao}` : ''}`, 9);
    }
  }
  if (c.historico_pagamentos.length > 0) {
    y += 3;
    linha('Pagamento', 11, true);
    for (const m of c.historico_pagamentos) {
      linha(`${formatDateBR(m.em)} · ${m.por ?? '—'}: ${m.status}${m.data ? ` em ${formatDateBR(m.data)}` : ''}${m.observacao ? ` — ${m.observacao}` : ''}`, 9);
    }
  }

  doc.save(`${c.protocolo}.pdf`);
}
