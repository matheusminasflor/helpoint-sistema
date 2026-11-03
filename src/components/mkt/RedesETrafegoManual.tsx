// Redes sociais e tráfego pago lançados à mão, por semana (dono, 2026-11-03: "enquanto monta pela API da Meta, cria de
// forma manual onde posso preencher esses indicadores"). As abas "MKT - Redes" e "MKT - Tráfego e Comunidade" da
// planilha: a semana é o domingo que a fecha; uma linha por conta (redes) e uma por semana (tráfego). Tabelas
// `mkt_redes_semana` e `mkt_trafego_semana` (20270212250000). Entram no período as semanas cujo domingo está nele.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Megaphone, Plus, Share2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { expectRows, unwrap } from '@/lib/supabase-result';
import { formatBRL } from '@/lib/crm';
import { domingoDaSemana } from '@/lib/ti-equipe';
import { todayISO } from '@/lib/dates';

interface LinhaRedes {
  semana: string; conta: string; posts: number | null; reels: number | null; stories: number | null; engajamento: number | null;
  novos_seguidores: number | null; quedas_seguidores: number | null; total_seguidores: number | null; visitas_perfil: number | null;
  compartilhamentos: number | null;
}
interface LinhaTrafego {
  semana: string; investimento: number | null; alcance: number | null; visitas_perfil: number | null; campanhas_ativas: number | null;
  leads_distribuidor: number | null; leads_consumidor: number | null; leads_salao: number | null;
}

// Os nomes da planilha (aba "MKT - Redes"), que é como o histórico de outubro entrou.
const CONTAS = ['@minasflor', '@mf.pro', '@by.mf'];
const CAMPOS_REDES: { k: keyof LinhaRedes; rotulo: string }[] = [
  { k: 'posts', rotulo: 'Posts no feed' }, { k: 'reels', rotulo: 'Reels' }, { k: 'stories', rotulo: 'Sequências de stories' },
  { k: 'engajamento', rotulo: 'Taxa de engajamento (%)' }, { k: 'novos_seguidores', rotulo: 'Novos seguidores' },
  { k: 'quedas_seguidores', rotulo: 'Quedas de seguidores' }, { k: 'total_seguidores', rotulo: 'Total de seguidores' },
  { k: 'visitas_perfil', rotulo: 'Visitas ao perfil' }, { k: 'compartilhamentos', rotulo: 'Compartilhamentos' },
];
const CAMPOS_TRAFEGO: { k: keyof LinhaTrafego; rotulo: string }[] = [
  { k: 'investimento', rotulo: 'Investimento em tráfego (R$)' }, { k: 'alcance', rotulo: 'Alcance' },
  { k: 'visitas_perfil', rotulo: 'Visitas ao perfil (tráfego)' }, { k: 'campanhas_ativas', rotulo: 'Campanhas ativas' },
  { k: 'leads_distribuidor', rotulo: 'Leads — Distribuidor' }, { k: 'leads_consumidor', rotulo: 'Leads — Consumidor final' },
  { k: 'leads_salao', rotulo: 'Leads — Salão' },
];

function useSemanas<T>(tabela: string, de: string, ate: string) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['mkt-semanal', tabela, tenantId, de, ate],
    enabled: !!tenantId,
    queryFn: async (): Promise<T[]> =>
      (unwrap(await supabase.from(tabela as never).select('*').gte('semana', de).lte('semana', ate).order('semana')) ?? []) as unknown as T[],
  });
}

const n = (v: number | null | undefined) => Number(v ?? 0);
const soma = <T,>(linhas: T[], k: keyof T) => linhas.reduce((s, l) => s + n(l[k] as number | null), 0);
const int = (v: number) => v.toLocaleString('pt-BR');
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function Numero({ v, rotulo }: { v: string; rotulo: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xl font-bold font-mono text-foreground tabular-nums whitespace-nowrap">{v}</div>
      <div className="text-[12px] uppercase tracking-wider text-muted-foreground">{rotulo}</div>
    </div>
  );
}

