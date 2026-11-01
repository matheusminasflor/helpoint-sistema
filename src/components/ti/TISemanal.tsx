// TI › Indicadores › Semanal (dono, 2026-11-01; docs/proposta-indicadores-da-semana.md): o que a planilha da reunião
// de segunda tinha e o Helpoint não — a produtividade do FSENSE e as interrupções —, com as mesmas regras de semana,
// meta, comparativo e farol (`lib/ti-semanal`). Os chamados por categoria continuam nas outras abas.
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ClipboardPaste, Equal, Pencil, Plus, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmarExclusao } from '@/components/ui/ConfirmarExclusao';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useConfiguracaoDosSetores, usePodeVerEquipe } from '@/hooks/useAccessProfiles';
import { useMetasDosSetores, useSalvarMetaDoSetor } from '@/hooks/useDiretoria';
import { useQueryState } from '@/hooks/useQueryState';
import {
  TIPOS_DE_INTERRUPCAO, useApagarFsense, useApagarInterrupcao, useConfirmarFsense, useFsense, useInterrupcoes,
  useLancarFsense, useSalvarInterrupcao, type InterrupcaoDoBanco, type TipoDeInterrupcao,
} from '@/hooks/useTISemanal';
import { dataHora, daysFromTodayISO, diaCurto, fromLocalDateTimeInput, toLocalDateTimeInput, toLocalISODate } from '@/lib/dates';
import { mensagemDeErro } from '@/lib/supabase-result';
import {
  comparar, farol, horasParadas, lerColagem, mediaDaEquipe, metaDoPeriodo, periodoAnterior, periodoDaSemana,
  porColaborador, semanaDoDia, textoDoAnterior, dentro, type Comparativo, type Farol, type Semana, type Sentido,
} from '@/lib/ti-semanal';

// As metas da planilha antiga valem até a Diretoria escrever outras.
const META_PADRAO: Record<string, number> = { interrupcoes: 2, fsense_trabalho: 65, fsense_ocioso: 20 };

const num = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const pct = (v: number | null) => (v === null ? '—' : `${num(v)}%`);

const FAROL: Record<Farol, { texto: string; classe: string }> = {
  no_alvo: { texto: 'No alvo', classe: 'badge-success' },
  atencao: { texto: 'Atenção', classe: 'badge-warning' },
  fora: { texto: 'Fora', classe: 'badge-danger' },
  sem_meta: { texto: 'Sem meta', classe: 'badge-neutral' },
  sem_dado: { texto: 'Sem dado', classe: 'badge-neutral' },
};

function SeloDoFarol({ f }: { f: Farol }) {
  return <Badge variant="outline" className={`${FAROL[f].classe} border-0`}>{FAROL[f].texto}</Badge>;
}

function TextoDoComparativo({ c, s }: { c: Comparativo | null; s: Semana }) {
  if (!c) return <span className="text-muted-foreground">—</span>;
  const Icone = c === 'acima' ? ArrowUp : c === 'abaixo' ? ArrowDown : Equal;
  const texto = c === 'igual' ? (s === 0 ? 'Igual ao mês anterior' : 'Igual à semana anterior')
    : `${c === 'acima' ? 'Acima' : 'Abaixo'} ${textoDoAnterior(s)}`;
  return <span className="inline-flex items-center gap-1 text-sm"><Icone className="h-3.5 w-3.5" />{texto}</span>;
}

/** O dia que fecha a semana de ontem: na segunda de manhã, é o domingo. */
const ontem = () => daysFromTodayISO(-1);

