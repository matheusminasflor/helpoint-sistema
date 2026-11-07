// Os blocos da Visão Geral do Marketing (proposta v4, aprovada em 2026-11-07, https://claude.ai/artifact/4YkGvumGgu6Z9JmgmwodQr).
// Leis de UX da proposta:
//   · Miller: três destaques no topo e até quatro números por bloco (antes, cinco cartões e um parágrafo de cinco assuntos);
//   · Hick: uma escolha de conta no topo vale para a tela toda, em vez de três cartões repetidos em cada bloco;
//   · posição serial: destaques e "do anúncio à venda" abrem; chamados e operação descem;
//   · Von Restorff: só o que piorou fica vermelho; investimento não tem cor (gastar menos pode ser escolha);
//   · semelhança: cada conta com a mesma cor em tabela, gráfico e apresentação;
//   · Jakob: a escolha de conta segue o Meta Business Suite; ganhas × perdidas, os relatórios do Kommo; a data, o Google Analytics.
// As contas estão em `lib/redes-e-trafego` e `lib/leads-e-vendas` (com Vitest); os dados vêm de `useRedesETrafego`.
import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Megaphone, Share2, Target, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DicaDoGrafico } from '@/components/dashboard/DicaDoGrafico';
import { supabase } from '@/integrations/supabase/client';
import { expectRows } from '@/lib/supabase-result';
import { formatBRL } from '@/lib/crm';
import { domingoDaSemana, somarDias } from '@/lib/ti-equipe';
import { todayISO } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { COR, EIXO, SERIES } from '@/config/cores-dos-graficos';
import { CHAVE_DAS_SEMANAS, useSemanaParaLancar } from '@/hooks/useRedesETrafego';
import {
  CONTAS, NOME_DO_FORMATO, pctTexto, TODAS, type LinhaRedes, type LinhaTrafego, type NumerosDaConta, type Painel, type SemanaNoGrafico,
} from '@/lib/redes-e-trafego';
import { rotuloDaSemana, type Destaque, type ResumoDoKommo } from '@/lib/leads-e-vendas';
import { DIAS, fatias, horariosTexto, nomeDoPais, type ResumoDoPublico } from '@/lib/publico-do-instagram';

const int = (v: number | null) => (v === null ? '—' : Math.round(v).toLocaleString('pt-BR'));
const brl = (v: number | null) => (v === null ? '—' : formatBRL(v));
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const semanaDoGrafico = (domingo: string) => rotuloDaSemana(domingo, somarDias);
const sinal = (n: number) => (n > 0 ? `+${n.toLocaleString('pt-BR')}` : n.toLocaleString('pt-BR').replace('-', '−'));
const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const corDaConta = (conta: string) => SERIES[Math.max(0, CONTAS.indexOf(conta)) % SERIES.length];

/** "todas" ou o nome da conta (@minasflor…), escolhido no topo da tela. */
export type ContaEscolhida = string;


type Melhor = 'mais' | 'menos' | 'neutro';

/** "▲ +12% · era 2.300": a cor diz se foi bom (verde) ou ruim (vermelho); investimento não tem cor. */
function Compara({ atual, anterior, melhor = 'mais', formato = int, porcento = false, unidade = '' }: {
  atual: number | null; anterior: number | null; melhor?: Melhor; formato?: (v: number | null) => string; porcento?: boolean; unidade?: string;
}) {
  if (atual === null || anterior === null) return <span className="text-muted-foreground">{anterior === null ? 'sem número antes' : ''}</span>;
  const dif = atual - anterior;
  if (Math.abs(dif) < 1e-9) return <span className="text-muted-foreground">igual · era {formato(anterior)}</span>;
  const bom = melhor === 'neutro' ? null : (melhor === 'mais') === dif > 0;
  const quanto = porcento && anterior !== 0 ? `${Math.round(Math.abs(dif / anterior) * 100)}%` : `${formato(Math.abs(dif))}${unidade}`;
  return (
    <span className="whitespace-nowrap">
      <span className={cn('font-semibold', bom === null ? 'text-muted-foreground' : bom ? 'text-status-success' : 'text-status-danger')}>
        {dif > 0 ? '▲' : '▼'} {quanto}
      </span>
      <span className="text-muted-foreground"> · era {formato(anterior)}</span>
    </span>
  );
}

function Linha({ rotulo, valor, children }: { rotulo: string; valor: string; children?: ReactNode }) {
  return (
    // O rótulo guarda a largura dele; o valor longo (cidades) quebra à direita em vez de passar por cima do rótulo.
    <div className="grid grid-cols-[auto_1fr] gap-x-3 py-1.5 border-b border-border/60 last:border-0 text-[13px]">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="font-mono tabular-nums text-right text-foreground">{valor}</span>
      {children && <span className="col-span-2 text-right text-[12px]">{children}</span>}
    </div>
  );
}

