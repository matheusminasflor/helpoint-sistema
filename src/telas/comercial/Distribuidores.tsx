// Comercial › Distribuidores (Portal do Distribuidor, etapa 6): cada distribuidor liberado com o que dá para vender —
// salões e clientes dele, venda aos salões, produto acabando, o último pedido no Conecta e o carrinho que ficou aberto.
// A ficha mostra os salões (sem o contato pessoal: LGPD, decisão do dono de 2026-10-25), o estoque e os pedidos —
// e, desde a R5, as compras dele à Minasflor (as notas do Forteplus), ao lado do estoque.
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Store } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { useFichaDoDistribuidor, usePainelDeDistribuidores } from '@/hooks/useDistribuidoresDoComercial';
import { rotuloDaEtapa } from '@/hooks/usePortalDoDistribuidor';
import { SITUACAO_DO_PEDIDO } from '@/hooks/useConectaDoPortal';
import { dataHora, diaCurto } from '@/lib/dates';
import { mensagemDeErro } from '@/lib/supabase-result';
import { formatBRL } from '@/types/financeiro';
import { linkFichaCliente } from '@/config/comercial-insights';

const ROTULO_DA_CLASSE: Record<string, string> = { bonificacao: 'bonificação', devolucao: 'devolução' };

export function DistribuidoresDoComercial() {
  const painel = usePainelDeDistribuidores();
  return (
    <div>
      <PageHeader title="Distribuidores" icon={Store}
        description="Os distribuidores no portal: salões, venda aos salões, o que está acabando, o último pedido e o carrinho aberto." />
      <div className="p-4 sm:p-6 space-y-3">
        {painel.error && <p className="text-[14px] text-status-danger">{mensagemDeErro(painel.error)}</p>}
        {!painel.isLoading && (painel.data ?? []).length === 0 && (
          <p className="text-[14px] text-muted-foreground">Nenhum distribuidor liberado no portal ainda. A TI libera em TI › Distribuidores.</p>
        )}
        {(painel.data ?? []).map((d) => (
          <Link key={d.id} to={`/comercial/distribuidores/${d.id}`} className="block">
            <Card className="p-4 hover:border-foreground/30">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <p className="text-[16px] font-semibold flex-1 min-w-[200px]">{d.razao_social}</p>
                <p className="text-[13px] text-muted-foreground">
                  {[d.cidade, d.uf].filter(Boolean).join('/')}{d.tabela ? ` · tabela ${d.tabela}` : ''}{d.com_cliente_codigo ? ` · cliente ${d.com_cliente_codigo}` : ''}
                </p>
              </div>
              <dl className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[13px]">
                <div><dt className="text-muted-foreground">Salões</dt><dd className="text-[15px]">{d.saloes} · {d.clientes} clientes{d.testando ? ` · ${d.testando} testando` : ''}</dd></div>
                <div><dt className="text-muted-foreground">Vendeu aos salões (30 dias)</dt><dd className="text-[15px] tabular-nums">{formatBRL(Number(d.vendas_30_dias))}</dd></div>
                <div><dt className="text-muted-foreground">Último pedido</dt>
                  <dd className="text-[15px]">{d.ultimo_pedido_em ? `${diaCurto(d.ultimo_pedido_em.slice(0, 10))} · ${SITUACAO_DO_PEDIDO[d.ultimo_pedido_situacao ?? ''] ?? d.ultimo_pedido_situacao ?? ''}` : '—'}</dd></div>
                <div><dt className="text-muted-foreground">Para aumentar a venda</dt>
                  <dd className="text-[15px]">
                    {[d.carrinhos_abertos ? `carrinho aberto ${formatBRL(Number(d.carrinhos_abertos))}` : null,
                      d.produtos_acabando ? `${d.produtos_acabando} produto(s) acabando` : null].filter(Boolean).join(' · ') || '—'}
                  </dd></div>
              </dl>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function FichaDoDistribuidor() {
  const { id } = useParams();
  const ficha = useFichaDoDistribuidor(id);
  const f = ficha.data;
  return (
    <div>
      <PageHeader title={f?.distribuidor.razao_social ?? 'Distribuidor'} icon={Store}
        description={f ? [f.distribuidor.cidade, f.distribuidor.uf].filter(Boolean).join('/') : undefined} />
      <div className="p-4 sm:p-6 space-y-4">
        <Link to="/comercial/distribuidores" className="inline-flex items-center gap-1 text-[14px] text-muted-foreground h-10">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Distribuidores
        </Link>
        {ficha.error && <p className="text-[14px] text-status-danger">{mensagemDeErro(ficha.error)}</p>}
        {f === null && <p className="text-[14px] text-muted-foreground">Distribuidor não encontrado.</p>}
        {f && (
          <div className="grid lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 mb-2">
                <h2 className="text-[16px] font-semibold flex-1">Compras dele à Minasflor · 12 meses</h2>
                {f.distribuidor.com_cliente_codigo && (
                  <Link to={linkFichaCliente(f.distribuidor.com_cliente_codigo)} className="text-[14px] text-primary hover:underline min-h-11 inline-flex items-center">
                    Ficha do cliente
                  </Link>
                )}
              </div>
              {f.compras.length === 0 ? <p className="text-[14px] text-muted-foreground">Nenhuma nota nos últimos 12 meses.</p> : (
                <>
                  <p className="text-[14px] mb-1">{f.compras.length} nota(s) · <b className="tabular-nums">{formatBRL(f.compras.reduce((t, n) => t + n.valor, 0))}</b></p>
                  <ul className="divide-y divide-border max-h-[420px] overflow-y-auto">
                    {f.compras.map((n) => (
                      <li key={n.chave} className="py-1.5 text-[14px]">
                        <p className="flex gap-3">
                          <span className="flex-1">{diaCurto(n.emissao)} · {n.filial} nº {n.documento}{n.classe !== 'venda' ? ` · ${ROTULO_DA_CLASSE[n.classe] ?? n.classe}` : ''}</span>
                          <span className="tabular-nums">{formatBRL(n.valor)}</span>
                        </p>
                        <p className="text-[13px] text-muted-foreground">{n.produtos.join(', ')}</p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
            <Card className="p-4">
              <h2 className="text-[16px] font-semibold mb-2">Estoque dele</h2>
              {f.estoque.length === 0 ? <p className="text-[14px] text-muted-foreground">Nenhuma nota desde a liberação.</p> : (
                <table className="w-full text-[14px]">
                  <thead><tr className="text-left text-muted-foreground"><th className="font-normal py-1">Produto</th>
                    <th className="font-normal text-right">Tem</th><th className="font-normal text-right">Vendeu 60 d</th></tr></thead>
                  <tbody>
                    {f.estoque.map((e) => (
                      <tr key={e.produto_codigo} className="border-t border-border">
                        <td className="py-1.5">{e.produto_nome}</td>
                        <td className={Number(e.saldo) <= 0 ? 'text-right tabular-nums text-status-danger' : 'text-right tabular-nums'}>{Number(e.saldo)}</td>
                        <td className="text-right tabular-nums">{Number(e.vendeu_60_dias)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
            <Card className="p-4">
              <h2 className="text-[16px] font-semibold mb-2">Salões ({f.saloes.length})</h2>
              {f.saloes.length === 0 ? <p className="text-[14px] text-muted-foreground">Nenhum salão cadastrado.</p> : (
                <ul className="divide-y divide-border">
                  {f.saloes.map((s) => (
                    <li key={s.id} className="py-1.5 flex gap-3 text-[14px]">
                      <span className="flex-1">{s.nome}{s.cidade ? ` · ${s.cidade}` : ''}</span>
                      <span className="text-muted-foreground">{rotuloDaEtapa(s.etapa)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-4">
              <h2 className="text-[16px] font-semibold mb-2">Pedidos no Conecta</h2>
              {f.pedidos.length === 0 ? <p className="text-[14px] text-muted-foreground">Nenhum pedido lido do Conecta.</p> : (
                <ul className="divide-y divide-border">
                  {f.pedidos.map((p) => (
                    <li key={`${p.conta}-${p.id}`} className="py-1.5 flex gap-3 text-[14px]">
                      <span className="flex-1">{p.conta} nº {p.id}{p.criado_em ? ` · ${dataHora(p.criado_em)}` : ''}</span>
                      <span>{SITUACAO_DO_PEDIDO[p.situacao ?? ''] ?? p.situacao}</span>
                      {p.valor_pagamento != null && <span className="tabular-nums">{formatBRL(Number(p.valor_pagamento))}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-4">
              <h2 className="text-[16px] font-semibold mb-2">Carrinhos que não viraram pedido</h2>
              {f.sacolas.length === 0 ? <p className="text-[14px] text-muted-foreground">Nenhum.</p> : (
                <ul className="divide-y divide-border">
                  {f.sacolas.map((s) => (
                    <li key={`${s.conta}-${s.id}`} className="py-1.5 text-[14px]">
                      <p>{s.conta}{s.sacola_em ? ` · ${dataHora(s.sacola_em)}` : ''}{s.valor_total != null ? ` · ${formatBRL(Number(s.valor_total))}` : ''}</p>
                      <p className="text-[13px] text-muted-foreground">{s.produtos.map((x) => `${x.quantidade ?? ''} ${x.produto ?? ''}`.trim()).join(', ')}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
