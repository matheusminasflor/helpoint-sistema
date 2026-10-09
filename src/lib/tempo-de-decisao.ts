// Quanto quem aprova leva para decidir uma compra (dono, 2026-10-09: "ele precisa saber o tempo de demora
// que está tendo para aprovar e saber que isso pode impactar"). Enquanto a compra espera a decisão, o prazo
// de Compras fica parado — então esse tempo não aparece em lugar nenhum, a não ser aqui.
//
// A espera começa quando o pedido nasce ou é reenviado depois de um ajuste, e termina na decisão (aprovar,
// recusar ou pedir ajuste). Tempo corrido, não de expediente. ponytail: as horas úteis do setor estão no
// banco (`minutos_uteis_do_chamado`); se o dono quiser a conta em expediente, a saída é uma RPC.

export interface PedidoParaDecisao { id: string; created_at: string }
export interface DecisaoRegistrada { request_id: string; decisao: string; created_at: string }

const DECIDE = new Set(['aprovada', 'recusada', 'ajuste']);

/** As esperas já decididas (em minutos) e, para quem ainda espera, desde quando. */
export function temposDeDecisao(pedidos: PedidoParaDecisao[], decisoes: DecisaoRegistrada[]) {
  const esperas: number[] = [];
  const esperandoDesde = new Map<string, string>();
  for (const p of pedidos) {
    let inicio: string | null = p.created_at;
    const doPedido = decisoes.filter((d) => d.request_id === p.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const d of doPedido) {
      if (DECIDE.has(d.decisao) && inicio) {
        esperas.push(Math.max(0, (Date.parse(d.created_at) - Date.parse(inicio)) / 60_000));
        inicio = null;
      } else if (d.decisao === 'reenviada') {
        inicio = d.created_at;
      }
    }
    if (inicio) esperandoDesde.set(p.id, inicio);
  }
  const media = esperas.length ? esperas.reduce((s, m) => s + m, 0) / esperas.length : null;
  return { mediaEmMinutos: media, decisoes: esperas.length, esperandoDesde };
}

/** "menos de 1 h", "5 h", "2 dias e 3 h". */
export function formatarEspera(minutos: number): string {
  const horas = Math.floor(minutos / 60);
  if (horas < 1) return 'menos de 1 h';
  if (horas < 24) return `${horas} h`;
  const dias = Math.floor(horas / 24);
  const resto = horas % 24;
  return `${dias} ${dias === 1 ? 'dia' : 'dias'}${resto ? ` e ${resto} h` : ''}`;
}
