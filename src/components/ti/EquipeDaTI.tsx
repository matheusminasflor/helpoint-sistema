// TI › Indicadores › bloco "Equipe" (dono, 2026-11-01; revisão aprovada): a produtividade do FSENSE e as interrupções,
// que a planilha da reunião de segunda tinha e o Helpoint não. Obedece ao filtro de período da tela e compara com o
// período anterior do mesmo tamanho, como os outros indicadores (`lib/ti-equipe`).
import { useEffect, useState, type ClipboardEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronDown, ClipboardPaste, Equal, Pencil, Plus, Trash2, Users, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ConfirmarExclusao } from '@/components/ui/ConfirmarExclusao';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useConfiguracaoDosSetores, usePodeVerEquipe } from '@/hooks/useAccessProfiles';
import { useMetasDosSetores, useSalvarMetaDoSetor } from '@/hooks/useDiretoria';
import {
  TIPOS_DE_INTERRUPCAO, useApagarFsense, useApagarInterrupcao, useConfirmarFsense, useEditarFsense, useFsense,
  useInterrupcoes, useLancarFsense, useSalvarInterrupcao, useUltimaSemanaDoFsense,
  type InterrupcaoDoBanco, type LinhaFsenseDoBanco, type TipoDeInterrupcao,
} from '@/hooks/useEquipeDaTI';
import { dataHora, diaCurto, fromLocalDateTimeInput, toLocalDateTimeInput, toLocalISODate } from '@/lib/dates';
import type { IntervaloDeDias } from '@/lib/period';
import { mensagemDeErro } from '@/lib/supabase-result';
import {
  comparar, dentro, diasDoPeriodo, farol, horasParadas, lerColagem, lerNumero, mediaAnteriorDosMesmos, mediaDaEquipe,
  metaDoPeriodo, periodoAnterior, periodoDoIntervalo, porColaborador, somaDosPercentuais,
  type Comparativo, type Farol, type LinhaColada, type Sentido,
} from '@/lib/ti-equipe';
import { cn } from '@/lib/utils';

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

function TextoDoComparativo({ c }: { c: Comparativo | null }) {
  if (!c) return <span className="text-muted-foreground">—</span>;
  const Icone = c === 'acima' ? ArrowUp : c === 'abaixo' ? ArrowDown : Equal;
  const texto = c === 'igual' ? 'Igual ao anterior' : c === 'acima' ? 'Acima do anterior' : 'Abaixo do anterior';
  return <span className="inline-flex items-center gap-1 text-sm"><Icone className="h-3.5 w-3.5" />{texto}</span>;
}

