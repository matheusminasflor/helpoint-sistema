// Os indicadores da conferência de pedidos (LEVA S) — o painel 18.4 do dono: registrado,
// conciliado, pendente, divergente, recebido e o % de conciliação, com o faturamento fiscal ao lado
// (18.5: "distinguir vendas registradas, faturamento fiscal e valores efetivamente recebidos").
//
// 2026-09-30, o dono: "KPI do maior vendedor com falha nos pedidos, para sabermos se precisa de
// treinamento; ao clicar vemos quais são os maiores ranking de erros; e um KPI geral de ranking de
// maiores falhas, motivos de recusa". Então: o cartão da vendedora que mais falha (clicável), o
// ranking das vendedoras (cada uma clicável, abre os erros dela) e o ranking geral de motivos.
//
// Tudo vem pronto de `ped_indicadores`; a tela só mostra. `resumido` é a versão da Diretoria e do
// Comercial: os cartões, sem as listas.
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useIndicadoresDaConferencia, type IndicadoresDaConferencia as Dados, type MotivoContado, type QtdEValor,
} from '@/hooks/usePedidosChecklist';
import { todayISO } from '@/lib/dates';
import { formatBRL } from '@/types/financeiro';

function Numero({ titulo, dado, ajuda }: { titulo: string; dado: QtdEValor; ajuda: string }) {
  return (
    <Card className="p-3" title={ajuda}>
      <p className="text-[12px] text-muted-foreground">{titulo}</p>
      <p className="text-[16px] font-semibold font-mono">{formatBRL(Number(dado.valor))}</p>
      <p className="text-[12px] text-muted-foreground">{dado.qtd} {dado.qtd === 1 ? 'checklist' : 'checklists'}</p>
    </Card>
  );
}

const pct = (n: number | null) => (n === null ? '—' : `${String(n).replace('.', ',')}%`);