function Secao({ titulo, icone: Icone, nota, children }: { titulo: string; icone: typeof Share2; nota?: string; children: ReactNode }) {
  return (
    <section className="space-y-3" aria-label={titulo}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold flex items-center gap-2"><Icone className="h-4 w-4 text-primary" aria-hidden="true" />{titulo}</h2>
        {nota && <span className="text-xs text-muted-foreground">{nota}</span>}
      </div>
      {children}
    </section>
  );
}

/** Uma célula de tabela: o número e, embaixo, a comparação. */
function Celula({ valor, children, forte }: { valor: string; children?: ReactNode; forte?: boolean }) {
  return (
    <td className="px-3 py-2.5 text-right align-top tabular-nums">
      <span className={cn('font-mono', forte && 'font-bold')}>{valor}</span>
      {children && <span className="block text-[12px]">{children}</span>}
    </td>
  );
}
const TH = ({ children, esquerda }: { children: ReactNode; esquerda?: boolean }) => (
  <th className={cn('px-3 py-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground border-b', esquerda ? 'text-left' : 'text-right')}>{children}</th>
);
const NomeDaConta = ({ conta }: { conta: string }) => (
  <span className="inline-flex items-center gap-2 font-medium"><span className="h-2.5 w-2.5 rounded-full" style={{ background: corDaConta(conta) }} aria-hidden="true" />{conta}</span>
);

// ─── Topo ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A escolha de conta no topo (como no Meta Business Suite): vale para Redes e Tráfego. Leads são da empresa toda. */
export function EscolhaDeConta({ contas, valor, onEscolher }: { contas: string[]; valor: ContaEscolhida; onEscolher: (c: ContaEscolhida) => void }) {
  const opcoes = [TODAS, ...contas];
  return (
    <div role="radiogroup" aria-label="Conta do Instagram" className="flex flex-wrap gap-1.5">
      {opcoes.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={valor === c} onClick={() => onEscolher(c)}
          className={cn('inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-[13px] font-semibold',
            valor === c ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted')}>
          {c !== TODAS && <span className="h-2.5 w-2.5 rounded-full" style={{ background: corDaConta(c) }} aria-hidden="true" />}
          {c === TODAS ? 'Todas as contas' : c}
        </button>
      ))}
    </div>
  );
}

const BORDA_DO_TOM = { bom: 'border-l-status-success', ruim: 'border-l-status-danger', info: 'border-l-primary' } as const;
/** Os três destaques do período, cada um com a cor do que ele diz. */
export function Destaques({ itens, grande }: { itens: Destaque[]; grande?: boolean }) {
  if (!itens.length) return null;
  return (
    <ul className="grid gap-2 md:grid-cols-3" aria-label="Destaques do período">
      {itens.map((d) => (
        <li key={d.texto} className={cn('rounded-md border border-l-4 bg-card px-4 py-3', BORDA_DO_TOM[d.tom], grande ? 'text-lg' : 'text-sm')}>{d.texto}</li>
      ))}
    </ul>
  );
}

