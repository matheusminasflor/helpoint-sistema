// Redes sociais e Tráfego pago na Visão Geral do Marketing (proposta v3, aprovada em 2026-11-03,
// https://claude.ai/artifact/Y2GAVmTspQUQNtsgrErFZZ). Leis de UX da proposta:
//   · comparação ao lado: todo número mostra o do período anterior e a seta com a cor certa (cair é bom em custo);
//   · semelhança: as três contas no mesmo cartão, na mesma ordem, nas redes e no tráfego;
//   · Hick: um botão só, "Lançar semana", com o tráfego e as três contas no mesmo formulário;
//   · Zeigarnik: o que falta lançar na semana aparece no topo.
// As contas estão em `lib/redes-e-trafego` (com Vitest); as semanas vêm de `useRedesETrafego`.
import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, Eye, Megaphone, MousePointerClick, Plus, Share2, UserPlus, Users, Wallet } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { KPICard } from '@/components/glpi/KPICard';
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
  CONTAS, faltaLancar, type LinhaRedes, type LinhaTrafego, type NumerosDaConta, type Painel, type SemanaNoGrafico,
} from '@/lib/redes-e-trafego';

const int = (v: number | null) => (v === null ? '—' : Math.round(v).toLocaleString('pt-BR'));
const brl = (v: number | null) => (v === null ? '—' : formatBRL(v));
const pctTexto = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`);
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const sinal = (n: number) => (n > 0 ? `+${n.toLocaleString('pt-BR')}` : n.toLocaleString('pt-BR').replace('-', '−'));
const corDaConta = (conta: string) => SERIES[Math.max(0, CONTAS.indexOf(conta)) % SERIES.length];

type Melhor = 'mais' | 'menos' | 'neutro';

/** "▲ +12% · era 2.300": a cor diz se foi bom (verde) ou ruim (laranja); investimento não tem cor. */
function Compara({ atual, anterior, melhor = 'mais', formato = int, porcento = false }: {
  atual: number | null; anterior: number | null; melhor?: Melhor; formato?: (v: number | null) => string; porcento?: boolean;
}) {
  if (atual === null || anterior === null) return <span className="text-muted-foreground">{anterior === null ? 'sem anterior' : ''}</span>;
  const dif = atual - anterior;
  if (Math.abs(dif) < 1e-9) return <span className="text-muted-foreground">igual · era {formato(anterior)}</span>;
  const bom = melhor === 'neutro' ? null : (melhor === 'mais') === dif > 0;
  const quanto = porcento && anterior !== 0 ? `${dif > 0 ? '+' : '−'}${Math.round(Math.abs(dif / anterior) * 100)}%` : `${dif > 0 ? '+' : '−'}${formato(Math.abs(dif))}`;
  return (
    <span className="whitespace-nowrap">
      <span className={cn('font-semibold', bom === null ? 'text-muted-foreground' : bom ? 'text-status-success' : 'text-aviso')}>
        {dif > 0 ? '▲' : '▼'} {quanto}
      </span>
      <span className="text-muted-foreground"> · era {formato(anterior)}</span>
    </span>
  );
}

function Linha({ rotulo, valor, children }: { rotulo: string; valor: string; children?: ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-3 py-1.5 border-b border-border/60 last:border-0 text-[13px]">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="font-mono tabular-nums text-right text-foreground">{valor}</span>
      {children && <span className="col-span-2 text-right text-[12px]">{children}</span>}
    </div>
  );
}

function Secao({ titulo, icone: Icone, acao, children }: { titulo: string; icone: typeof Share2; acao?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3" aria-label={titulo}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold flex items-center gap-2"><Icone className="h-4 w-4 text-primary" aria-hidden="true" />{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** Os cinco números do topo, com o anterior (o KPICard já desenha a seta e a cor). */
export function NumerosDoTopo({ painel }: { painel: Painel }) {
  const t = painel.trafego;
  return (
    <KPIGrid lgCols={5} className="mb-0">
      <KPICard value={int(painel.total.seguidores)} numero={painel.total.seguidores} label="Seguidores (todas as contas)" icon={Users} color="blue"
        anterior={painel.total.seguidoresAntes} melhorQuando="mais" formatarDiferenca={(n) => n.toLocaleString('pt-BR')} />
      <KPICard value={int(painel.total.visitas)} numero={painel.total.visitas} label="Visitas ao perfil (orgânico)" icon={Eye} color="purple"
        anterior={painel.total.visitasAntes} melhorQuando="mais" formatarDiferenca={(n) => n.toLocaleString('pt-BR')} />
      <KPICard value={brl(t.atual.investimento)} numero={t.atual.investimento} label="Investimento em tráfego" icon={Wallet} color="grey"
        anterior={t.anterior.investimento} melhorQuando="neutro" formatarDiferenca={formatBRL} />
      <KPICard value={brl(t.atual.custoPorVisita)} numero={t.atual.custoPorVisita} label="Custo por visita (pago)" icon={MousePointerClick} color="orange"
        anterior={t.anterior.custoPorVisita} melhorQuando="menos" formatarDiferenca={formatBRL} />
      <KPICard value={int(t.atual.leadsClassificados)} numero={t.atual.leadsClassificados} label="Leads classificados" icon={UserPlus} color="green"
        anterior={t.anterior.leadsClassificados} melhorQuando="mais" formatarDiferenca={(n) => n.toLocaleString('pt-BR')} />
    </KPIGrid>
  );
}

/** O que falta lançar na última semana do período. */
export function LancamentoDaSemana({ redes, trafego, ate, podeLancar, onLancar }: {
  redes: LinhaRedes[]; trafego: LinhaTrafego[]; ate: string; podeLancar: boolean; onLancar: () => void;
}) {
  // A última semana fechada do período (o domingo até o fim dele).
  const semana = somarDias(domingoDaSemana(ate), domingoDaSemana(ate) > ate ? -7 : 0);
  const itens = faltaLancar(redes, trafego, semana);
  return (
    <div className="flex flex-wrap items-center gap-2" role="list" aria-label={`Lançamento da semana até ${ddmm(semana)}`}>
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lançamento da semana até {ddmm(semana)}</span>
      {itens.map((i) => (
        <span key={i.rotulo} role="listitem" className={cn('rounded-md px-2.5 py-1 text-[13px] font-semibold', i.ok ? 'badge-success' : 'badge-warning')}>
          {i.ok && <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />}{i.rotulo}
        </span>
      ))}
      {podeLancar && <Button size="sm" variant="outline" className="h-7" onClick={onLancar}><Plus className="h-3.5 w-3.5 mr-1" />Lançar semana</Button>}
    </div>
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
            <span className={cn('text-lg font-bold font-mono tabular-nums', a.saldo >= 0 ? 'text-status-success' : 'text-aviso')}>{sinal(a.saldo)}</span>
            <span className="text-muted-foreground"> no período{b.saldo !== null && ` · antes ${sinal(b.saldo)}`}</span>
          </>
        )}
      </div>
      <div>
        <Linha rotulo="Novos · Perdidos" valor={a.novos === null && a.perdidos === null ? '—' : `${int(a.novos)} · ${int(a.perdidos)}`}>
          {a.novos === null && a.perdidos === null && <span className="text-muted-foreground">lance à mão (Instagram › Insights › Seguidores)</span>}
        </Linha>
        <Linha rotulo="Visitas ao perfil" valor={int(a.visitas)}><Compara atual={a.visitas} anterior={b.visitas} porcento /></Linha>
        <Linha rotulo="Engajamento" valor={pctTexto(a.engajamento)}>
          <Compara atual={a.engajamento} anterior={b.engajamento} formato={(v) => (v === null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`)} />
        </Linha>
        <Linha rotulo="Compartilhamentos" valor={int(a.compartilhamentos)}><Compara atual={a.compartilhamentos} anterior={b.compartilhamentos} /></Linha>
        <Linha rotulo="Feed · Reels · Stories" valor={`${int(a.feed)} · ${int(a.reels)} · ${int(a.stories)}`}>
          <span className="text-muted-foreground">era {int(b.feed)} · {int(b.reels)} · {int(b.stories)}</span>
        </Linha>
      </div>
    </Card>
  );
}

