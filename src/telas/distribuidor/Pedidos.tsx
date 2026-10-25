// Pedir à Minasflor (etapa 6; decisões do dono de 2026-10-21): o pedido é feito no catálogo do Conecta Venda, já na
// tabela de preço dele, escolhendo MF ou INBRAS a cada pedido; ele segue sozinho para o Forteplus. Aqui ficam os dois
// botões, os pedidos com a situação (lidos de volta do Conecta) e o carrinho que ele montou e não fechou.
import { ExternalLink, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  SITUACAO_DO_PEDIDO, useCatalogosDoPortal, useMeusPedidosConecta, useMinhasSacolas, type ContaConecta,
} from '@/hooks/useConectaDoPortal';
import { dataHora } from '@/lib/dates';
import { mensagemDeErro } from '@/lib/supabase-result';
import { formatBRL } from '@/types/financeiro';

const NOME_DA_CONTA: Record<ContaConecta, string> = { MF: 'Minasflor (MF)', INBRAS: 'INBRAS' };

export default function PedidosDoDistribuidor() {
  const catalogos = useCatalogosDoPortal();
  const pedidos = useMeusPedidosConecta();
  const sacolas = useMinhasSacolas();
  return (
    <>
      <h1 className="text-[24px] font-semibold">Pedir à Minasflor</h1>
      <Card className="p-4 space-y-3">
        <p className="text-[14px] text-muted-foreground">O catálogo abre já com o seu preço. O pedido feito lá chega à Minasflor
          sozinho, e a situação aparece aqui.</p>
        {catalogos.error && <p className="text-[14px] text-status-danger">{mensagemDeErro(catalogos.error)}</p>}
        <div className="grid sm:grid-cols-2 gap-2">
          {(['MF', 'INBRAS'] as ContaConecta[]).map((conta) => {
            const c = catalogos.data?.find((k) => k.conta === conta);
            return c ? (
              <Button key={conta} asChild className="h-12 text-base gap-2">
                <a href={c.link} target="_blank" rel="noopener noreferrer">
                  <ShoppingCart className="w-4 h-4" aria-hidden="true" /> Pedir na {NOME_DA_CONTA[conta]}
                  <ExternalLink className="w-4 h-4" aria-hidden="true" />
                </a>
              </Button>
            ) : (
              <Button key={conta} disabled variant="outline" className="h-12 text-base">
                {NOME_DA_CONTA[conta]}: catálogo ainda não disponível
              </Button>
            );
          })}
        </div>
      </Card>

      {(sacolas.data ?? []).length > 0 && (
        <Card className="p-4">
          <h2 className="text-[16px] font-semibold mb-2">Carrinho que ficou aberto</h2>
          <ul className="divide-y divide-border">
            {sacolas.data!.map((s) => (
              <li key={`${s.conta}-${s.id}`} className="py-2.5 flex items-center gap-3">
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px]">{NOME_DA_CONTA[s.conta]}{s.valor_total != null ? ` · ${formatBRL(Number(s.valor_total))}` : ''}</span>
                  <span className="block text-[13px] text-muted-foreground truncate">
                    {s.sacola_em ? `${dataHora(s.sacola_em)} · ` : ''}{s.produtos.map((p) => p.produto).filter(Boolean).join(', ')}
                  </span>
                </span>
                {s.link && <Button asChild variant="outline" className="h-11"><a href={s.link} target="_blank" rel="noopener noreferrer">Fechar o pedido</a></Button>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-4">
        <h2 className="text-[16px] font-semibold mb-2">Meus pedidos</h2>
        {pedidos.error && <p className="text-[14px] text-status-danger">{mensagemDeErro(pedidos.error)}</p>}
        {!pedidos.isLoading && (pedidos.data ?? []).length === 0 && (
          <p className="text-[14px] text-muted-foreground">Nenhum pedido nos últimos 45 dias.</p>
        )}
        <ul className="divide-y divide-border">
          {(pedidos.data ?? []).map((p) => (
            <li key={`${p.conta}-${p.id}`} className="py-2.5 flex items-center gap-3">
              <span className="flex-1 min-w-0">
                <span className="block text-[15px]">
                  {NOME_DA_CONTA[p.conta]} · nº {p.id} · <b>{SITUACAO_DO_PEDIDO[p.situacao ?? ''] ?? p.situacao ?? '—'}</b>
                </span>
                <span className="block text-[13px] text-muted-foreground truncate">
                  {p.criado_em ? dataHora(p.criado_em) : ''}{p.produtos.length ? ` · ${p.produtos.length} produto(s)` : ''}
                </span>
              </span>
              {p.valor_pagamento != null && <span className="text-[15px] font-semibold tabular-nums">{formatBRL(Number(p.valor_pagamento))}</span>}
              {p.link && (
                <Button asChild variant="ghost" size="icon" className="h-11 w-11" aria-label={`Acompanhar o pedido ${p.id}`}>
                  <a href={p.link} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" aria-hidden="true" /></a>
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
