// Os blocos novos dos Indicadores do Marketing (dono, 2026-11-03; projeto aprovado, versão 2):
//   · Artistas na Visão Geral: stories, reels e feed de cada artista no período, peças e na campanha, e a bonificação do
//     último mês fechado ("é o valor que se paga");
//   · Artistas mês a mês no Analítico: a parte do teto paga em cada mês;
//   · os blocos que esperam as chaves do Kommo, da Meta e do Bling (dono: "esperar as chaves").
import { Link } from 'react-router-dom';
import { CalendarRange, PlugZap, Star } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DicaDoGrafico } from '@/components/dashboard/DicaDoGrafico';
import { COR, EIXO } from '@/config/cores-dos-graficos';
import { useTenantPath } from '@/hooks/useTenantPath';
import { formatBRL } from '@/lib/crm';
import { STATUS_DO_ARTISTA, mesEAno, nomeDoMes, type ArtistaNoPeriodo, type BonificacaoDoArtista, type MesDosArtistas } from '@/lib/artistas-nos-indicadores';

const pct = (n: number) => `${Math.round(n * 100)}%`;
const n = (v: number) => (v ? String(v) : '—');

function Numero({ v, rotulo }: { v: string | number; rotulo: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-2xl font-bold font-mono text-foreground tabular-nums">{v}</div>
      <div className="text-[12px] uppercase tracking-wider text-muted-foreground">{rotulo}</div>
    </div>
  );
}

export function ArtistasDoPeriodo({ linhas, total, mes, bonificacao }: {
  linhas: ArtistaNoPeriodo[];
  total: Omit<ArtistaNoPeriodo, 'id' | 'nome'>;
  /** O último mês fechado, `AAAA-MM-01`. */
  mes: string;
  bonificacao: BonificacaoDoArtista[];
}) {
  const tenantPath = useTenantPath();
  const doArtista = new Map(bonificacao.map((x) => [x.id, x]));
  const valor = bonificacao.reduce((s, x) => s + x.b.valor, 0);
  const teto = bonificacao.reduce((s, x) => s + x.teto, 0);
  const th = 'px-3 py-2 font-semibold text-right whitespace-nowrap';
  const td = 'px-3 py-2 text-right font-mono tabular-nums';
  return (
    <Card id="artistas-do-marketing" className="p-5 space-y-4 scroll-mt-20">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Star className="h-4 w-4 text-primary" aria-hidden="true" />Artistas</h3>
        <Link to={tenantPath(`/mkt/artistas?mes=${mes.slice(0, 7)}`)} className="text-xs text-primary hover:underline">Abrir Artistas →</Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <Numero v={total.stories} rotulo="Stories" />
        <Numero v={total.reels} rotulo="Reels" />
        <Numero v={total.feed} rotulo="Feed" />
        <Numero v={total.pecas} rotulo={`Peças · ${total.naCampanha} na campanha`} />
        <Numero v={formatBRL(valor)} rotulo={`Bonificação de ${nomeDoMes(mes)}`} />
        <Numero v={teto ? pct(valor / teto) : '—'} rotulo={`do teto (${formatBRL(teto)})`} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-border bg-secondary/60 text-muted-foreground">
              <th className="px-3 py-2 font-semibold text-left">Artista</th>
              <th className={th}>Stories</th><th className={th}>Reels</th><th className={th}>Feed</th>
              <th className={th}>Peças</th><th className={th}>Na campanha</th>
              <th className="px-3 py-2 font-semibold text-left whitespace-nowrap">Bonificação de {nomeDoMes(mes)}</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const b = doArtista.get(l.id);
              return (
                <tr key={l.id} className="border-b border-border">
                  <td className="px-3 py-2 font-medium">{l.nome}</td>
                  <td className={td}>{n(l.stories)}</td><td className={td}>{n(l.reels)}</td><td className={td}>{n(l.feed)}</td>
                  <td className={td}>{n(l.pecas)}</td><td className={td}>{n(l.naCampanha)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {b ? <><Badge className={STATUS_DO_ARTISTA[b.b.status].classe}>{STATUS_DO_ARTISTA[b.b.status].texto} · {pct(b.b.parteDoTeto)}</Badge>
                      <span className="ml-2 text-xs text-muted-foreground font-mono">{formatBRL(b.b.valor)}</span></> : '—'}
                  </td>
                </tr>
              );
            })}
            <tr className="font-bold">
              <td className="px-3 py-2">Total</td>
              <td className={td}>{total.stories}</td><td className={td}>{total.reels}</td><td className={td}>{total.feed}</td>
              <td className={td}>{total.pecas}</td><td className={td}>{total.naCampanha}</td><td />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Stories, reels, feed e peças seguem o período escolhido. A bonificação é a do último mês fechado: um terço pelos stories,
        um pelos reels e posts, um pela reunião; peça na campanha vale inteira, aprovada fora dela vale metade.
      </p>
    </Card>
  );
}