/** Do anúncio à venda: alcance pago → visitas → leads → vendas ganhas, com quantos passaram de uma etapa para a outra. */
export function DoAnuncioAVenda({ painel, conta, kommo, kommoAntes }: {
  painel: Painel; conta: ContaEscolhida; kommo: ResumoDoKommo; kommoAntes: ResumoDoKommo;
}) {
  const daConta = conta === TODAS ? null : painel.contas.find((c) => c.atual.conta === conta);
  const alcance = daConta ? daConta.atual.alcancePago : painel.trafego.atual.alcance;
  const alcanceAntes = daConta ? daConta.anterior.alcancePago : painel.trafego.anterior.alcance;
  const visitas = daConta ? daConta.atual.visitasPagas : painel.trafego.atual.visitas;
  const visitasAntes = daConta ? daConta.anterior.visitasPagas : painel.trafego.anterior.visitas;
  const etapas = [
    { rotulo: 'Pessoas alcançadas', v: alcance, antes: alcanceAntes, porcento: true },
    { rotulo: 'Visitas ao perfil', v: visitas, antes: visitasAntes, porcento: true },
    { rotulo: 'Leads que chegaram', v: kommo.total.chegaram, antes: kommoAntes.temDados ? kommoAntes.total.chegaram : null },
    { rotulo: 'Vendas ganhas', v: kommo.total.ganhas, antes: kommoAntes.temDados ? kommoAntes.total.ganhas : null },
  ];
  const passou = (a: number | null, b: number | null) => (a && b !== null ? `${(b / a * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : null);
  return (
    <Secao titulo="Do anúncio à venda" icone={Target}
      nota={daConta ? `Alcance e visitas de ${conta}; leads e vendas são da empresa toda (o Kommo não separa por conta)` : 'Alcance e visitas do tráfego pago; leads e vendas do Kommo'}>
      <div className="grid grid-cols-2 lg:grid-cols-4 overflow-hidden rounded-lg border bg-card">
        {etapas.map((e, i) => (
          <div key={e.rotulo} className="relative border-b border-r p-4 last:border-r-0 lg:border-b-0 [&:nth-child(2)]:max-lg:border-r-0">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">{e.rotulo}</div>
            <div className="text-[28px] font-bold font-mono tabular-nums leading-tight">{int(e.v)}</div>
            <div className="text-[13px]"><Compara atual={e.v} anterior={e.antes} porcento={e.porcento} /></div>
            {i < etapas.length - 1 && passou(e.v, etapas[i + 1].v) && (
              <span className="absolute right-2 top-2 rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-bold text-primary"
                title={`De ${e.rotulo.toLowerCase()} para ${etapas[i + 1].rotulo.toLowerCase()}`}>→ {passou(e.v, etapas[i + 1].v)}</span>
            )}
          </div>
        ))}
      </div>
    </Secao>
  );
}

// ─── Leads e vendas (Kommo) ───────────────────────────────────────────────────────────────────────────────────────────

/** Por segmento: chegaram, ganhas, perdidas, taxa de ganho e valor; os motivos das perdas; leads semana a semana. */
export function LeadsEVendas({ atual, anterior, semanas }: {
  atual: ResumoDoKommo; anterior: ResumoDoKommo; semanas: { semana: string; chegaram: number }[];
}) {
  const antes = anterior.temDados;
  const comp = (a: number, b: number, melhor: Melhor = 'mais') => (antes ? <Compara atual={a} anterior={b} melhor={melhor} /> : null);
  const ultima = semanas[semanas.length - 1]?.semana;
  return (
    <Secao titulo="Leads e vendas por segmento" icone={Users} nota="Do Kommo. Ganhas e perdidas contam no dia em que fecharam">
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead><tr><TH esquerda>Segmento</TH><TH>Chegaram</TH><TH>Vendas ganhas</TH><TH>Vendas perdidas</TH><TH>Taxa de ganho</TH><TH>Valor ganho</TH></tr></thead>
            <tbody>
              {atual.segmentos.map((s) => {
                const b = anterior.segmentos.find((x) => x.k === s.k)!;
                return (
                  <tr key={s.k} className="border-b last:border-0">
                    <td className={cn('px-3 py-2.5 font-medium', s.k === 'sem_triagem' && 'text-muted-foreground')}>{s.nome}</td>
                    <Celula valor={int(s.chegaram)} forte>{comp(s.chegaram, b.chegaram)}</Celula>
                    <Celula valor={int(s.ganhas)}>{comp(s.ganhas, b.ganhas)}</Celula>
                    <Celula valor={int(s.perdidas)}>{comp(s.perdidas, b.perdidas, 'menos')}</Celula>
                    <Celula valor={pct(s.taxa)} />
                    <Celula valor={s.valor ? formatBRL(s.valor) : '—'} />
                  </tr>
                );
              })}
              <tr className="bg-primary/5 font-semibold">
                <td className="px-3 py-2.5">Total</td>
                <Celula valor={int(atual.total.chegaram)} forte>{comp(atual.total.chegaram, anterior.total.chegaram)}</Celula>
                <Celula valor={int(atual.total.ganhas)} forte>{comp(atual.total.ganhas, anterior.total.ganhas)}</Celula>
                <Celula valor={int(atual.total.perdidas)} forte>{comp(atual.total.perdidas, anterior.total.perdidas, 'menos')}</Celula>
                <Celula valor={pct(atual.total.taxa)} forte />
                <Celula valor={atual.total.valor ? formatBRL(atual.total.valor) : '—'} forte />
              </tr>
            </tbody>
          </table>
        </div>
        {atual.motivos.length > 0 && (
          <details className="border-t px-4 py-3 text-[13px]">
            <summary className="cursor-pointer font-semibold text-primary">Por que perdemos ({atual.total.perdidas})</summary>
            <ul className="mt-2 space-y-1">
              {atual.motivos.map((m) => (
                <li key={m.motivo} className="flex justify-between gap-3 max-w-md">
                  <span className={cn(m.motivo === 'Sem motivo anotado' && 'text-muted-foreground')}>{m.motivo}</span>
                  <span className="font-mono tabular-nums">{m.quantos}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>
      {semanas.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2">Leads que chegaram, semana a semana (segunda a domingo)</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={semanas.map((s) => ({ rotulo: semanaDoGrafico(s.semana), Leads: s.chegaram, semana: s.semana }))}>
              <CartesianGrid strokeDasharray="3 3" stroke={COR.grade} vertical={false} />
              <XAxis dataKey="rotulo" tick={EIXO} />
              <YAxis tick={EIXO} width={32} allowDecimals={false} />
              <Tooltip content={<DicaDoGrafico />} />
              <Bar dataKey="Leads" radius={[3, 3, 0, 0]} label={{ position: 'top', fontSize: 12, fill: COR.eixo }}>
                {semanas.map((s) => <Cell key={s.semana} fill={s.semana === ultima ? COR.roxo : COR.azul} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </Secao>
  );
}

// ─── Tráfego pago ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Uma linha por conta (ou só a escolhida) e o total da conta de anúncios; as campanhas abrem por conta. */
export function TrafegoPorConta({ painel, conta, grafico }: { painel: Painel; conta: ContaEscolhida; grafico: SemanaNoGrafico[] }) {
  const { atual: t, anterior: a } = painel.trafego;
  const contas = painel.contas.filter((c) => conta === TODAS || c.atual.conta === conta);
  const total = t.investimento ?? 0;
  const barras = grafico.map((s) => ({ rotulo: semanaDoGrafico(s.semana), Investimento: s.investimento, Visitas: s.visitas }));
  return (
    <Secao titulo="Tráfego pago por conta" icone={Megaphone} nota="Investimento sem cor: gastar menos pode ser escolha">
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr><TH esquerda>Conta</TH><TH>Investimento</TH><TH>Parte do total</TH><TH>Alcance</TH><TH>Visitas ao perfil</TH><TH>Custo por visita</TH><TH>Campanhas</TH></tr></thead>
            <tbody>
              {contas.map(({ atual: x, anterior: y }) => (
                <tr key={x.conta} className="border-b last:border-0">
                  <td className="px-3 py-2.5 align-top">
                    <NomeDaConta conta={x.conta} />
                    {x.campanhas.length > 0 && (
                      <details className="mt-1 text-[12px]">
                        <summary className="cursor-pointer text-primary">Ver as {x.campanhas.length} campanhas</summary>
                        <ul className="mt-1 space-y-0.5">
                          {x.campanhas.map((c) => (
                            <li key={c.nome} className="flex justify-between gap-2 max-w-xs">
                              <span className="min-w-0 truncate" title={c.nome}>{c.nome}{!c.ativa && <span className="text-muted-foreground"> (pausada)</span>}</span>
                              <span className="font-mono tabular-nums whitespace-nowrap">{formatBRL(c.investimento)}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </td>
                  <Celula valor={brl(x.investimento)} forte><Compara atual={x.investimento} anterior={y.investimento} melhor="neutro" formato={brl} porcento /></Celula>
                  <td className="px-3 py-2.5 align-top">
                    <div className="ml-auto h-2 w-24 overflow-hidden rounded bg-muted">
                      <div className="h-full" style={{ width: `${total ? ((x.investimento ?? 0) / total) * 100 : 0}%`, background: corDaConta(x.conta) }} />
                    </div>
                    <span className="block text-right text-[12px] text-muted-foreground">{total ? pct((x.investimento ?? 0) / total) : '—'}</span>
                  </td>
                  <Celula valor={int(x.alcancePago)}><Compara atual={x.alcancePago} anterior={y.alcancePago} porcento /></Celula>
                  <Celula valor={int(x.visitasPagas)}><Compara atual={x.visitasPagas} anterior={y.visitasPagas} porcento /></Celula>
                  <Celula valor={brl(x.custoPorVisita)}><Compara atual={x.custoPorVisita} anterior={y.custoPorVisita} melhor="menos" formato={brl} /></Celula>
                  <Celula valor={x.campanhasAtivas ? `${x.campanhasAtivas} no ar` : 'nenhuma'} />
                </tr>
              ))}
              {conta === TODAS && (
                <tr className="bg-primary/5 font-semibold">
                  <td className="px-3 py-2.5">Total da conta de anúncios</td>
                  <Celula valor={brl(t.investimento)} forte><Compara atual={t.investimento} anterior={a.investimento} melhor="neutro" formato={brl} porcento /></Celula>
                  <td />
                  <Celula valor={int(t.alcance)}><Compara atual={t.alcance} anterior={a.alcance} porcento /></Celula>
                  <Celula valor={int(t.visitas)}><Compara atual={t.visitas} anterior={a.visitas} porcento /></Celula>
                  <Celula valor={brl(t.custoPorVisita)}><Compara atual={t.custoPorVisita} anterior={a.custoPorVisita} melhor="menos" formato={brl} /></Celula>
                  <Celula valor={t.campanhasAtivas ? `${t.campanhasAtivas} no ar` : 'nenhuma'} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {conta === TODAS && grafico.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2">Investimento × visitas, semana a semana</h3>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={barras}>
              <CartesianGrid strokeDasharray="3 3" stroke={COR.grade} vertical={false} />
              <XAxis dataKey="rotulo" tick={EIXO} />
              <YAxis yAxisId="r" tick={EIXO} width={56} tickFormatter={(v: number) => `R$ ${v}`} />
              <YAxis yAxisId="v" orientation="right" tick={EIXO} width={44} allowDecimals={false} />
              <Tooltip content={<DicaDoGrafico />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="r" dataKey="Investimento" fill={COR.azul} radius={[3, 3, 0, 0]} />
              <Line yAxisId="v" dataKey="Visitas" stroke={COR.laranja} strokeWidth={2} dot />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">
        O alcance do total pode ser menor que a soma das contas: a mesma pessoa pode ver anúncios de duas contas.
      </p>
    </Secao>
  );
}

// ─── Redes sociais ────────────────────────────────────────────────────────────────────────────────────────────────────

/** Com "Todas", uma tabela das contas; com uma conta, o cartão dela, os melhores posts e quem segue. */
export function RedesSociais({ painel, grafico, conta, publico }: {
  painel: Painel; grafico: SemanaNoGrafico[]; conta: ContaEscolhida; publico: ResumoDoPublico[];
}) {
  const contas = painel.contas.map((c) => c.atual.conta);
  const escolhida = painel.contas.find((c) => c.atual.conta === conta);
  const visiveis = escolhida ? [escolhida.atual.conta] : contas;
  const barras = grafico.map((s) => ({ rotulo: semanaDoGrafico(s.semana), ...Object.fromEntries(visiveis.map((c) => [c, s.saldos[c] ?? null])) }));
  const engajamento = (v: number | null) => (v === null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
  return (
    <Secao titulo="Redes sociais" icone={Share2} nota="Alcance e visualizações começaram a ser contados em 01/11/2026">
      {escolhida ? (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <CartaoDaRede a={escolhida.atual} b={escolhida.anterior} />
          <PostsDaConta a={escolhida.atual} />
        </div>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr><TH esquerda>Conta</TH><TH>Seguidores</TH><TH>Saldo</TH><TH>Visitas ao perfil</TH><TH>Alcance</TH><TH>Engajamento</TH><TH>Feed · Reels · Stories</TH></tr></thead>
              <tbody>
                {painel.contas.map(({ atual: x, anterior: y }) => (
                  <tr key={x.conta} className="border-b last:border-0">
                    <td className="px-3 py-2.5"><NomeDaConta conta={x.conta} /></td>
                    <Celula valor={int(x.seguidores)} />
                    <td className={cn('px-3 py-2.5 text-right font-mono font-bold', x.saldo === null ? 'text-muted-foreground' : x.saldo >= 0 ? 'text-status-success' : 'text-status-danger')}>
                      {x.saldo === null ? '—' : sinal(x.saldo)}
                    </td>
                    <Celula valor={int(x.visitas)}><Compara atual={x.visitas} anterior={y.visitas} porcento /></Celula>
                    <Celula valor={int(x.alcance)}><Compara atual={x.alcance} anterior={y.alcance} porcento /></Celula>
                    <Celula valor={pctTexto(x.engajamento)}><Compara atual={x.engajamento} anterior={y.engajamento} formato={engajamento} unidade=" pontos" /></Celula>
                    <Celula valor={`${int(x.feed)} · ${int(x.reels)} · ${int(x.stories)}`}><span className="text-muted-foreground">era {int(y.feed)} · {int(y.reels)} · {int(y.stories)}</span></Celula>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t px-4 py-2 text-xs text-muted-foreground">Escolha uma conta no topo para ver os melhores posts, quem segue e o alcance por formato.</p>
        </Card>
      )}
      {grafico.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2">Saldo de seguidores, semana a semana</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barras}>
              <CartesianGrid strokeDasharray="3 3" stroke={COR.grade} vertical={false} />
              <XAxis dataKey="rotulo" tick={EIXO} />
              <YAxis tick={EIXO} width={40} allowDecimals={false} />
              <Tooltip content={<DicaDoGrafico />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {visiveis.map((c) => <Bar key={c} dataKey={c} name={c} stackId="saldo" fill={corDaConta(c)} />)}
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
      {escolhida && <QuemSegue resumos={publico.filter((p) => p.conta === escolhida.atual.conta)} />}
      <p className="text-xs text-muted-foreground">
        O saldo é a diferença do total de seguidores de um domingo para o outro. Novos e perdidos vêm da Meta e não fecham com o
        saldo, porque o Instagram tira do total contas falsas e apagadas sem contar como "deixou de seguir".
      </p>
    </Secao>
  );
}

function CartaoDaRede({ a, b }: { a: NumerosDaConta; b: NumerosDaConta }) {
  return (
    <Card className="p-4 space-y-2" style={{ borderTop: `3px solid ${corDaConta(a.conta)}` }}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold">{a.conta}</h3>
        <span className="text-[13px] text-muted-foreground font-mono tabular-nums">{int(a.seguidores)} seguidores</span>
      </div>
      <div className="text-[13px]">
        {a.saldo === null ? <span className="text-muted-foreground">Saldo de seguidores: falta o total de uma das semanas</span> : (
          <>
            <span className={cn('text-lg font-bold font-mono tabular-nums', a.saldo >= 0 ? 'text-status-success' : 'text-status-danger')}>{sinal(a.saldo)}</span>
            <span className="text-muted-foreground"> no período{b.saldo !== null && ` · antes ${sinal(b.saldo)}`}</span>
          </>
        )}
      </div>
      <div>
        <Linha rotulo="Novos · Perdidos" valor={a.novos === null && a.perdidos === null ? '—' : `${int(a.novos)} · ${int(a.perdidos)}`} />
        <Linha rotulo="Visitas ao perfil" valor={int(a.visitas)}><Compara atual={a.visitas} anterior={b.visitas} porcento /></Linha>
        <Linha rotulo="Alcance" valor={int(a.alcance)}><Compara atual={a.alcance} anterior={b.alcance} porcento /></Linha>
        <Linha rotulo="Visualizações" valor={int(a.visualizacoes)}><Compara atual={a.visualizacoes} anterior={b.visualizacoes} porcento /></Linha>
        <Linha rotulo="Engajamento" valor={pctTexto(a.engajamento)}>
          <Compara atual={a.engajamento} anterior={b.engajamento} unidade=" pontos" formato={(v) => (v === null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`)} />
        </Linha>
        <Linha rotulo="Feed · Reels · Stories" valor={`${int(a.feed)} · ${int(a.reels)} · ${int(a.stories)}`}>
          <span className="text-muted-foreground">era {int(b.feed)} · {int(b.reels)} · {int(b.stories)}</span>
        </Linha>
      </div>
    </Card>
  );
}

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