export function TISemanal() {
  const [comp, setComp] = useQueryState<string>('comp', ontem().slice(0, 7));
  const [semTexto, setSem] = useQueryState<string>('sem', String(semanaDoDia(ontem())));
  const s = Number(semTexto) as Semana;
  const atual = periodoDaSemana(comp, s);
  const anterior = periodoAnterior(comp, s);
  const tudo = { de: anterior.de, ate: atual.ate };

  const fsense = useFsense(tudo);
  const interrupcoes = useInterrupcoes(tudo);
  const metas = useMetasDosSetores();
  const podeVerEquipe = usePodeVerEquipe('tickets');
  const perfil = useConfiguracaoDosSetores();
  const podeLancar = perfil.pode('ti', 'reports', 'lancar');
  const podeDefinirMetas = !perfil.isLoading && perfil.pode('diretoria', 'indicadores', 'definir_metas');
  const [editandoMeta, setEditandoMeta] = useState<{ chave: string; nome: string } | null>(null);

  const meta = (chave: string) => metas.data?.get(`ti.${chave}`) ?? META_PADRAO[chave];

  const confirmadas = (fsense.data ?? []).filter((l) => l.confirmado_em);
  const listaDeInterrupcoes = interrupcoes.data ?? [];
  const quantas = (p: typeof atual) => listaDeInterrupcoes.filter((i) => dentro(toLocalISODate(new Date(i.inicio)), p)).length;
  const contas = {
    doAtual: porColaborador(confirmadas, atual),
    doAnterior: porColaborador(confirmadas, anterior),
    interrupcoes: { atual: quantas(atual), anterior: quantas(anterior), horas: horasParadas(listaDeInterrupcoes, atual) },
  };

  const linhas: { chave: string; nome: string; sentido: Sentido; divide: boolean; atual: number | null; anterior: number | null;
    fmt: (v: number | null) => string; extra?: string }[] = [
    { chave: 'interrupcoes', nome: 'Interrupções (luz, internet, sistema, intranet, outras) ↓', sentido: 'menos', divide: true,
      atual: contas.interrupcoes.atual, anterior: contas.interrupcoes.anterior, fmt: (v) => (v === null ? '—' : num(v)),
      extra: contas.interrupcoes.horas > 0 ? `${num(contas.interrupcoes.horas)} h paradas` : undefined },
    ...(podeVerEquipe ? [
      { chave: 'fsense_trabalho', nome: '% Trabalho médio da equipe (FSENSE)', sentido: 'mais' as Sentido, divide: false,
        atual: mediaDaEquipe(contas.doAtual, 'trabalho'), anterior: mediaDaEquipe(contas.doAnterior, 'trabalho'), fmt: pct },
      { chave: 'fsense_ocioso', nome: '% Ocioso médio da equipe (FSENSE) ↓', sentido: 'menos' as Sentido, divide: false,
        atual: mediaDaEquipe(contas.doAtual, 'ocioso'), anterior: mediaDaEquipe(contas.doAnterior, 'ocioso'), fmt: pct },
    ] : []),
  ];

  const metaOcioso = meta('fsense_ocioso');

  return (
    <div className="space-y-6 mt-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="semanal-comp" className="text-xs">Competência</Label>
          <Input id="semanal-comp" type="month" value={comp} onChange={(e) => e.target.value && setComp(e.target.value)} className="h-9 w-[170px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Semana</Label>
          <Select value={String(s)} onValueChange={setSem}>
            <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Mês inteiro</SelectItem>
              <SelectItem value="1">S1 · dias 1 a 7</SelectItem>
              <SelectItem value="2">S2 · dias 8 a 14</SelectItem>
              <SelectItem value="3">S3 · dias 15 a 21</SelectItem>
              <SelectItem value="4">S4 · dia 22 ao fim</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground pb-2">
          {diaCurto(atual.de)} a {diaCurto(daysAntes(atual.ate))} · comparado com {diaCurto(anterior.de)} a {diaCurto(daysAntes(anterior.ate))}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Indicadores</CardTitle>
          <CardDescription>
            Meta mensal; a de quantidade vale ¼ na semana. Farol: no alvo na meta, atenção até 70% dela (ou até 130% quando
            menos é melhor, ↓), fora além disso. O FSENSE conta só semana confirmada.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Indicador</TableHead><TableHead>Meta mensal</TableHead><TableHead>Meta do período</TableHead>
                <TableHead>Anterior</TableHead><TableHead>Realizado</TableHead><TableHead>Comparativo</TableHead><TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => {
                const m = meta(l.chave);
                const mp = metaDoPeriodo(m, s, l.divide);
                return (
                  <TableRow key={l.chave}>
                    <TableCell className="font-medium">{l.nome}{l.extra && <span className="block text-xs text-muted-foreground font-normal">{l.extra}</span>}</TableCell>
                    <TableCell>
                      <span className="tabular-nums">{l.chave === 'interrupcoes' ? num(m) : pct(m)}</span>
                      {podeDefinirMetas && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 ml-1" aria-label={`Mudar a meta de ${l.nome}`}
                          onClick={() => setEditandoMeta({ chave: l.chave, nome: l.nome })}><Pencil className="h-3.5 w-3.5" /></Button>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{mp === undefined ? '—' : l.chave === 'interrupcoes' ? num(mp) : pct(mp)}</TableCell>
                    <TableCell className="tabular-nums">{l.fmt(l.anterior)}</TableCell>
                    <TableCell className="tabular-nums font-semibold">{l.fmt(l.atual)}</TableCell>
                    <TableCell><TextoDoComparativo c={comparar(l.atual, l.anterior)} s={s} /></TableCell>
                    <TableCell><SeloDoFarol f={farol(l.atual, mp, l.sentido)} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {podeVerEquipe && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Produtividade por colaborador</CardTitle>
            <CardDescription>Quem tem lançamento confirmado do FSENSE no período. O status olha o % ocioso contra a meta.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {contas.doAtual.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma semana do FSENSE confirmada neste período.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead><TableHead>Horas</TableHead><TableHead>% Trabalho</TableHead>
                    <TableHead>% Trab. anterior</TableHead><TableHead>% Ocioso</TableHead><TableHead>% Ocioso anterior</TableHead>
                    <TableHead>Comparativo (ocioso)</TableHead><TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contas.doAtual.map((c) => {
                    const antes = contas.doAnterior.find((a) => a.colaborador.toLowerCase() === c.colaborador.toLowerCase());
                    return (
                      <TableRow key={c.colaborador}>
                        <TableCell className="font-medium">{c.colaborador}</TableCell>
                        <TableCell className="tabular-nums">{num(c.horas)}</TableCell>
                        <TableCell className="tabular-nums">{pct(c.trabalho)}</TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">{pct(antes?.trabalho ?? null)}</TableCell>
                        <TableCell className="tabular-nums font-semibold">{pct(c.ocioso)}</TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">{pct(antes?.ocioso ?? null)}</TableCell>
                        <TableCell><TextoDoComparativo c={comparar(c.ocioso, antes?.ocioso ?? null)} s={s} /></TableCell>
                        <TableCell><SeloDoFarol f={farol(c.ocioso, metaOcioso, 'menos')} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {podeVerEquipe && <LancamentosDoFsense linhas={fsense.data ?? []} podeLancar={podeLancar} />}
      <ListaDeInterrupcoes lista={listaDeInterrupcoes.filter((i) => dentro(toLocalISODate(new Date(i.inicio)), atual))} podeLancar={podeLancar} />

      {editandoMeta && (
        <DialogoDaMeta chave={editandoMeta.chave} nome={editandoMeta.nome} atual={meta(editandoMeta.chave)} onFechar={() => setEditandoMeta(null)} />
      )}
    </div>
  );
}

/** O último dia de um período de `ate` exclusivo. */
function daysAntes(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return toLocalISODate(d);
}

function DialogoDaMeta({ chave, nome, atual, onFechar }: { chave: string; nome: string; atual: number | undefined; onFechar: () => void }) {
  const [valor, setValor] = useState(atual === undefined ? '' : String(atual).replace('.', ','));
  const salvar = useSalvarMetaDoSetor();
  const enviar = () => {
    const n = Number(valor.replace(',', '.'));
    if (valor.trim() === '' || Number.isNaN(n) || n < 0) { toast.error('Escreva um número (0 ou mais).'); return; }
    salvar.mutate({ setor: 'ti', indicador: chave, meta: n }, {
      onSuccess: () => { toast.success('Meta salva.'); onFechar(); },
      onError: (e) => toast.error(mensagemDeErro(e)),
    });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Meta mensal</DialogTitle>
          <DialogDescription>{nome}. Vale todo mês até alguém mudar.</DialogDescription>
        </DialogHeader>
        <Input id="semanal-meta" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={enviar} disabled={salvar.isPending}>Salvar meta</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── FSENSE: lançar, conferir e confirmar ────────────────────────────────────────────────────────────

function LancamentosDoFsense({ linhas, podeLancar }: { linhas: { id: string; data: string; colaborador: string; horas: number; trabalho: number | null; ocioso: number | null; confirmado_em: string | null }[]; podeLancar: boolean }) {
  const [lancando, setLancando] = useState(false);
  const [abertas, setAbertas] = useState<string | null>(null);
  const [apagando, setApagando] = useState<string | null>(null);
  const confirmar = useConfirmarFsense();
  const apagar = useApagarFsense();
  const semanas = [...new Set(linhas.map((l) => l.data))].sort().reverse();

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Lançamentos do FSENSE</CardTitle>
          <CardDescription>Cada semana entra "a confirmar" e só conta nos indicadores depois de alguém conferir e confirmar.</CardDescription>
        </div>
        {podeLancar && <Button size="sm" onClick={() => setLancando(true)}><ClipboardPaste className="h-4 w-4 mr-1.5" />Lançar semana</Button>}
      </CardHeader>
      <CardContent className="space-y-2">
        {semanas.length === 0 && <p className="text-sm text-muted-foreground">Nenhum lançamento neste período nem no anterior.</p>}
        {semanas.map((d) => {
          const daSemana = linhas.filter((l) => l.data === d);
          const pendente = daSemana.some((l) => !l.confirmado_em);
          return (
            <div key={d} className="rounded-md border">
              <div className="flex flex-wrap items-center gap-3 px-3 py-2">
                <button type="button" className="font-medium hover:underline" onClick={() => setAbertas(abertas === d ? null : d)}>
                  Semana até {diaCurto(d)} · {daSemana.length} {daSemana.length === 1 ? 'pessoa' : 'pessoas'}
                </button>
                <Badge variant="outline" className={`${pendente ? 'badge-warning' : 'badge-success'} border-0`}>{pendente ? 'A confirmar' : 'Confirmada'}</Badge>
                {pendente && podeLancar && (
                  <Button size="sm" variant="outline" className="ml-auto" disabled={confirmar.isPending}
                    onClick={() => confirmar.mutate(d, { onSuccess: () => toast.success('Semana confirmada. Já conta nos indicadores.'), onError: (e) => toast.error(mensagemDeErro(e)) })}>
                    <Check className="h-4 w-4 mr-1.5" />Confirmar semana
                  </Button>
                )}
              </div>
              {(abertas === d || pendente) && (
                <div className="border-t overflow-x-auto">
                  <Table>
                    <TableBody>
                      {daSemana.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="font-medium">{l.colaborador}</TableCell>
                          <TableCell className="tabular-nums">{num(l.horas)} h</TableCell>
                          <TableCell className="tabular-nums">trabalho {pct(l.trabalho)}</TableCell>
                          <TableCell className="tabular-nums">ocioso {pct(l.ocioso)}</TableCell>
                          <TableCell className="w-10">
                            {podeLancar && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Apagar a linha de ${l.colaborador}`} onClick={() => setApagando(l.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
      {lancando && <DialogoDeLancar onFechar={() => setLancando(false)} />}
      <ConfirmarExclusao aberto={!!apagando} titulo="Apagar esta linha?" descricao="A pessoa sai desta semana do FSENSE."
        enviando={apagar.isPending} onCancelar={() => setApagando(null)}
        onConfirmar={() => apagar.mutate(apagando!, { onSuccess: () => setApagando(null), onError: (e) => toast.error(mensagemDeErro(e)) })} />
    </Card>
  );
}

/** O último domingo (hoje, se hoje é domingo): o dia que fecha a semana do FSENSE. */
function ultimoDomingo(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return toLocalISODate(d);
}

function DialogoDeLancar({ onFechar }: { onFechar: () => void }) {
  const [data, setData] = useState(ultimoDomingo());
  const [texto, setTexto] = useState('');
  const lancar = useLancarFsense();
  const lido = useMemo(() => lerColagem(texto), [texto]);
  const enviar = () => lancar.mutate({ data, linhas: lido.linhas }, {
    onSuccess: () => { toast.success('Semana gravada. Confira e clique em "Confirmar semana".'); onFechar(); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Lançar semana do FSENSE</DialogTitle>
          <DialogDescription>
            Cole a tabela do FSENSE ou digite uma pessoa por linha: nome, horas e, na ordem, % trabalho, % bloqueada,
            % ocioso e % suspenso. Quem já está na semana é atualizado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="fsense-data">Dia que fecha a semana</Label>
          <Input id="fsense-data" type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-[180px]" />
        </div>
        <Textarea id="fsense-colar" rows={7} value={texto} onChange={(e) => setTexto(e.target.value)} className="font-mono text-sm"
          placeholder={'Gislene\t29,3\t65,6%\t4,7%\t2,5%\t27,2%\nFenicio\t30\t55,3%\t0,1%\t37,4%\t7,2%'} />
        {lido.erros.length > 0 && (
          <ul className="text-sm text-destructive space-y-0.5">{lido.erros.map((e) => <li key={e}>{e}</li>)}</ul>
        )}
        {lido.linhas.length > 0 && (
          <div className="max-h-56 overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Colaborador</TableHead><TableHead>Horas</TableHead><TableHead>Trabalho</TableHead><TableHead>Bloqueada</TableHead><TableHead>Ocioso</TableHead><TableHead>Suspenso</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {lido.linhas.map((l) => (
                  <TableRow key={l.colaborador}>
                    <TableCell>{l.colaborador}</TableCell><TableCell className="tabular-nums">{num(l.horas)}</TableCell>
                    <TableCell className="tabular-nums">{pct(l.trabalho)}</TableCell><TableCell className="tabular-nums">{pct(l.bloqueada)}</TableCell>
                    <TableCell className="tabular-nums">{pct(l.ocioso)}</TableCell><TableCell className="tabular-nums">{pct(l.suspenso)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={enviar} disabled={!data || lido.linhas.length === 0 || lido.erros.length > 0 || lancar.isPending}>
            Gravar {lido.linhas.length || ''} {lido.linhas.length === 1 ? 'pessoa' : 'pessoas'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Interrupções ────────────────────────────────────────────────────────────────────────────────────

function ListaDeInterrupcoes({ lista, podeLancar }: { lista: InterrupcaoDoBanco[]; podeLancar: boolean }) {
  const [editando, setEditando] = useState<InterrupcaoDoBanco | 'nova' | null>(null);
  const [apagando, setApagando] = useState<string | null>(null);
  const apagar = useApagarInterrupcao();

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Interrupções no período</CardTitle>
          <CardDescription>Queda de luz, internet, sistema ou intranet. Sem a hora de fim, ela conta como parada até agora.</CardDescription>
        </div>
        {podeLancar && <Button size="sm" onClick={() => setEditando('nova')}><Plus className="h-4 w-4 mr-1.5" />Registrar interrupção</Button>}
      </CardHeader>
      <CardContent>
        {lista.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma interrupção registrada neste período.</p> : (
          <ul className="divide-y">
            {lista.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <Zap className="h-4 w-4 text-warning shrink-0" />
                <span className="font-medium">{TIPOS_DE_INTERRUPCAO[i.tipo]}</span>
                <span className="text-sm text-muted-foreground">
                  {i.sem_horario ? `${diaCurto(toLocalISODate(new Date(i.inicio)))} · sem horário (planilha antiga)`
                    : `${dataHora(i.inicio)} → ${i.fim ? dataHora(i.fim) : 'ainda parado'}`}
                </span>
                {i.observacao && <span className="text-sm min-w-0 break-words">{i.observacao}</span>}
                {podeLancar && (
                  <span className="ml-auto flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Editar a interrupção" onClick={() => setEditando(i)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Apagar a interrupção" onClick={() => setApagando(i.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {editando && <DialogoDaInterrupcao inicial={editando === 'nova' ? null : editando} onFechar={() => setEditando(null)} />}
      <ConfirmarExclusao aberto={!!apagando} titulo="Apagar esta interrupção?" descricao="Ela sai da contagem dos indicadores."
        enviando={apagar.isPending} onCancelar={() => setApagando(null)}
        onConfirmar={() => apagar.mutate(apagando!, { onSuccess: () => setApagando(null), onError: (e) => toast.error(mensagemDeErro(e)) })} />
    </Card>
  );
}

function DialogoDaInterrupcao({ inicial, onFechar }: { inicial: InterrupcaoDoBanco | null; onFechar: () => void }) {
  const [tipo, setTipo] = useState<TipoDeInterrupcao>(inicial?.tipo ?? 'internet');
  const [inicio, setInicio] = useState(toLocalDateTimeInput(inicial?.inicio ?? new Date().toISOString()));
  const [fim, setFim] = useState(inicial?.fim ? toLocalDateTimeInput(inicial.fim) : '');
  const [observacao, setObservacao] = useState(inicial?.observacao ?? '');
  const salvar = useSalvarInterrupcao();
  const enviar = () => {
    try {
      const i = fromLocalDateTimeInput(inicio);
      const f = fim ? fromLocalDateTimeInput(fim) : null;
      if (f && f < i) { toast.error('O fim tem que ser depois do início.'); return; }
      salvar.mutate({ id: inicial?.id, tipo, inicio: i, fim: f, observacao: observacao.trim() || null }, {
        onSuccess: () => { toast.success('Interrupção salva.'); onFechar(); },
        onError: (e) => toast.error(mensagemDeErro(e)),
      });
    } catch (e) {
      toast.error(mensagemDeErro(e));
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{inicial ? 'Editar interrupção' : 'Registrar interrupção'}</DialogTitle>
          <DialogDescription>Deixe o fim vazio se ainda está parado; volte aqui para preencher quando voltar.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoDeInterrupcao)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TIPOS_DE_INTERRUPCAO).map(([v, t]) => <SelectItem key={v} value={v}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1"><Label htmlFor="int-inicio">Início</Label><Input id="int-inicio" type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="int-fim">Fim</Label><Input id="int-fim" type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label htmlFor="int-obs">Observação</Label><Textarea id="int-obs" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: queda de luz por acidente na rua" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={enviar} disabled={!inicio || salvar.isPending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