export function ArtistasMesAMes({ meses }: { meses: MesDosArtistas[] }) {
  const dados = meses.map((m) => ({ ...m, rotulo: nomeDoMes(m.mes).slice(0, 3), parte: Math.round(m.parteDoTeto * 100) }));
  return (
    <Card id="analitico-artistas" className="p-5 space-y-3 scroll-mt-20">
      <h3 className="text-sm font-semibold flex items-center gap-2"><CalendarRange className="h-4 w-4 text-primary" aria-hidden="true" />Artistas mês a mês<span className="text-xs font-normal text-muted-foreground">· últimos 12 meses, não segue o período</span></h3>
      {dados.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma entrega lançada.</p> : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dados} margin={{ top: 18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COR.grade} vertical={false} />
              <XAxis dataKey="rotulo" tick={EIXO} />
              <YAxis tick={EIXO} width={36} domain={[0, 100]} unit="%" />
              <Tooltip content={<DicaDoGrafico />} />
              <Bar dataKey="parte" name="Parte do teto paga (%)" fill={COR.azul} radius={[4, 4, 0, 0]}>
                <LabelList dataKey="parte" position="top" formatter={(v: number) => `${v}%`} className="fill-foreground text-xs" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-border bg-secondary/60 text-muted-foreground">
                  <th className="px-3 py-2 font-semibold text-left">Mês</th>
                  <th className="px-3 py-2 font-semibold text-right">Peças</th>
                  <th className="px-3 py-2 font-semibold text-right">Na campanha</th>
                  <th className="px-3 py-2 font-semibold text-right">Bonificação</th>
                </tr>
              </thead>
              <tbody>
                {meses.map((m) => (
                  <tr key={m.mes} className="border-b border-border">
                    <td className="px-3 py-2">{mesEAno(m.mes)}</td>
                    <td className="px-3 py-2 text-right font-mono">{m.pecas}</td>
                    <td className="px-3 py-2 text-right font-mono">{m.naCampanha} <span className="text-muted-foreground">({m.pecas ? pct(m.naCampanha / m.pecas) : '—'})</span></td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{formatBRL(m.valor)} <span className="text-muted-foreground">de {formatBRL(m.teto)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

// Um cartão só enquanto as chaves não entram (revisão de UX de 2026-11-03): quatro blocos vazios no meio da Visão Geral
// empurravam os números reais para baixo. Cada fonte diz o que vai mostrar; ligada, vira o bloco dela.
const LIGACOES = [
  { fonte: 'Kommo', titulo: 'Leads que chegaram', texto: 'Consumidor final, Salão, Distribuidor e Sem triagem (funil Entrada)' },
  { fonte: 'Meta', titulo: 'Tráfego pago', texto: 'investimento, pessoas alcançadas, visitas ao perfil, custo por visita' },
  { fonte: 'Meta', titulo: 'Redes sociais', texto: '@minasflor, @by.mf e @mf.professional: posts, reels, stories, seguidores' },
  { fonte: 'Bling', titulo: 'Vendas', texto: 'faturado pelas notas fiscais' },
];

export function EsperandoAsLigacoes() {
  return (
    <Card className="p-5 space-y-3 border-dashed">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <PlugZap className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Esperando a ligação com o Kommo, a Meta e o Bling
      </h3>
      <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2 text-sm">
        {LIGACOES.map((l) => (
          <li key={l.titulo}>
            <span className="font-semibold">{l.titulo}</span> <span className="text-muted-foreground">({l.fonte}): {l.texto}.</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Os números entram sozinhos quando as chaves forem cadastradas no Helpoint.</p>
    </Card>
  );
}