/** Uma lista em barras: o maior valor é a barra cheia. */
function Barras({ linhas, vazio }: { linhas: MotivoContado[]; vazio: string }) {
  if (linhas.length === 0) return <p className="text-[13px] text-muted-foreground">{vazio}</p>;
  const maior = Math.max(...linhas.map((l) => l.vezes));
  return (
    <ul className="space-y-1.5">
      {linhas.map((l) => (
        <li key={l.motivo} className="text-[13px]">
          <div className="flex justify-between gap-2"><span>{l.motivo}</span><span className="font-mono font-semibold">{l.vezes}</span></div>
          <div className="h-1.5 rounded-full bg-muted">
            <div className="h-1.5 rounded-full bg-destructive" style={{ width: `${(100 * l.vezes) / maior}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

type Vendedora = Dados['por_vendedora'][number];

function CartaoDaVendedora({ v, aoClicar, ativa }: { v: Vendedora | undefined; aoClicar?: () => void; ativa?: boolean }) {
  const conteudo = (
    <>
      <p className="flex items-center gap-1 text-[12px] text-muted-foreground">
        <AlertTriangle className="w-3 h-3" aria-hidden="true" /> Vendedora com mais falhas
      </p>
      {v && v.recusas > 0 ? (
        <>
          <p className="text-[16px] font-semibold truncate">{v.nome}</p>
          <p className="text-[12px] text-muted-foreground">
            {v.recusas} {v.recusas === 1 ? 'recusa' : 'recusas'} · {pct(v.taxa)} dos checklists
            {aoClicar && ' · ver os erros'}
          </p>
        </>
      ) : (
        <p className="text-[14px] text-muted-foreground pt-1">Nenhuma recusa no período.</p>
      )}
    </>
  );
  return aoClicar && v && v.recusas > 0 ? (
    <button type="button" onClick={aoClicar}
      className={cn('rounded-lg border p-3 text-left transition-colors hover:bg-muted/60',
        ativa ? 'border-destructive bg-destructive/5' : 'border-border bg-card')}>
      {conteudo}
    </button>
  ) : <Card className="p-3">{conteudo}</Card>;
}

export function IndicadoresDaConferencia({ resumido = false }: { resumido?: boolean }) {
  const hoje = todayISO();
  const [de, setDe] = useState(`${hoje.slice(0, 7)}-01`);
  const [ate, setAte] = useState(hoje);
  const [vendedora, setVendedora] = useState<string | null>(null);
  const { data, isLoading, isError } = useIndicadoresDaConferencia(de, ate);

  const maisFalhas = data?.por_vendedora[0];
  const escolhida = data?.por_vendedora.find((v) => v.vendedor_id === vendedora);
  const abrir = (id: string) => setVendedora((atual) => (atual === id ? null : id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="ind-de" className="text-[12px]">De</Label>
          <Input id="ind-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ind-ate" className="text-[12px]">Até</Label>
          <Input id="ind-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="w-40" />
        </div>
        <p className="text-[12px] text-muted-foreground max-w-md">
          Checklists enviados no período. Valor = pedidos tipo Venda. O faturado é a nota fiscal do Forteplus desses
          clientes no período — a nota não traz o número do pedido, então o cruzamento é por cliente.
        </p>
      </div>

      {isError ? (
        <p className="text-[13px] badge-danger rounded-md px-3 py-2">Não foi possível carregar os indicadores.</p>
      ) : isLoading || !data ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Numero titulo="Vendas registradas (Comercial)" dado={data.registrado} ajuda="Todo checklist enviado no período." />
            <Numero titulo="Vendas conciliadas" dado={data.conciliado} ajuda="O Financeiro conferiu e aprovou." />
            <Numero titulo="Recebimentos confirmados" dado={data.recebido} ajuda="O Financeiro registrou como Pago." />
            <Card className="p-3">
              <p className="text-[12px] text-muted-foreground">Conciliação no período</p>
              <p className="text-[16px] font-semibold font-mono">{pct(data.percentual_conciliacao)}</p>
              <p className="text-[12px] text-muted-foreground">valor conciliado ÷ registrado</p>
            </Card>
            <Numero titulo="Pendências" dado={data.pendente} ajuda="Em análise ou recusado, ainda sem aprovação." />
            <Numero titulo="Divergências" dado={data.divergente} ajuda="Checklists que o Financeiro recusou ao menos uma vez." />
            <Card className="p-3">
              <p className="text-[12px] text-muted-foreground">Faturamento fiscal (Forteplus)</p>
              <p className="text-[16px] font-semibold font-mono">{formatBRL(Number(data.faturado))}</p>
              <p className="text-[12px] text-muted-foreground">notas dos mesmos clientes</p>
            </Card>
            <CartaoDaVendedora v={maisFalhas} ativa={!!maisFalhas && vendedora === maisFalhas.vendedor_id}
              aoClicar={resumido || !maisFalhas ? undefined : () => abrir(maisFalhas.vendedor_id)} />
          </div>

          {!resumido && (
            <>
              <div className="grid gap-3 lg:grid-cols-2">
                <Card className="p-3 space-y-2">
                  <p className="text-[14px] font-semibold">Falhas por vendedora</p>
                  <p className="text-[12px] text-muted-foreground">Clique numa vendedora para ver os erros dela.</p>
                  {data.por_vendedora.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground">Nenhum checklist no período.</p>
                  ) : (
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="text-left text-muted-foreground">
                          <th className="py-1 font-semibold">Vendedora</th>
                          <th className="py-1 font-semibold text-right">Checklists</th>
                          <th className="py-1 font-semibold text-right">Com recusa</th>
                          <th className="py-1 font-semibold text-right">Recusas</th>
                          <th className="py-1 font-semibold text-right">Taxa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.por_vendedora.map((v) => (
                          <tr key={v.vendedor_id} onClick={() => abrir(v.vendedor_id)}
                            className={cn('border-t border-border cursor-pointer hover:bg-muted/60', vendedora === v.vendedor_id && 'bg-destructive/5')}>
                            <td className="py-1.5">
                              <button type="button" className="font-medium underline-offset-2 hover:underline"
                                aria-label={`Ver os erros de ${v.nome}`} onClick={(e) => { e.stopPropagation(); abrir(v.vendedor_id); }}>
                                {v.nome}
                              </button>
                            </td>
                            <td className="py-1.5 text-right font-mono">{v.checklists}</td>
                            <td className="py-1.5 text-right font-mono">{v.com_recusa}</td>
                            <td className="py-1.5 text-right font-mono font-semibold">{v.recusas}</td>
                            <td className="py-1.5 text-right font-mono">{pct(v.taxa)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Card>
                <Card className="p-3 space-y-2">
                  <p className="text-[14px] font-semibold">
                    {escolhida ? `Erros de ${escolhida.nome}` : 'Ranking geral de motivos de recusa'}
                  </p>
                  {escolhida && (
                    <p className="text-[12px] text-muted-foreground">
                      {escolhida.recusas} {escolhida.recusas === 1 ? 'recusa' : 'recusas'} em {escolhida.checklists} checklists.{' '}
                      <button type="button" className="underline" onClick={() => setVendedora(null)}>Voltar ao ranking geral</button>
                    </p>
                  )}
                  <Barras linhas={escolhida ? escolhida.motivos : data.motivos}
                    vazio={escolhida ? 'Nenhuma recusa desta vendedora no período.' : 'Nenhuma recusa no período.'} />
                </Card>
              </div>

              {escolhida && (
                <Card className="p-3 space-y-2">
                  <p className="text-[14px] font-semibold">Ranking geral de motivos de recusa</p>
                  <Barras linhas={data.motivos} vazio="Nenhuma recusa no período." />
                </Card>
              )}

              <Card className="p-3 overflow-x-auto">
                <p className="text-[14px] font-semibold pb-2">Por cliente</p>
                <table className="w-full text-[13px]">
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
            </>
          )}
        </>
      )}
    </div>
  );
}
