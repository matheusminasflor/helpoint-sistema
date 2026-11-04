// Configurações › Integrações › Meta (proposta aprovada em 2026-11-04,
// https://claude.ai/artifact/TkNdvQJSmuor8FAUsHaaWM). O que acontece quando a ligação com a Meta cai: quem recebe o
// aviso, se abre chamado (categoria e prioridade), se entra nas Interrupções (tipo), depois de quantas horas sem busca
// conta como caída e com quantos dias de antecedência avisa o vencimento da chave. Quem faz é o banco
// (`ligacao_meta_caiu` / `ligacao_meta_voltou`, 20270212300000); aqui só se escolhe. Kommo e Bling entram aqui quando
// forem ligados.
import { type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PlugZap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { mensagemDeErro, unwrap } from '@/lib/supabase-result';
import { SETORES } from '@/lib/setores';
import { formatTICategoryLabel, useTICategories } from '@/hooks/useTICategories';
import { TIPOS_DE_INTERRUPCAO } from '@/hooks/useEquipeDaTI';
import { useTenantSettings, type ConfigDaLigacao } from '@/hooks/useTenantSettings';

/** O padrão aprovado; o banco usa o mesmo (`ligacao_meta_config`). */
const PADRAO: Required<Omit<ConfigDaLigacao, 'categoria'>> & Pick<ConfigDaLigacao, 'categoria'> = {
  ligado: true, setor: 'ti', chamado: true, categoria: undefined, prioridade: 'high', interrupcao: true, tipo: 'sistema', horas: 12, dias: 7,
};
const PRIORIDADES = [{ v: 'low', r: 'Baixa' }, { v: 'medium', r: 'Média' }, { v: 'high', r: 'Alta' }, { v: 'critical', r: 'Crítica' }];
const HORAS = [6, 12, 24, 48];
const DIAS = [3, 7, 15, 30];

interface Situacao { ok_em: string | null; coletado_em: string | null; caiu_em: string | null; caiu_motivo: string | null; chave_vence_em: string | null }
interface Queda { id: string; inicio: string; fim: string | null; observacao: string | null }

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const diasAte = (iso: string) => Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000);