/** O bloco inteiro. `intervalo` é o do filtro do topo da tela (último dia incluído). */
export function EquipeDaTI({ intervalo }: { intervalo: IntervaloDeDias }) {
  const atual = periodoDoIntervalo(intervalo);
  const anterior = periodoAnterior(atual);
  const dias = diasDoPeriodo(atual);
  const tudo = { de: anterior.de, ate: atual.ate };

  const fsense = useFsense(tudo);
  const interrupcoes = useInterrupcoes(tudo);
  const metas = useMetasDosSetores();
  const podeVerEquipe = usePodeVerEquipe('tickets');
  const perfil = useConfiguracaoDosSetores();
  const podeLancar = perfil.pode('ti', 'reports', 'lancar');
  const podeDefinirMetas = !perfil.isLoading && perfil.pode('diretoria', 'indicadores', 'definir_metas');
  const [editandoMeta, setEditandoMeta] = useState<{ chave: string; nome: string } | null>(null);
  const [lancando, setLancando] = useState(false);
  const [registrando, setRegistrando] = useState(false);

  const meta = (chave: string) => metas.data?.get(`ti.${chave}`) ?? META_PADRAO[chave];

  // O FSENSE conta pela semana lançada (o dia que a fecha cai no período) e só depois de confirmada.
  const confirmadas = (fsense.data ?? []).filter((l) => l.confirmado_em);
  const doAtual = porColaborador(confirmadas, atual);
  const doAnterior = porColaborador(confirmadas, anterior);
  const listaDeInterrupcoes = interrupcoes.data ?? [];
  const doPeriodo = (p: typeof atual) => listaDeInterrupcoes.filter((i) => dentro(toLocalISODate(new Date(i.inicio)), p));
  const horas = horasParadas(listaDeInterrupcoes, atual);
  const lancamentos = (fsense.data ?? []).filter((l) => dentro(l.data, atual));

  const linhas: { chave: string; nome: string; sentido: Sentido; proporcional: boolean; atual: number | null; anterior: number | null;
    fmt: (v: number | null) => string; extra?: string }[] = [
    { chave: 'interrupcoes', nome: 'Interrupções (luz, internet, sistema, intranet) ↓', sentido: 'menos', proporcional: true,
      atual: doPeriodo(atual).length, anterior: doPeriodo(anterior).length, fmt: (v) => (v === null ? '—' : num(v)),
      extra: horas > 0 ? `${num(horas)} h paradas` : undefined },
    ...(podeVerEquipe ? [
      { chave: 'fsense_trabalho', nome: '% Trabalho médio da equipe', sentido: 'mais' as Sentido, proporcional: false,
        atual: mediaDaEquipe(doAtual, 'trabalho'), anterior: mediaAnteriorDosMesmos(doAtual, doAnterior, 'trabalho'), fmt: pct },
      { chave: 'fsense_ocioso', nome: '% Ocioso médio da equipe ↓', sentido: 'menos' as Sentido, proporcional: false,
        atual: mediaDaEquipe(doAtual, 'ocioso'), anterior: mediaAnteriorDosMesmos(doAtual, doAnterior, 'ocioso'), fmt: pct },
    ] : []),
  ];

  return (
    <Card className="p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Users className="h-4 w-4 text-primary" />Equipe · produtividade (FSENSE) e interrupções</h3>
          <p className="text-xs text-muted-foreground">
            Meta mensal: a de quantidade é proporcional aos dias do período. Farol: no alvo na meta, atenção até 70% dela (ou
            até 130% quando menos é melhor, ↓). O FSENSE conta só semana confirmada.
          </p>
        </div>
        {podeLancar && (
          <div className="flex flex-wrap gap-2">
            {podeVerEquipe && <Button size="sm" onClick={() => setLancando(true)}><ClipboardPaste className="h-4 w-4 mr-1.5" />Lançar semana do FSENSE</Button>}
            <Button size="sm" variant="outline" onClick={() => setRegistrando(true)}><Plus className="h-4 w-4 mr-1.5" />Registrar interrupção</Button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Indicador</TableHead><TableHead>Meta mensal</TableHead><TableHead>Meta do período</TableHead>
              <TableHead>Anterior</TableHead><TableHead>Realizado</TableHead><TableHead>Comparação</TableHead><TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l) => {
              const m = meta(l.chave);
              const mp = metaDoPeriodo(m, dias, l.proporcional);
              const formatoDaMeta = (v: number | undefined) => (v === undefined ? '—' : l.chave === 'interrupcoes' ? num(v) : pct(v));
              return (
                <TableRow key={l.chave}>
                  <TableCell className="font-medium">{l.nome}{l.extra && <span className="block text-xs text-muted-foreground font-normal">{l.extra}</span>}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className="tabular-nums">{formatoDaMeta(m)}</span>
                    {podeDefinirMetas && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 ml-1" aria-label={`Mudar a meta de ${l.nome}`}
                        onClick={() => setEditandoMeta({ chave: l.chave, nome: l.nome })}><Pencil className="h-3.5 w-3.5" /></Button>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">{formatoDaMeta(mp)}</TableCell>
                  <TableCell className="tabular-nums">{l.fmt(l.anterior)}</TableCell>
                  <TableCell className="tabular-nums font-semibold">{l.fmt(l.atual)}</TableCell>
                  <TableCell><TextoDoComparativo c={comparar(l.atual, l.anterior)} /></TableCell>
                  <TableCell><SeloDoFarol f={farol(l.atual, mp, l.sentido)} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {podeVerEquipe && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Por colaborador · o status olha o % ocioso</h4>
          {doAtual.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma semana do FSENSE confirmada neste período.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead><TableHead>Horas</TableHead><TableHead>% Trabalho</TableHead>
                    <TableHead>% Trab. anterior</TableHead><TableHead>% Ocioso</TableHead><TableHead>% Ocioso anterior</TableHead>
                    <TableHead>Comparação (ocioso)</TableHead><TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {doAtual.map((c) => {
                    const antes = doAnterior.find((a) => a.colaborador.toLowerCase() === c.colaborador.toLowerCase());
                    return (
                      <TableRow key={c.colaborador}>
                        <TableCell className="font-medium">{c.colaborador}</TableCell>
                        <TableCell className="tabular-nums">{num(c.horas)}</TableCell>
                        <TableCell className="tabular-nums">{pct(c.trabalho)}</TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">{pct(antes?.trabalho ?? null)}</TableCell>
                        <TableCell className="tabular-nums font-semibold">{pct(c.ocioso)}</TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">{pct(antes?.ocioso ?? null)}</TableCell>
                        <TableCell><TextoDoComparativo c={comparar(c.ocioso, antes?.ocioso ?? null)} /></TableCell>
                        <TableCell><SeloDoFarol f={farol(c.ocioso, meta('fsense_ocioso'), 'menos')} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {podeVerEquipe && <LancamentosDoFsense linhas={lancamentos} podeLancar={podeLancar} />}
      <ListaDeInterrupcoes lista={doPeriodo(atual)} podeLancar={podeLancar} />

      {lancando && <DialogoDaGrade onFechar={() => setLancando(false)} />}
      {registrando && <DialogoDaInterrupcao inicial={null} onFechar={() => setRegistrando(false)} />}
      {editandoMeta && (
        <DialogoDaMeta chave={editandoMeta.chave} nome={editandoMeta.nome} atual={meta(editandoMeta.chave)} onFechar={() => setEditandoMeta(null)} />
      )}
    </Card>
  );
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
        <Input id="equipe-meta" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={enviar} disabled={salvar.isPending}>Salvar meta</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Uma seção que abre e fecha dentro do bloco (fechada, a não ser que peça ação). */
function Secao({ titulo, aberta, children, acao }: { titulo: string; aberta: boolean; children: ReactNode; acao?: ReactNode }) {
  const [abrir, setAbrir] = useState(aberta);
  useEffect(() => { if (aberta) setAbrir(true); }, [aberta]);
  return (
    <Collapsible open={abrir} onOpenChange={setAbrir} className="border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <CollapsibleTrigger className="flex items-center gap-1.5 text-sm font-semibold text-foreground hover:underline">
          <ChevronDown className={cn('h-4 w-4 transition-transform', !abrir && '-rotate-90')} />{titulo}
        </CollapsibleTrigger>
        {acao}
      </div>
      <CollapsibleContent className="pt-3 space-y-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}

// ─── FSENSE: conferir, confirmar e corrigir ──────────────────────────────────────────────────────────

function LancamentosDoFsense({ linhas, podeLancar }: { linhas: LinhaFsenseDoBanco[]; podeLancar: boolean }) {
  const [apagando, setApagando] = useState<string | null>(null);
  const [corrigindo, setCorrigindo] = useState<LinhaFsenseDoBanco | null>(null);
  const confirmar = useConfirmarFsense();
  const apagar = useApagarFsense();
  const semanas = [...new Set(linhas.map((l) => l.data))].sort().reverse();
  const algumaPendente = linhas.some((l) => !l.confirmado_em);

  return (
    <Secao titulo={`Lançamentos do FSENSE no período (${semanas.length})`} aberta={algumaPendente}
      acao={algumaPendente ? <Badge variant="outline" className="badge-warning border-0">Semana a confirmar</Badge> : undefined}>
      {semanas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma semana lançada neste período.</p>}
      {semanas.map((d) => {
        const daSemana = linhas.filter((l) => l.data === d);
        const pendente = daSemana.some((l) => !l.confirmado_em);
        return (
          <div key={d} className="rounded-md border">
            <div className="flex flex-wrap items-center gap-3 px-3 py-2">
              <span className="font-medium">Semana até {diaCurto(d)} · {daSemana.length} {daSemana.length === 1 ? 'pessoa' : 'pessoas'}</span>
              <Badge variant="outline" className={`${pendente ? 'badge-warning' : 'badge-success'} border-0`}>{pendente ? 'A confirmar' : 'Confirmada'}</Badge>
              {pendente && podeLancar && (
                <Button size="sm" className="ml-auto" disabled={confirmar.isPending}
                  onClick={() => confirmar.mutate(d, { onSuccess: () => toast.success('Semana confirmada. Já conta nos indicadores.'), onError: (e) => toast.error(mensagemDeErro(e)) })}>
                  <Check className="h-4 w-4 mr-1.5" />Confirmar semana
                </Button>
              )}
            </div>
            <div className="border-t overflow-x-auto">
              <Table>
                <TableBody>
                  {daSemana.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.colaborador}</TableCell>
                      <TableCell className="tabular-nums">{num(l.horas)} h</TableCell>
                      <TableCell className="tabular-nums">trabalho {pct(l.trabalho)}</TableCell>
                      <TableCell className="tabular-nums">bloqueada {pct(l.bloqueada)}</TableCell>
                      <TableCell className="tabular-nums">ocioso {pct(l.ocioso)}</TableCell>
                      <TableCell className="tabular-nums">suspenso {pct(l.suspenso)}</TableCell>
                      <TableCell className="w-20 whitespace-nowrap text-right">
                        {podeLancar && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Corrigir a linha de ${l.colaborador}`} onClick={() => setCorrigindo(l)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Apagar a linha de ${l.colaborador}`} onClick={() => setApagando(l.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        );
      })}
      {corrigindo && <DialogoDeCorrigir linha={corrigindo} onFechar={() => setCorrigindo(null)} />}
      <ConfirmarExclusao aberto={!!apagando} titulo="Apagar esta linha?" descricao="A pessoa sai desta semana do FSENSE."
        enviando={apagar.isPending} onCancelar={() => setApagando(null)}
        onConfirmar={() => apagar.mutate(apagando!, { onSuccess: () => setApagando(null), onError: (e) => toast.error(mensagemDeErro(e)) })} />
    </Secao>
  );
}

const CAMPOS = [
  { chave: 'horas', rotulo: 'Horas' }, { chave: 'trabalho', rotulo: '% Trabalho' }, { chave: 'bloqueada', rotulo: '% Bloqueada' },
  { chave: 'ocioso', rotulo: '% Ocioso' }, { chave: 'suspenso', rotulo: '% Suspenso' },
] as const;
type Campo = (typeof CAMPOS)[number]['chave'];

const paraTexto = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v).replace('.', ','));

/** O que a célula tem: número, vazia, ou erro (não é número, ou percentual acima de 100). */
function lerCelula(campo: Campo, texto: string): { valor: number | null; erro: boolean } {
  const v = lerNumero(texto);
  if (v === null) return { valor: null, erro: false };
  const erro = Number.isNaN(v) || v < 0 || (campo !== 'horas' && v > 100);
  return { valor: erro ? null : v, erro };
}

/** Corrigir uma pessoa já lançada: o nome (para casar com o histórico) e os cinco números. */
function DialogoDeCorrigir({ linha, onFechar }: { linha: LinhaFsenseDoBanco; onFechar: () => void }) {
  const [nome, setNome] = useState(linha.colaborador);
  const [valores, setValores] = useState<Record<Campo, string>>(
    Object.fromEntries(CAMPOS.map((c) => [c.chave, paraTexto(linha[c.chave])])) as Record<Campo, string>);
  const editar = useEditarFsense();
  const lidos = Object.fromEntries(CAMPOS.map((c) => [c.chave, lerCelula(c.chave, valores[c.chave])])) as Record<Campo, ReturnType<typeof lerCelula>>;
  const enviar = () => {
    if (CAMPOS.some((c) => lidos[c.chave].erro)) { toast.error('Há número inválido (percentual vai de 0 a 100).'); return; }
    if (!nome.trim() || lidos.horas.valor === null) { toast.error('Preencha o nome e as horas.'); return; }
    editar.mutate({ id: linha.id, colaborador: nome, horas: lidos.horas.valor, trabalho: lidos.trabalho.valor,
      bloqueada: lidos.bloqueada.valor, ocioso: lidos.ocioso.valor, suspenso: lidos.suspenso.valor }, {
      onSuccess: () => { toast.success('Linha corrigida.'); onFechar(); },
      onError: (e) => toast.error(mensagemDeErro(e)),
    });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Corrigir linha do FSENSE</DialogTitle>
          <DialogDescription>Semana até {diaCurto(linha.data)}. O nome tem que ser igual ao das semanas anteriores para a comparação funcionar.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label htmlFor="corr-nome">Colaborador</Label><Input id="corr-nome" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {CAMPOS.map((c) => (
              <div key={c.chave} className="space-y-1">
                <Label htmlFor={`corr-${c.chave}`}>{c.rotulo}</Label>
                <Input id={`corr-${c.chave}`} inputMode="decimal" value={valores[c.chave]} aria-invalid={lidos[c.chave].erro}
                  className={cn(lidos[c.chave].erro && 'border-destructive')}
                  onChange={(e) => setValores({ ...valores, [c.chave]: e.target.value })} />
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={enviar} disabled={editar.isPending}>Salvar correção</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A última sexta (hoje, se hoje é sexta): a tarefa lê o FSENSE na sexta às 17h40 e a semana fecha nela. */
function ultimaSexta(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 2) % 7));
  return toLocalISODate(d);
}

interface LinhaDaGrade extends Record<Campo, string> { id: number; colaborador: string; antes?: LinhaFsenseDoBanco }

let proximoId = 1;
const linhaVazia = (colaborador = '', antes?: LinhaFsenseDoBanco): LinhaDaGrade =>
  ({ id: proximoId++, colaborador, horas: '', trabalho: '', bloqueada: '', ocioso: '', suspenso: '', antes });

/**
 * Lançar a semana numa grade como a planilha (Lei de Jakob): já vem com os nomes da semana anterior, Tab passa de
 * célula em célula, aceita as horas como o FSENSE mostra (Lei de Postel) e avisa quando os percentuais não fecham 100%.
 * Colar uma tabela em qualquer célula preenche a grade.
 */
function DialogoDaGrade({ onFechar }: { onFechar: () => void }) {
  const [data, setData] = useState(ultimaSexta());
  const [linhas, setLinhas] = useState<LinhaDaGrade[]>([]);
  const [tocou, setTocou] = useState(false);
  const ultima = useUltimaSemanaDoFsense(data);
  const lancar = useLancarFsense();

  useEffect(() => {
    if (tocou || !ultima.data) return;
    setLinhas(ultima.data.length ? ultima.data.map((l) => linhaVazia(l.colaborador, l)) : [linhaVazia()]);
  }, [ultima.data, tocou]);

  const mudar = (id: number, campo: Campo | 'colaborador', valor: string) => {
    setTocou(true);
    setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, [campo]: valor } : l)));
  };

  const colar = (e: ClipboardEvent) => {
    const texto = e.clipboardData.getData('text');
    if (!/[\t\n]/.test(texto)) return;
    e.preventDefault();
    const { linhas: coladas, erros } = lerColagem(texto);
    if (erros.length) toast.error(erros.join(' '));
    setTocou(true);
    setLinhas((ls) => {
      const novas = [...ls.filter((l) => l.colaborador.trim() || CAMPOS.some((c) => l[c.chave].trim()))];
      for (const c of coladas) {
        const valores = Object.fromEntries(CAMPOS.map((k) => [k.chave, paraTexto(c[k.chave])])) as Record<Campo, string>;
        const i = novas.findIndex((l) => l.colaborador.trim().toLowerCase() === c.colaborador.toLowerCase());
        if (i >= 0) novas[i] = { ...novas[i], ...valores };
        else novas.push({ ...linhaVazia(c.colaborador), ...valores });
      }
      return novas;
    });
  };

  const lidas = linhas.map((l) => ({
    linha: l,
    celulas: Object.fromEntries(CAMPOS.map((c) => [c.chave, lerCelula(c.chave, l[c.chave])])) as Record<Campo, ReturnType<typeof lerCelula>>,
  }));
  const preenchidas = lidas.filter(({ linha, celulas }) => linha.colaborador.trim() && celulas.horas.valor !== null);
  const temErro = lidas.some(({ celulas }) => CAMPOS.some((c) => celulas[c.chave].erro));
  const nomes = preenchidas.map(({ linha }) => linha.colaborador.trim().toLowerCase());
  const repetido = nomes.find((n, i) => nomes.indexOf(n) !== i);

  const enviar = () => {
    if (temErro) { toast.error('Há número inválido (percentual vai de 0 a 100).'); return; }
    if (repetido) { toast.error(`"${repetido}" aparece duas vezes.`); return; }
    const paraGravar: LinhaColada[] = preenchidas.map(({ linha, celulas }) => ({
      colaborador: linha.colaborador.trim(), horas: celulas.horas.valor!, trabalho: celulas.trabalho.valor,
      bloqueada: celulas.bloqueada.valor, ocioso: celulas.ocioso.valor, suspenso: celulas.suspenso.valor,
    }));
    lancar.mutate({ data, linhas: paraGravar }, {
      onSuccess: () => { toast.success('Semana gravada. Confira e clique em "Confirmar semana".'); onFechar(); },
      onError: (e) => toast.error(mensagemDeErro(e)),
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Lançar semana do FSENSE</DialogTitle>
          <DialogDescription>
            Uma linha por pessoa. Horas como "45h36m", "45:36" ou "45,6". Pode colar a tabela do FSENSE em qualquer
            célula. Quem já está na semana é atualizado, e a semana fica a confirmar.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="fsense-data">Semana até</Label>
            <Input id="fsense-data" type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-[170px]" />
          </div>
          <Button variant="outline" size="sm" onClick={() => { setTocou(true); setLinhas((ls) => [...ls, linhaVazia()]); }}>
            <Plus className="h-4 w-4 mr-1.5" />Pessoa
          </Button>
        </div>
        <div className="max-h-[55vh] overflow-auto rounded-md border" onPaste={colar}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[160px]">Colaborador</TableHead>
                {CAMPOS.map((c) => <TableHead key={c.chave} className="text-right min-w-[88px]">{c.rotulo}</TableHead>)}
                <TableHead>Soma</TableHead><TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lidas.map(({ linha, celulas }) => {
                const soma = somaDosPercentuais({ trabalho: celulas.trabalho.valor, bloqueada: celulas.bloqueada.valor, ocioso: celulas.ocioso.valor, suspenso: celulas.suspenso.valor });
                const fecha = soma === null || Math.abs(soma - 100) <= 0.5;
                return (
                  <TableRow key={linha.id}>
                    <TableCell className="py-1.5">
                      <Input id={`grade-${linha.id}-nome`} value={linha.colaborador} aria-label="Colaborador" className="h-8"
                        onChange={(e) => mudar(linha.id, 'colaborador', e.target.value)} />
                    </TableCell>
                    {CAMPOS.map((c) => (
                      <TableCell key={c.chave} className="py-1.5">
                        <Input id={`grade-${linha.id}-${c.chave}`} value={linha[c.chave]} inputMode="decimal" aria-label={`${c.rotulo} de ${linha.colaborador || 'nova pessoa'}`}
                          aria-invalid={celulas[c.chave].erro}
                          className={cn('h-8 text-right tabular-nums', celulas[c.chave].erro && 'border-destructive')}
                          onChange={(e) => mudar(linha.id, c.chave, e.target.value)} />
                        {linha.antes && <span className="block text-right text-[11px] text-muted-foreground tabular-nums">ant. {c.chave === 'horas' ? num(linha.antes.horas) : pct(linha.antes[c.chave])}</span>}
                      </TableCell>
                    ))}
                    <TableCell className="py-1.5 whitespace-nowrap">
                      {soma !== null && (
                        <Badge variant="outline" className={`${fecha ? 'badge-success' : 'badge-warning'} border-0`}>{fecha ? `${num(soma)}%` : `${num(soma)}% · confira`}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Tirar ${linha.colaborador || 'a linha'} da grade`}
                        onClick={() => { setTocou(true); setLinhas((ls) => ls.filter((l) => l.id !== linha.id)); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">Linha sem horas não é gravada (a pessoa não trabalhou na semana).</p>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={enviar} disabled={!data || preenchidas.length === 0 || lancar.isPending}>
            Gravar {preenchidas.length || ''} {preenchidas.length === 1 ? 'pessoa' : 'pessoas'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Interrupções ────────────────────────────────────────────────────────────────────────────────────

function ListaDeInterrupcoes({ lista, podeLancar }: { lista: InterrupcaoDoBanco[]; podeLancar: boolean }) {
  const [editando, setEditando] = useState<InterrupcaoDoBanco | null>(null);
  const [apagando, setApagando] = useState<string | null>(null);
  const apagar = useApagarInterrupcao();
  const parada = lista.some((i) => !i.fim && !i.sem_horario);

  return (
    <Secao titulo={`Interrupções no período (${lista.length})`} aberta={parada}
      acao={parada ? <Badge variant="outline" className="badge-danger border-0">Ainda parado</Badge> : undefined}>
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
      {editando && <DialogoDaInterrupcao inicial={editando} onFechar={() => setEditando(null)} />}
      <ConfirmarExclusao aberto={!!apagando} titulo="Apagar esta interrupção?" descricao="Ela sai da contagem dos indicadores."
        enviando={apagar.isPending} onCancelar={() => setApagando(null)}
        onConfirmar={() => apagar.mutate(apagando!, { onSuccess: () => setApagando(null), onError: (e) => toast.error(mensagemDeErro(e)) })} />
    </Secao>
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
