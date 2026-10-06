// As listas das diretrizes comerciais (decisão do dono, 2026-10-04): "a conceder", "perto de
// atingir" e "concedidos" — as mesmas no Insights (todos os clientes) e na ficha do cliente (um
// só). O "Marcar concedido" e o "desfazer" só aparecem para quem o banco deixa (quem altera a aba
// "Diretrizes" ou o gestor); a vendedora vê a lista e avisa.
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  useApuracaoDiretrizes, useConcederDiretriz, useDesfazerConcessao, usePodeConcederDiretriz,
} from '@/hooks/useComercialDiretrizes';
import { useProdutosComFamilia } from '@/hooks/useComercialFamilias';
import { linkFichaCliente } from '@/config/comercial-insights';
import { limparNomeCliente } from '@/lib/nome-cliente';
import { descreverBeneficio, separarApuracao, type LinhaDaApuracao } from '@/lib/diretrizes-comerciais';
import { competenceLabel, formatBRL } from '@/types/financeiro';

export type ListaDeDiretriz = 'a_conceder' | 'perto' | 'concedidos';

const fmtQtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
// `concedido_em` é instante (timestamptz): a data é a do relógio local, nunca o pedaço UTC (regra 4).
const dataLocal = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

/** O nome do produto da bonificação, pelo cadastro de produtos (o código, se não achar). */
function useNomeDoProduto() {
  const produtos = useProdutosComFamilia();
  return useMemo(() => {
    const mapa = new Map((produtos.data?.linhas ?? []).map((p) => [p.codigo, p.nome]));
    return (codigo: string) => mapa.get(codigo);
  }, [produtos.data]);
}