function Linha({ id, rotulo, ajuda, children }: { id: string; rotulo: string; ajuda: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 py-3 first:border-0">
      <div className="min-w-0">
        <Label htmlFor={id}>{rotulo}</Label>
        <p className="text-xs text-muted-foreground">{ajuda}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function LigacoesComSistemasDeFora() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const { data: settings } = useTenantSettings();
  const { categories } = useTICategories('tickets');
  const ligacoes = settings?.alerts?.ligacoes ?? {};
  const cfg = { ...PADRAO, ...ligacoes.meta };

  const situacao = useQuery({
    queryKey: ['ligacao-meta-situacao', tenantId],
    enabled: !!tenantId,
    queryFn: async () => unwrap(await supabase.rpc('situacao_da_ligacao_meta' as never)) as unknown as Situacao | null,
  });
  const quedas = useQuery({
    queryKey: ['ligacao-meta-quedas', tenantId],
    enabled: !!tenantId,
    queryFn: async () => (unwrap(await supabase.from('ti_interrupcoes' as never).select('id, inicio, fim, observacao')
      .ilike('observacao', 'Ligação com a Meta%').order('inicio', { ascending: false }).limit(5)) ?? []) as unknown as Queda[],
  });

  // Grava a ligação inteira: `salvar_configuracao_da_aba` junta só o primeiro nível de `alerts`.
  const salvar = useMutation({
    mutationFn: async (meta: ConfigDaLigacao) =>
      unwrap(await supabase.rpc('salvar_configuracao_da_aba', { p_parte: 'alerts', p_valor: { ligacoes: { ...ligacoes, meta } } as never })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-settings', tenantId] });
      toast.success('Configuração salva');
    },
    onError: (e: unknown) => toast.error(mensagemDeErro(e)),
  });
  const mudar = (parte: Partial<ConfigDaLigacao>) => salvar.mutate({ ...ligacoes.meta, ...parte });

  const s = situacao.data;
  const categoriasAtivas = categories.filter((c) => c.is_active);
  const padraoDaCategoria = categoriasAtivas.find((c) => c.name === 'Sistemas Internos') ?? categoriasAtivas.find((c) => c.name === 'Sistemas');
  const categoria = cfg.categoria ?? padraoDaCategoria?.id ?? '';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><PlugZap className="h-4 w-4" />Ligações com sistemas de fora</CardTitle>
        <CardDescription>O que fazer quando a Meta parar de entregar os números dos Indicadores do Marketing.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
          <span className="font-semibold">Meta</span>
          {!s ? <span className="text-muted-foreground">não conectada</span> : s.caiu_em
            ? <span className="rounded-md badge-danger px-2 py-0.5 text-[13px] font-semibold">Caída desde {dataHora(s.caiu_em)}</span>
            : <span className="rounded-md badge-success px-2 py-0.5 text-[13px] font-semibold">Funcionando</span>}
          {s?.ok_em && <span className="text-muted-foreground">Última busca que deu certo: {dataHora(s.ok_em)}</span>}
          {s?.chave_vence_em && <span className="text-muted-foreground">A chave vence em {diasAte(s.chave_vence_em)} dias</span>}
          {s?.caiu_motivo && <span className="basis-full text-aviso">{s.caiu_motivo}</span>}
        </div>

        <div>
          <Linha id="lig-ligado" rotulo="Avisar quando cair" ajuda="Liga e desliga tudo deste cartão para a Meta">
            <Switch id="lig-ligado" checked={cfg.ligado} onCheckedChange={(v) => mudar({ ligado: v })} />
          </Linha>
          <Linha id="lig-setor" rotulo="Quem recebe o aviso" ajuda="As pessoas do setor, na Início e no celular">
            <Select value={cfg.setor} onValueChange={(v) => mudar({ setor: v })} disabled={!cfg.ligado}>
              <SelectTrigger id="lig-setor" className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>{SETORES.map((x) => <SelectItem key={x.value} value={x.value}>Setor de {x.label}</SelectItem>)}</SelectContent>
            </Select>
          </Linha>
          <Linha id="lig-chamado" rotulo="Abrir chamado na TI" ajuda="Em nome de quem conectou a Meta; categoria e prioridade do chamado">
            <Select value={categoria} onValueChange={(v) => mudar({ categoria: v })} disabled={!cfg.ligado || !cfg.chamado}>
              <SelectTrigger aria-label="Categoria do chamado" className="w-56"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>{categoriasAtivas.map((c) => <SelectItem key={c.id} value={c.id}>{formatTICategoryLabel(c, categories)}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={cfg.prioridade} onValueChange={(v) => mudar({ prioridade: v })} disabled={!cfg.ligado || !cfg.chamado}>
              <SelectTrigger aria-label="Prioridade do chamado" className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORIDADES.map((p) => <SelectItem key={p.v} value={p.v}>{p.r}</SelectItem>)}</SelectContent>
            </Select>
            <Switch id="lig-chamado" checked={cfg.chamado} onCheckedChange={(v) => mudar({ chamado: v })} disabled={!cfg.ligado} />
          </Linha>
          <Linha id="lig-interrupcao" rotulo="Registrar nas Interrupções" ajuda="Abre quando cai e fecha sozinha quando volta; conta nos Indicadores da TI">
            <Select value={cfg.tipo} onValueChange={(v) => mudar({ tipo: v })} disabled={!cfg.ligado || !cfg.interrupcao}>
              <SelectTrigger aria-label="Tipo da interrupção" className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(TIPOS_DE_INTERRUPCAO).map(([v, r]) => <SelectItem key={v} value={v}>{r}</SelectItem>)}</SelectContent>
            </Select>
            <Switch id="lig-interrupcao" checked={cfg.interrupcao} onCheckedChange={(v) => mudar({ interrupcao: v })} disabled={!cfg.ligado} />
          </Linha>
          <Linha id="lig-horas" rotulo="Considerar caída depois de" ajuda="Sem nenhuma busca que deu certo. A chave recusada pela Meta derruba na hora">
            <Select value={String(cfg.horas)} onValueChange={(v) => mudar({ horas: Number(v) })} disabled={!cfg.ligado}>
              <SelectTrigger id="lig-horas" className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>{HORAS.map((h) => <SelectItem key={h} value={String(h)}>{h} horas</SelectItem>)}</SelectContent>
            </Select>
          </Linha>
          <Linha id="lig-dias" rotulo="Avisar antes de a chave vencer" ajuda="A Meta informa a data de vencimento">
            <Select value={String(cfg.dias)} onValueChange={(v) => mudar({ dias: Number(v) })} disabled={!cfg.ligado}>
              <SelectTrigger id="lig-dias" className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>{DIAS.map((d) => <SelectItem key={d} value={String(d)}>{d} dias</SelectItem>)}</SelectContent>
            </Select>
          </Linha>
        </div>

        <div className="space-y-1">
          <h4 className="text-[12px] uppercase tracking-wider text-muted-foreground">Últimas quedas</h4>
          {(quedas.data ?? []).length === 0
            ? <p className="text-sm text-muted-foreground">Nenhuma queda registrada.</p>
            : (
              <ul className="space-y-1 text-sm">
                {(quedas.data ?? []).map((q) => (
                  <li key={q.id}>
                    {dataHora(q.inicio)} → {q.fim ? dataHora(q.fim) : <span className="text-aviso font-medium">ainda caída</span>}
                    <span className="text-muted-foreground"> · {q.observacao?.replace(/^Ligação com a Meta: /, '')}</span>
                  </li>
                ))}
              </ul>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
