// As linhas em que os 2 arquivos do mês não batem e a conta não sabe o que é a diferença (dono, 2026-10-21). A tela
// mostra o que CADA arquivo diz, produto a produto, e quem importa escolhe tipo, série e CFOP — nada vem marcado: em
// junho/MF o palpite "venda" estava errado (a nota 18578 é bonificação no Forteplus). Ver `LinhaParaDecidir`.
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatBRL } from '@/types/financeiro';
import type { CasoParaDecidir, DecisaoDaLinha, LinhaNoArquivo } from '@/lib/comercial-import';

type Decisao = Partial<DecisaoDaLinha>;
export interface OpcoesDoArquivo { series: string[]; venda: string[]; bonificacao: string[] }

const dataBR = (iso: string) => iso.split('-').reverse().join('/');
const comoDiz = (ls: LinhaNoArquivo[]) => ls.length === 0
  ? <span className="text-status-danger font-semibold">não traz</span>
  : ls.map((l, k) => (
    <div key={k} className="font-mono whitespace-nowrap">
      nota {l.documento} · {dataBR(l.emissao)} · série {l.serie} · CFOP {l.cfop} · {l.quantidade} un · {formatBRL(l.valor)}
    </div>
  ));

function Escolhas({ valor, opcoes, disabled, rotulo, onChange }: {
  valor: Decisao; opcoes: OpcoesDoArquivo; disabled: boolean; rotulo: string; onChange: (d: Decisao) => void;
}) {
  const cfops = valor.tipo ? opcoes[valor.tipo] : [];
  return (
    <div className="flex flex-wrap gap-1.5">
      <Select value={valor.tipo} disabled={disabled} onValueChange={(t) => onChange({ ...valor, tipo: t as DecisaoDaLinha['tipo'], cfop: undefined })}>
        <SelectTrigger className="h-8 w-32" aria-label={`${rotulo}: venda ou bonificação`}><SelectValue placeholder="Tipo" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="venda">Venda</SelectItem>
          <SelectItem value="bonificacao">Bonificação</SelectItem>
        </SelectContent>
      </Select>
      <Select value={valor.serie} disabled={disabled} onValueChange={(serie) => onChange({ ...valor, serie })}>
        <SelectTrigger className="h-8 w-24" aria-label={`${rotulo}: série`}><SelectValue placeholder="Série" /></SelectTrigger>
        <SelectContent>{opcoes.series.map((s) => <SelectItem key={s} value={s}>Série {s}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={valor.cfop} disabled={disabled || !valor.tipo} onValueChange={(cfop) => onChange({ ...valor, cfop })}>
        <SelectTrigger className="h-8 w-24" aria-label={`${rotulo}: CFOP`}><SelectValue placeholder="CFOP" /></SelectTrigger>
        <SelectContent>{cfops.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

export function CasosParaDecidir({ casos, decisoes, opcoes, disabled, faltam, onDecidir }: {
  casos: CasoParaDecidir[];
  decisoes: Record<string, Decisao>;
  opcoes: OpcoesDoArquivo;
  disabled: boolean;
  faltam: number;
  onDecidir: (chaves: string[], d: Decisao) => void;
}) {
  const [todas, setTodas] = useState<Record<string, Decisao>>({});
  const total = casos.reduce((s, c) => s + c.linhas.length, 0);
  return (
    <div className="rounded-lg border border-border badge-warning p-3 text-[14px] space-y-3">
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="w-4 h-4" aria-hidden="true" />
        {total === 1 ? '1 linha precisa' : `${total} linhas precisam`} da sua decisão — os 2 arquivos não batem
      </div>
      <p>
        Nestas linhas o arquivo <strong>com tudo</strong> traz mais quantidade do que o arquivo <strong>só 5910/6910</strong>,
        e o cliente não tem nenhuma linha de venda no mês para onde a diferença possa voltar. Pode ser <strong>venda</strong> que
        o Forteplus juntou com a bonificação, ou <strong>bonificação</strong> que ficou de fora do arquivo só 5910/6910.
        O sistema não decide sozinho: confira cada nota no Forteplus e escolha o tipo, a série e o CFOP da diferença.
      </p>
      {casos.map((c) => {
        const chaves = c.linhas.map((l) => l.chave);
        const deTodas = todas[c.chave] ?? {};
        return (
          <div key={c.chave} className="rounded-md border border-border bg-card p-2 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <strong>{c.cliente_codigo} — {c.cliente_nome}</strong>
                <span className="text-muted-foreground"> · nota(s) no arquivo com tudo: {c.documentos.join(', ')} · diferença {formatBRL(c.valor)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[13px] text-muted-foreground">Todas as {c.linhas.length} linhas:</span>
                <Escolhas valor={deTodas} opcoes={opcoes} disabled={disabled} rotulo={`Todas de ${c.cliente_nome}`}
                  onChange={(d) => setTodas((t) => ({ ...t, [c.chave]: d }))} />
                <Button size="sm" variant="outline" disabled={disabled || !deTodas.tipo || !deTodas.serie || !deTodas.cfop}
                  onClick={() => onDecidir(chaves, deTodas)}>Aplicar</Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-3">Produto</th>
                    <th className="pr-3">O arquivo com tudo diz</th>
                    <th className="pr-3">O arquivo só 5910/6910 diz</th>
                    <th className="pr-3 text-right">Diferença</th>
                    <th>A diferença é</th>
                  </tr>
                </thead>
                <tbody>
                  {c.linhas.map((l) => (
                    <tr key={l.chave} className="border-t border-border/50 align-top">
                      <td className="py-1.5 pr-3">{l.produto_codigo} — {l.produto_nome}</td>
                      <td className="pr-3">{comoDiz(l.noTudo)}</td>
                      <td className="pr-3">{comoDiz(l.noSoRemessa)}</td>
                      <td className="pr-3 text-right font-mono whitespace-nowrap">{l.quantidade} un · {formatBRL(l.valor)}</td>
                      <td>
                        <Escolhas valor={decisoes[l.chave] ?? {}} opcoes={opcoes} disabled={disabled}
                          rotulo={`Produto ${l.produto_codigo}`} onChange={(d) => onDecidir([l.chave], d)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      {faltam > 0 && <p className="font-semibold">Falta decidir {faltam} {faltam === 1 ? 'linha' : 'linhas'} para importar.</p>}
    </div>
  );
}