export function TabelaDeDiretrizes({
  linhas, lista, mostrarCliente = true,
}: { linhas: LinhaDaApuracao[]; lista: ListaDeDiretriz; mostrarCliente?: boolean }) {
  const podeConceder = usePodeConcederDiretriz();
  const nomeDoProduto = useNomeDoProduto();
  const desfazer = useDesfazerConcessao();
  const [concedendo, setConcedendo] = useState<LinhaDaApuracao | null>(null);

  const vazio = {
    a_conceder: 'Ninguém a conceder no período.',
    perto: 'Ninguém perto de atingir no período.',
    concedidos: 'Nada concedido no período.',
  }[lista];

  return (
    <>
      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-secondary/60 text-left text-muted-foreground">
              <th className="px-3 py-1.5 font-semibold">Mês</th>
              {mostrarCliente && <th className="px-3 py-1.5 font-semibold">Cliente</th>}
              <th className="px-3 py-1.5 font-semibold">Diretriz</th>
              <th className="px-3 py-1.5 font-semibold text-right">Comprou</th>
              <th className="px-3 py-1.5 font-semibold text-right">{lista === 'perto' ? 'Falta' : 'Mínimo'}</th>
              <th className="px-3 py-1.5 font-semibold">Benefício</th>
              {lista === 'concedidos' && <th className="px-3 py-1.5 font-semibold">Concedido</th>}
              {podeConceder && lista !== 'perto' && <th className="px-3 py-1.5" />}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={`${l.diretriz_id}-${l.cliente_codigo}-${l.competencia}`} className="border-t">
                <td className="px-3 py-1.5 whitespace-nowrap">{competenceLabel(l.competencia)}</td>
                {mostrarCliente && (
                  <td className="px-3 py-1.5">
                    <Link to={linkFichaCliente(l.cliente_codigo)} className="text-primary hover:underline" title={l.cliente_nome}>
                      {limparNomeCliente(l.cliente_nome)}
                    </Link>
                    {l.tabela_base && <span className="ml-1 text-[12px] text-muted-foreground">({l.tabela_base})</span>}
                  </td>
                )}
                <td className="px-3 py-1.5">
                  {l.diretriz}
                  {l.condicao && <div className="text-[12px] text-muted-foreground">{l.condicao}</div>}
                </td>
                <td className="px-3 py-1.5 text-right font-mono" title={formatBRL(l.valor_comprado)}>{fmtQtd(l.quantidade)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{fmtQtd(lista === 'perto' ? l.falta : l.minimo)}</td>
                <td className="px-3 py-1.5">
                  {/* Atingiu: o valor apurado (ou gravado). Perto: o que ganha se atingir. */}
                  {l.valor_beneficio !== null ? `${formatBRL(l.valor_beneficio)} de cashback` : descreverBeneficio(l, nomeDoProduto)}
                </td>
                {lista === 'concedidos' && (
                  <td className="px-3 py-1.5">
                    {dataLocal(l.concedido_em)}{l.concedido_por_nome ? ` · ${l.concedido_por_nome}` : ''}
                    {l.pedido && <div className="text-[12px] text-muted-foreground">Pedido {l.pedido}</div>}
                    {l.observacao && <div className="text-[12px] text-muted-foreground">{l.observacao}</div>}
                  </td>
                )}
                {podeConceder && lista === 'a_conceder' && (
                  <td className="px-3 py-1.5 text-right">
                    <Button size="sm" variant="secondary" onClick={() => setConcedendo(l)}>Marcar concedido</Button>
                  </td>
                )}
                {podeConceder && lista === 'concedidos' && (
                  <td className="px-3 py-1.5 text-right">
                    <Button
                      size="sm" variant="ghost" disabled={desfazer.isPending}
                      onClick={() => {
                        if (l.concessao_id && window.confirm('Desfazer a concessão? O cliente volta para "a conceder".')) {
                          desfazer.mutate(l.concessao_id);
                        }
                      }}
                    >
                      Desfazer
                    </Button>
                  </td>
                )}
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-4 text-center text-muted-foreground">{vazio}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <DialogoConceder linha={concedendo} onFechar={() => setConcedendo(null)} />
    </>
  );
}

function DialogoConceder({ linha, onFechar }: { linha: LinhaDaApuracao | null; onFechar: () => void }) {
  const conceder = useConcederDiretriz();
  const nomeDoProduto = useNomeDoProduto();
  const [pedido, setPedido] = useState('');
  const [observacao, setObservacao] = useState('');

  const fechar = () => { setPedido(''); setObservacao(''); onFechar(); };

  return (
    <Dialog open={!!linha} onOpenChange={(aberto) => { if (!aberto) fechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar concedido</DialogTitle>
          {linha && (
            <DialogDescription>
              {limparNomeCliente(linha.cliente_nome)} · {linha.diretriz} · {competenceLabel(linha.competencia)} —{' '}
              {linha.valor_beneficio !== null ? `${formatBRL(linha.valor_beneficio)} de cashback` : descreverBeneficio(linha, nomeDoProduto)}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="conceder-pedido">Pedido em que foi aplicado</Label>
            <Input id="conceder-pedido" value={pedido} onChange={(e) => setPedido(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="conceder-observacao">Observação</Label>
            <Textarea id="conceder-observacao" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>
          <p className="text-[12px] text-muted-foreground">
            A data e quem marcou ficam registrados. O valor é o que o sistema apurou. Uma vez por cliente, diretriz e mês.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={fechar}>Cancelar</Button>
          <Button
            disabled={conceder.isPending || !linha}
            onClick={() => linha && conceder.mutate(
              { diretriz_id: linha.diretriz_id, cliente_codigo: linha.cliente_codigo, competencia: linha.competencia, pedido, observacao },
              { onSuccess: fechar },
            )}
          >
            Marcar concedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * O bloco "Diretrizes" da ficha do cliente: no período da ficha (meses inteiros), o que ele
 * atingiu (a conceder ou concedido) e do que está perto. Sem nada disso, o bloco não ocupa espaço
 * com tabela vazia — diz numa linha que não há.
 */
export function DiretrizesDoCliente({ codigo, de, ate }: { codigo: string; de: string; ate: string }) {
  const apuracao = useApuracaoDiretrizes(de, ate, codigo);
  const { aConceder, perto, concedidos } = separarApuracao(apuracao.data?.linhas ?? []);
  const nada = aConceder.length + perto.length + concedidos.length === 0;

  return (
    <div className="rounded-lg border border-border">
      <div className="px-4 py-2 border-b border-border text-[14px] font-semibold">Diretrizes comerciais</div>
      <div className="p-3 space-y-3">
        {apuracao.isError ? (
          <p className="text-[13px] text-destructive">Não consegui carregar as diretrizes deste cliente.</p>
        ) : apuracao.isLoading ? (
          <p className="text-[13px] text-muted-foreground">Carregando…</p>
        ) : nada ? (
          <p className="text-[13px] text-muted-foreground">Nenhuma diretriz atingida nem perto de atingir no período.</p>
        ) : (
          <>
            {aConceder.length > 0 && (
              <Secao titulo={`A conceder (${aConceder.length})`}><TabelaDeDiretrizes linhas={aConceder} lista="a_conceder" mostrarCliente={false} /></Secao>
            )}
            {perto.length > 0 && (
              <Secao titulo={`Perto de atingir (${perto.length})`}><TabelaDeDiretrizes linhas={perto} lista="perto" mostrarCliente={false} /></Secao>
            )}
            {concedidos.length > 0 && (
              <Secao titulo={`Concedidos (${concedidos.length})`}><TabelaDeDiretrizes linhas={concedidos} lista="concedidos" mostrarCliente={false} /></Secao>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[13px] font-semibold text-muted-foreground">{titulo}</div>
      {children}
    </div>
  );
}