export function RedesSociais({ painel, grafico, acao }: { painel: Painel; grafico: SemanaNoGrafico[]; acao?: ReactNode }) {
  const contas = painel.contas.map((c) => c.atual.conta);
  const barras = grafico.map((s) => ({ rotulo: ddmm(s.semana), ...s.saldos }));
  return (
    <Secao titulo="Redes sociais" icone={Share2} acao={acao}>
      <div className="grid gap-3 md:grid-cols-3">
        {painel.contas.map((c) => <CartaoDaRede key={c.atual.conta} a={c.atual} b={c.anterior} />)}
      </div>
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-2">Saldo de seguidores por semana · últimas {grafico.length}</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={barras}>
            <CartesianGrid strokeDasharray="3 3" stroke={COR.grade} vertical={false} />
            <XAxis dataKey="rotulo" tick={EIXO} />
            <YAxis tick={EIXO} width={40} allowDecimals={false} />
            <Tooltip content={<DicaDoGrafico />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {contas.map((c) => <Bar key={c} dataKey={c} name={c} stackId="saldo" fill={corDaConta(c)} />)}
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <p className="text-xs text-muted-foreground">
        O saldo é a diferença do total de seguidores de um domingo para o outro: é exato. Novos e perdidos separados são
        lançados à mão (Instagram › Insights › Seguidores): o saldo sozinho não separa os dois, porque +55 pode ser 100 que
        entraram e 45 que saíram.
      </p>
    </Secao>
  );
}

function CartaoDoTrafego({ a, b }: { a: NumerosDaConta; b: NumerosDaConta }) {
  const semAnuncio = !a.investimento && !b.investimento;
  return (
    <Card className="p-4 space-y-2" style={{ borderTop: `3px solid ${corDaConta(a.conta)}` }}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold">{a.conta}</h3>
        <span className="text-[13px] text-muted-foreground">{a.campanhasAtivas === null ? '' : `${a.campanhasAtivas} ${a.campanhasAtivas === 1 ? 'campanha no ar' : 'campanhas no ar'}`}</span>
      </div>
      <div className="text-xl font-bold font-mono tabular-nums">{brl(a.investimento)}</div>
      {semAnuncio ? <p className="text-[13px] text-muted-foreground">Sem anúncio neste período nem no anterior.</p> : (
        <>
          <div className="text-[13px]"><Compara atual={a.investimento} anterior={b.investimento} melhor="neutro" formato={brl} porcento /></div>
          <div>
            <Linha rotulo="Alcance" valor={int(a.alcancePago)}><Compara atual={a.alcancePago} anterior={b.alcancePago} porcento /></Linha>
            <Linha rotulo="Visitas ao perfil" valor={int(a.visitasPagas)}><Compara atual={a.visitasPagas} anterior={b.visitasPagas} porcento /></Linha>
            <Linha rotulo="Custo por visita" valor={brl(a.custoPorVisita)}><Compara atual={a.custoPorVisita} anterior={b.custoPorVisita} melhor="menos" formato={brl} /></Linha>
          </div>
          {a.campanhas.length > 0 && (
            <details className="text-[13px]">
              <summary className="cursor-pointer text-primary font-medium">Ver as {a.campanhas.length} campanhas</summary>
              <ul className="mt-2 space-y-1">
                {a.campanhas.map((c) => (
                  <li key={c.nome} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate" title={c.nome}>{c.nome}{!c.ativa && <span className="text-muted-foreground"> (pausada)</span>}</span>
                    <span className="font-mono tabular-nums whitespace-nowrap">{formatBRL(c.investimento)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </Card>
  );
}

/** O total da conta de anúncios e um cartão por conta de Instagram. */
export function TrafegoPorConta({ painel, acao }: { painel: Painel; acao?: ReactNode }) {
  const { atual: t, anterior: a } = painel.trafego;
  const total = [
    { rotulo: 'Investimento', v: brl(t.investimento), c: <Compara atual={t.investimento} anterior={a.investimento} melhor="neutro" formato={brl} porcento /> },
    { rotulo: 'Alcance', v: int(t.alcance), c: <Compara atual={t.alcance} anterior={a.alcance} porcento /> },
    { rotulo: 'Visitas ao perfil', v: int(t.visitas), c: <Compara atual={t.visitas} anterior={a.visitas} porcento /> },
    { rotulo: 'Custo por visita', v: brl(t.custoPorVisita), c: <Compara atual={t.custoPorVisita} anterior={a.custoPorVisita} melhor="menos" formato={brl} /> },
    { rotulo: 'Campanhas no ar', v: int(t.campanhasAtivas), c: <span className="text-muted-foreground">era {int(a.campanhasAtivas)}</span> },
  ];
  return (
    <Secao titulo="Tráfego pago" icone={Megaphone} acao={acao}>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {total.map((x) => (
          <Card key={x.rotulo} className="p-3">
            <div className="text-[12px] uppercase tracking-wider text-muted-foreground">{x.rotulo}</div>
            <div className="text-xl font-bold font-mono tabular-nums whitespace-nowrap">{x.v}</div>
            <div className="text-[12px]">{x.c}</div>
          </Card>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {painel.contas.map((c) => <CartaoDoTrafego key={c.atual.conta} a={c.atual} b={c.anterior} />)}
      </div>
      <p className="text-xs text-muted-foreground">
        O total é o da conta de anúncios. O alcance do total pode ser menor que a soma das contas, porque a mesma pessoa
        pode ver anúncios de duas contas.
      </p>
    </Secao>
  );
}

/** Os leads por funil do Kommo e o investimento × visitas das últimas semanas. */
export function LeadsEInvestimento({ painel, grafico }: { painel: Painel; grafico: SemanaNoGrafico[] }) {
  const { atual: t, anterior: a } = painel.trafego;
  const funis = [
    { rotulo: 'Salão', v: t.leads.salao, antes: a.leads.salao },
    { rotulo: 'Distribuidor', v: t.leads.distribuidor, antes: a.leads.distribuidor },
    { rotulo: 'Consumidor final', v: t.leads.consumidor, antes: a.leads.consumidor },
    { rotulo: 'Sem triagem (Entrada)', v: t.leads.semTriagem, antes: a.leads.semTriagem, cinza: true },
  ];
  const maior = Math.max(1, ...funis.map((f) => f.v ?? 0));
  const barras = grafico.map((s) => ({ rotulo: ddmm(s.semana), Investimento: s.investimento, Visitas: s.visitas }));
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold">Leads por funil (Kommo)</h3>
        <div className="space-y-2.5">
          {funis.map((f) => (
            <div key={f.rotulo} className="grid grid-cols-[150px_1fr_auto] items-center gap-3 text-[13px]">
              <span>{f.rotulo}</span>
              <div className="h-2.5 rounded bg-muted overflow-hidden">
                <div className={cn('h-full rounded', f.cinza ? 'bg-muted-foreground/40' : 'bg-primary')} style={{ width: `${((f.v ?? 0) / maior) * 100}%` }} />
              </div>
              <span className="font-mono tabular-nums whitespace-nowrap">{int(f.v)} <span className="text-muted-foreground">· era {int(f.antes)}</span></span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">O Kommo não registra de qual Instagram veio o lead: os leads ficam no total.</p>
      </Card>
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-2">Investimento × visitas · últimas {grafico.length} semanas</h3>
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
    </div>
  );
}

// ─── Lançar semana: um formulário só (Hick) ───────────────────────────────────────────────────────────────────────────

interface Campo { k: string; rotulo: string }
const CAMPOS_DA_CONTA: Campo[] = [
  { k: 'posts', rotulo: 'Posts no feed' }, { k: 'reels', rotulo: 'Reels' }, { k: 'stories', rotulo: 'Sequências de stories' },
  { k: 'engajamento', rotulo: 'Taxa de engajamento (%)' }, { k: 'total_seguidores', rotulo: 'Total de seguidores (domingo)' },
  { k: 'novos_seguidores', rotulo: 'Novos seguidores' }, { k: 'quedas_seguidores', rotulo: 'Deixaram de seguir' },
  { k: 'visitas_perfil', rotulo: 'Visitas ao perfil' }, { k: 'compartilhamentos', rotulo: 'Compartilhamentos' },
];
const CAMPOS_DO_TRAFEGO_DA_CONTA: Campo[] = [
  { k: 'investimento', rotulo: 'Investimento (R$)' }, { k: 'alcance_pago', rotulo: 'Alcance' },
  { k: 'visitas_pagas', rotulo: 'Visitas ao perfil (tráfego)' }, { k: 'campanhas_ativas', rotulo: 'Campanhas no ar' },
];
const CAMPOS_DO_TOTAL: Campo[] = [
  { k: 'investimento', rotulo: 'Investimento total (R$)' }, { k: 'alcance', rotulo: 'Alcance total' },
  { k: 'visitas_perfil', rotulo: 'Visitas ao perfil (tráfego)' }, { k: 'campanhas_ativas', rotulo: 'Campanhas no ar' },
  { k: 'leads_salao', rotulo: 'Leads — Salão' }, { k: 'leads_distribuidor', rotulo: 'Leads — Distribuidor' },
  { k: 'leads_consumidor', rotulo: 'Leads — Consumidor final' }, { k: 'leads_sem_triagem', rotulo: 'Leads — Sem triagem (Entrada)' },
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
          <TabsTrigger value={ABA_DO_TOTAL}>Tráfego e leads</TabsTrigger>
          {CONTAS.map((c) => <TabsTrigger key={c} value={c}>{c}</TabsTrigger>)}
        </TabsList>
        <TabsContent value={ABA_DO_TOTAL} className="space-y-2">
          <p className="text-xs text-muted-foreground">Total da conta de anúncios (Gerenciador de Anúncios › MF INTERNO - Marketing) e os leads de cada funil do Kommo. Investimento em branco vira a soma das contas.</p>
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