export function RedesETrafegoManual({ de, ate, podeLancar }: { de: string; ate: string; podeLancar: boolean }) {
  const { data: redes = [] } = useSemanas<LinhaRedes>('mkt_redes_semana', de, ate);
  const { data: trafego = [] } = useSemanas<LinhaTrafego>('mkt_trafego_semana', de, ate);
  const [lancando, setLancando] = useState<'redes' | 'trafego' | null>(null);
  const contas = [...new Set([...CONTAS, ...redes.map((r) => r.conta)])].filter((c) => redes.some((r) => r.conta === c));
  const semanas = [...new Set([...redes.map((r) => r.semana), ...trafego.map((t) => t.semana)])].sort();
  const investimento = soma(trafego, 'investimento');
  const visitasTrafego = soma(trafego, 'visitas_perfil');
  const ultimaTrafego = trafego[trafego.length - 1];

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Share2 className="h-4 w-4 text-primary" aria-hidden="true" />Redes sociais</h3>
          {podeLancar && <Button size="sm" variant="outline" onClick={() => setLancando('redes')}><Plus className="h-3.5 w-3.5 mr-1" />Lançar semana</Button>}
        </div>
        {contas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma semana lançada no período.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-secondary/60 text-muted-foreground">
                  <th className="px-2 py-2 text-left font-semibold">Conta</th>
                  <th className="px-2 py-2 text-right font-semibold">Feed</th><th className="px-2 py-2 text-right font-semibold">Reels</th>
                  <th className="px-2 py-2 text-right font-semibold">Stories</th><th className="px-2 py-2 text-right font-semibold">Engaj.</th>
                  <th className="px-2 py-2 text-right font-semibold">Novos</th><th className="px-2 py-2 text-right font-semibold">Quedas</th>
                  <th className="px-2 py-2 text-right font-semibold">Seguidores</th><th className="px-2 py-2 text-right font-semibold">Visitas</th>
                  <th className="px-2 py-2 text-right font-semibold">Compart.</th>
                </tr>
              </thead>
              <tbody>
                {contas.map((c) => {
                  const l = redes.filter((r) => r.conta === c);
                  const engs = l.filter((r) => r.engajamento !== null);
                  const ultimo = [...l].reverse().find((r) => r.total_seguidores !== null);
                  const td = 'px-2 py-2 text-right font-mono tabular-nums';
                  return (
                    <tr key={c} className="border-b border-border">
                      <td className="px-2 py-2 font-medium whitespace-nowrap">{c}</td>
                      <td className={td}>{int(soma(l, 'posts'))}</td><td className={td}>{int(soma(l, 'reels'))}</td>
                      <td className={td}>{int(soma(l, 'stories'))}</td>
                      <td className={td}>{engs.length ? `${(soma(engs, 'engajamento') / engs.length).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—'}</td>
                      <td className={td}>{int(soma(l, 'novos_seguidores'))}</td><td className={td}>{int(soma(l, 'quedas_seguidores'))}</td>
                      <td className={td}>{ultimo ? int(n(ultimo.total_seguidores)) : '—'}</td>
                      <td className={td}>{int(soma(l, 'visitas_perfil'))}</td><td className={td}>{int(soma(l, 'compartilhamentos'))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Lançado à mão por semana (domingo que a fecha){semanas.length ? `: ${semanas.map(ddmm).join(', ')}` : ''}. Seguidores é o total do fim do período; engajamento, a média das semanas.
        </p>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Megaphone className="h-4 w-4 text-primary" aria-hidden="true" />Tráfego pago e leads</h3>
          {podeLancar && <Button size="sm" variant="outline" onClick={() => setLancando('trafego')}><Plus className="h-3.5 w-3.5 mr-1" />Lançar semana</Button>}
        </div>
        {trafego.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma semana lançada no período.</p> : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Numero v={formatBRL(investimento)} rotulo="Investimento" />
            <Numero v={int(soma(trafego, 'alcance'))} rotulo="Alcance" />
            <Numero v={int(visitasTrafego)} rotulo="Visitas ao perfil" />
            <Numero v={visitasTrafego ? formatBRL(investimento / visitasTrafego) : '—'} rotulo="Custo por visita" />
            <Numero v={ultimaTrafego?.campanhas_ativas === null || !ultimaTrafego ? '—' : int(n(ultimaTrafego.campanhas_ativas))} rotulo="Campanhas ativas (fim)" />
            <Numero v={int(soma(trafego, 'leads_distribuidor') + soma(trafego, 'leads_consumidor') + soma(trafego, 'leads_salao'))} rotulo="Leads no total" />
            <Numero v={int(soma(trafego, 'leads_distribuidor'))} rotulo="Leads — Distribuidor" />
            <Numero v={int(soma(trafego, 'leads_consumidor'))} rotulo="Leads — Consumidor final" />
            <Numero v={int(soma(trafego, 'leads_salao'))} rotulo="Leads — Salão" />
          </div>
        )}
        <p className="text-xs text-muted-foreground">Lançado à mão por semana. Quando a Meta e o Kommo estiverem ligados, estes números passam a vir sozinhos.</p>
      </Card>

      {lancando && <LancarSemana tipo={lancando} onFechar={() => setLancando(null)} />}
    </div>
  );
}

function LancarSemana({ tipo, onFechar }: { tipo: 'redes' | 'trafego'; onFechar: () => void }) {
  const qc = useQueryClient();
  // O domingo que fecha a semana passada (a reunião de segunda olha a semana que acabou).
  const [semana, setSemana] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return domingoDaSemana(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  });
  const [conta, setConta] = useState(CONTAS[0]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const campos = tipo === 'redes' ? CAMPOS_REDES : CAMPOS_TRAFEGO;
  const domingo = semana ? domingoDaSemana(semana) : '';
  const salvar = useMutation({
    mutationFn: async () => {
      const dados: Record<string, unknown> = { semana: domingo };
      if (tipo === 'redes') dados.conta = conta.trim().toLowerCase();
      for (const c of campos) {
        const t = (valores[c.k as string] ?? '').trim().replace('%', '').replace(/\./g, '').replace(',', '.');
        dados[c.k as string] = t === '' ? null : Number(t);
        if (t !== '' && (Number.isNaN(Number(t)) || Number(t) < 0)) throw new Error(`${c.rotulo}: escreva um número.`);
      }
      const tabela = tipo === 'redes' ? 'mkt_redes_semana' : 'mkt_trafego_semana';
      expectRows(await supabase.from(tabela as never)
        .upsert(dados as never, { onConflict: tipo === 'redes' ? 'tenant_id,semana,conta' : 'tenant_id,semana' }).select('id'), 'a semana');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mkt-semanal'] }); toast.success('Semana lançada.'); onFechar(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{tipo === 'redes' ? 'Lançar semana · Redes sociais' : 'Lançar semana · Tráfego pago e leads'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ls-semana">Um dia da semana</Label>
              <input id="ls-semana" type="date" max={todayISO()} className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
                value={semana} onChange={(e) => setSemana(e.target.value)} />
              {domingo && <p className="text-xs text-muted-foreground">Grava na semana que fecha no domingo {ddmm(domingo)}.</p>}
            </div>
            {tipo === 'redes' && (
              <div className="space-y-1.5">
                <Label htmlFor="ls-conta">Conta</Label>
                <Input id="ls-conta" list="ls-contas" value={conta} onChange={(e) => setConta(e.target.value)} />
                <datalist id="ls-contas">{CONTAS.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {campos.map((c) => (
              <div key={c.k as string} className="space-y-1.5">
                <Label htmlFor={`ls-${c.k as string}`} className="text-xs">{c.rotulo}</Label>
                <Input id={`ls-${c.k as string}`} inputMode="decimal" className="font-mono"
                  value={valores[c.k as string] ?? ''} onChange={(e) => setValores({ ...valores, [c.k as string]: e.target.value })} />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Campo em branco fica sem número. Lançar de novo a mesma semana{tipo === 'redes' ? ' e conta' : ''} substitui.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button disabled={!domingo || salvar.isPending || (tipo === 'redes' && !conta.trim())} onClick={() => salvar.mutate()}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