/** Os 3 posts que mais alcançaram e o alcance médio de cada formato (proposta de 2026-11-04). */
function PostsDaConta({ a }: { a: NumerosDaConta }) {
  const maior = Math.max(1, ...a.formatos.map((f) => f.media ?? 0));
  return (
    <Card className="p-4 space-y-3">
      <h3 className="text-sm font-semibold">{a.conta} · melhores posts</h3>
      {a.destaques.length === 0 ? <p className="text-[13px] text-muted-foreground">Nenhum post com números da Meta no período.</p> : (
        <ol className="space-y-2">
          {a.destaques.map((p) => (
            <li key={p.id} className="grid grid-cols-[1fr_auto] gap-2 text-[13px]">
              <span className="min-w-0">
                {p.link
                  ? <a href={p.link} target="_blank" rel="noreferrer" className="block truncate font-medium text-primary hover:underline" title={p.legenda ?? ''}>{p.legenda || 'Sem legenda'}</a>
                  : <span className="block truncate font-medium">{p.legenda || 'Sem legenda'}</span>}
                <span className="text-muted-foreground">{NOME_DO_FORMATO[p.tipo]} · {dataCurta(p.data)}{p.interacoes !== null && ` · ${int(p.interacoes)} interações`}</span>
              </span>
              <span className="text-right font-mono tabular-nums"><b>{int(p.alcance)}</b><br /><span className="text-muted-foreground text-[12px]">pessoas</span></span>
            </li>
          ))}
        </ol>
      )}
      <div className="space-y-1.5 border-t border-border/60 pt-2">
        <h4 className="text-[12px] uppercase tracking-wider text-muted-foreground">Alcance médio por publicação</h4>
        {a.formatos.map((f) => (
          <div key={f.tipo} className="grid grid-cols-[64px_1fr_auto] items-center gap-2 text-[13px]">
            <span>{NOME_DO_FORMATO[f.tipo]}</span>
            <div className="h-2 rounded bg-muted overflow-hidden"><div className="h-full rounded" style={{ width: `${((f.media ?? 0) / maior) * 100}%`, background: corDaConta(a.conta) }} /></div>
            <span className="font-mono tabular-nums whitespace-nowrap">{int(f.media)} <span className="text-muted-foreground text-[12px]">({f.quantas})</span></span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Quem segue a conta e quando fica online (proposta de 2026-11-04): o mês mais novo até o fim do período. */
export function QuemSegue({ resumos }: { resumos: ResumoDoPublico[] }) {
  if (!resumos.length) return null;
  const mes = new Date(`${resumos[0].mes}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Quem segue</h3>
      <div className="grid gap-3 md:grid-cols-3">
        {resumos.map((r) => (
          <Card key={r.conta} className="p-4 space-y-2" style={{ borderTop: `3px solid ${corDaConta(r.conta)}` }}>
            <h4 className="text-[15px] font-semibold">{r.conta}</h4>
            <div>
              <Linha rotulo="Mulheres" valor={pctTexto(r.mulheres)} />
              <Linha rotulo="Idade" valor={fatias(r.faixas)} />
              <Linha rotulo="No Brasil" valor={pctTexto(r.brasil)}>
                {r.fora.length > 0 && <span className="text-muted-foreground">fora: {fatias(r.fora, nomeDoPais)}</span>}
              </Linha>
              <Linha rotulo="Cidades" valor={fatias(r.cidades)} />
              <Linha rotulo="Mais online" valor={horariosTexto(r.horarios) || 'a Meta não entregou'} />
            </div>
            {r.grade && (
              <div className="grid grid-cols-[28px_repeat(8,minmax(0,1fr))] gap-0.5 text-[10px] text-muted-foreground" aria-label="Seguidores online por dia e faixa de 3 horas">
                <span />{Array.from({ length: 8 }, (_, b) => <span key={b} className="text-center">{b * 3}h</span>)}
                {r.grade.map((linha, d) => [
                  <span key={`d${d}`}>{DIAS[d]}</span>,
                  ...linha.map((v, b) => <span key={`${d}-${b}`} className="h-3.5 rounded-sm bg-primary" style={{ opacity: 0.08 + v * 0.92 }} title={`${DIAS[d]} ${b * 3}h–${b * 3 + 3}h`} />),
                ])}
              </div>
            )}
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Dados de {mes}, da Meta (Insights › Público). Horários em Brasília, na média dos últimos 30 dias; quanto mais escuro,
        mais seguidores online. Aparece nos períodos de um mês ou mais.
      </p>
    </div>
  );
}

// ─── Apresentação: até quatro números grandes por tela ─────────────────────────────────────────────────────────────────

export interface NumeroGrande { rotulo: string; valor: string; nota?: ReactNode; tom?: 'bom' | 'ruim' }
export function NumerosGrandes({ numeros, frase }: { numeros: NumeroGrande[]; frase?: string }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {numeros.map((n) => (
          <div key={n.rotulo} className="rounded-lg border bg-card p-5">
            <div className="text-base text-muted-foreground">{n.rotulo}</div>
            <div className={cn('text-5xl font-bold font-mono tabular-nums leading-tight', n.tom === 'bom' && 'text-status-success', n.tom === 'ruim' && 'text-status-danger')}>{n.valor}</div>
            {n.nota && <div className="mt-1 text-base">{n.nota}</div>}
          </div>
        ))}
      </div>
      {frase && <p className="text-xl text-foreground">{frase}</p>}
    </div>
  );
}
export { Compara };

// ─── Lançar semana: um formulário só (Hick) ───────────────────────────────────────────────────────────────────────────

interface Campo { k: string; rotulo: string }
const CAMPOS_DA_CONTA: Campo[] = [
  { k: 'posts', rotulo: 'Posts no feed' }, { k: 'reels', rotulo: 'Reels' }, { k: 'stories', rotulo: 'Sequências de stories' },
  { k: 'engajamento', rotulo: 'Taxa de engajamento (%)' }, { k: 'total_seguidores', rotulo: 'Total de seguidores (domingo)' },
  { k: 'novos_seguidores', rotulo: 'Novos seguidores' }, { k: 'quedas_seguidores', rotulo: 'Deixaram de seguir' },
  { k: 'visitas_perfil', rotulo: 'Visitas ao perfil' },
];
const CAMPOS_DO_TRAFEGO_DA_CONTA: Campo[] = [
  { k: 'investimento', rotulo: 'Investimento (R$)' }, { k: 'alcance_pago', rotulo: 'Alcance' },
  { k: 'visitas_pagas', rotulo: 'Visitas ao perfil (tráfego)' }, { k: 'campanhas_ativas', rotulo: 'Campanhas no ar' },
];
const CAMPOS_DO_TOTAL: Campo[] = [
  { k: 'investimento', rotulo: 'Investimento total (R$)' }, { k: 'alcance', rotulo: 'Alcance total' },
  { k: 'visitas_perfil', rotulo: 'Visitas ao perfil (tráfego)' }, { k: 'campanhas_ativas', rotulo: 'Campanhas no ar' },
];
const ABA_DO_TOTAL = 'trafego';
const paraTexto = (v: unknown) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
const lerCampo = (t: string, rotulo: string): number | null => {
  const s = t.trim().replace('%', '').replace(/\./g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  if (Number.isNaN(n) || n < 0) throw new Error(`${rotulo}: escreva um número.`);
  return n;
};

export function LancarSemana({ onFechar }: { onFechar: () => void }) {
  // O domingo que fecha a semana passada (a reunião de segunda olha a semana que acabou).
  const [dia, setDia] = useState(() => somarDias(todayISO(), -7));
  const domingo = dia ? domingoDaSemana(dia) : '';
  const s = useSemanaParaLancar(domingo);
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Lançar semana · Redes sociais e Tráfego pago</DialogTitle></DialogHeader>
        <div className="space-y-1.5 max-w-xs">
          <Label htmlFor="ls-dia">Um dia da semana</Label>
          <input id="ls-dia" type="date" max={todayISO()} className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
            value={dia} onChange={(e) => setDia(e.target.value)} />
          {domingo && <p className="text-xs text-muted-foreground">Semana de {ddmm(somarDias(domingo, -6))} a {ddmm(domingo)}. Em cinza, o número da semana anterior.</p>}
        </div>
        {!domingo ? null : s.carregando ? <p className="text-sm text-muted-foreground">Carregando a semana…</p> : (
          <FormularioDaSemana key={domingo} domingo={domingo} anterior={s.anterior} redes={s.redes} trafego={s.trafego} onFechar={onFechar} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function FormularioDaSemana({ domingo, anterior, redes, trafego, onFechar }: {
  domingo: string; anterior: string; redes: LinhaRedes[]; trafego: LinhaTrafego[]; onFechar: () => void;
}) {
  const qc = useQueryClient();
  const linha = (aba: string, semana: string): Record<string, unknown> | undefined =>
    (aba === ABA_DO_TOTAL ? trafego.find((t) => t.semana === semana) : redes.find((r) => r.semana === semana && r.conta === aba)) as unknown as Record<string, unknown> | undefined;
  const camposDa = (aba: string) => (aba === ABA_DO_TOTAL ? CAMPOS_DO_TOTAL : [...CAMPOS_DA_CONTA, ...CAMPOS_DO_TRAFEGO_DA_CONTA]);
  const abas = [ABA_DO_TOTAL, ...CONTAS];
  // O que já está lançado na semana vem preenchido: lançar de novo corrige.
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(
    abas.flatMap((aba) => camposDa(aba).map((c) => [`${aba}|${c.k}`, paraTexto(linha(aba, domingo)?.[c.k])])),
  ));

  const salvar = useMutation({
    mutationFn: async () => {
      const lidas = abas.map((aba) => ({
        aba, dados: Object.fromEntries(camposDa(aba).map((c) => [c.k, lerCampo(valores[`${aba}|${c.k}`] ?? '', c.rotulo)])) as Record<string, number | null>,
      }));
      const contas = lidas.filter((l) => l.aba !== ABA_DO_TOTAL && Object.values(l.dados).some((v) => v !== null));
      const total = lidas.find((l) => l.aba === ABA_DO_TOTAL)!.dados;
      // Sem o investimento total, ele é a soma das contas (como a proposta pede).
      const somaDasContas = contas.reduce((s, c) => s + (c.dados.investimento ?? 0), 0);
      if (total.investimento === null && contas.some((c) => c.dados.investimento !== null)) total.investimento = Math.round(somaDasContas * 100) / 100;
      if (!contas.length && Object.values(total).every((v) => v === null)) throw new Error('Preencha pelo menos um número.');
      // Upsert grava só as colunas enviadas: a observação e as campanhas que o coletor da Meta trouxe ficam.
      if (contas.length) {
        expectRows(await supabase.from('mkt_redes_semana' as never)
          .upsert(contas.map((c) => ({ semana: domingo, conta: c.aba, ...c.dados })) as never, { onConflict: 'tenant_id,semana,conta' }).select('id'), 'a semana das contas');
      }
      if (Object.values(total).some((v) => v !== null)) {
        expectRows(await supabase.from('mkt_trafego_semana' as never)
          .upsert({ semana: domingo, ...total } as never, { onConflict: 'tenant_id,semana' }).select('id'), 'o tráfego da semana');
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [CHAVE_DAS_SEMANAS] }); toast.success('Semana lançada.'); onFechar(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const campo = (aba: string, c: Campo) => {
    const id = `ls-${aba}-${c.k}`.replace(/[@.]/g, '');
    const antes = paraTexto(linha(aba, anterior)?.[c.k]);
    return (
      <div key={id} className="space-y-1">
        <Label htmlFor={id} className="text-xs">{c.rotulo}</Label>
        <Input id={id} inputMode="decimal" className="font-mono" placeholder={antes ? `era ${antes}` : ''}
          value={valores[`${aba}|${c.k}`] ?? ''} onChange={(e) => setValores({ ...valores, [`${aba}|${c.k}`]: e.target.value })} />
      </div>
    );
  };

  return (
    <>
      <Tabs defaultValue={ABA_DO_TOTAL}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value={ABA_DO_TOTAL}>Tráfego total</TabsTrigger>
          {CONTAS.map((c) => <TabsTrigger key={c} value={c}>{c}</TabsTrigger>)}
        </TabsList>
        <TabsContent value={ABA_DO_TOTAL} className="space-y-2">
          <p className="text-xs text-muted-foreground">Total da conta de anúncios (Gerenciador de Anúncios › MF INTERNO - Marketing). Investimento em branco vira a soma das contas. Os leads vêm sozinhos do Kommo.</p>
          <div className="grid grid-cols-2 gap-3">{CAMPOS_DO_TOTAL.map((c) => campo(ABA_DO_TOTAL, c))}</div>
        </TabsContent>
        {CONTAS.map((conta) => (
          <TabsContent key={conta} value={conta} className="space-y-3">
            <div>
              <h4 className="text-sm font-semibold mb-2">Redes sociais</h4>
              <div className="grid grid-cols-2 gap-3">{CAMPOS_DA_CONTA.map((c) => campo(conta, c))}</div>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-2">Tráfego pago desta conta</h4>
              <div className="grid grid-cols-2 gap-3">{CAMPOS_DO_TRAFEGO_DA_CONTA.map((c) => campo(conta, c))}</div>
            </div>
          </TabsContent>
        ))}
      </Tabs>
      <p className="text-xs text-muted-foreground">Campo em branco fica sem número. Salvar grava todas as abas de uma vez; lançar de novo a mesma semana corrige.</p>
      <DialogFooter>
        <Button variant="outline" onClick={onFechar}>Cancelar</Button>
        <Button disabled={salvar.isPending} onClick={() => salvar.mutate()}>Salvar a semana</Button>
      </DialogFooter>
    </>
  );
}
