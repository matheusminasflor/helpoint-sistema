// O projeto (desenho aprovado em 2026-10-07): Cronograma (fases que abrem e fecham, numeração da planilha,
// barra do tempo com o hoje, etiquetas de dependência e fator externo), Setores e planejamento (quem já
// planejou), e Briefing. Cada setor cria as SUAS atividades ("+ Atividade do meu setor"); o dono ajusta tudo.
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, BookmarkPlus, ChevronRight, FolderKanban, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ExplicacaoDoIndicador } from '@/components/ajuda/ExplicacaoDoIndicador';
import { AtividadeDialog } from '@/components/projetos/AtividadeDialog';
import { AtividadePainel } from '@/components/projetos/AtividadePainel';
import { AnexosDoProjeto } from '@/components/projetos/AnexosDoProjeto';
import { SeloDoFarol } from '@/components/projetos/SeloDoFarol';
import { useTenantPath } from '@/hooks/useTenantPath';
import { SETORES, rotuloDoSetor } from '@/lib/setores';
import { diaCurto, todayISO } from '@/lib/dates';
import {
  farolDaAtividade, hojeNaJanela, iniciais, janelaDoCronograma, mesesDaJanela, numerarCronograma, percentualMedio,
  posicaoNaJanela, seloDoConjunto, setoresSemPlano,
} from '@/lib/projetos';
import {
  useApagarProjeto, useEstruturaDoProjeto, useFases, usePessoasDaEmpresa, usePodeNoProjeto, useProjeto, useSalvarBriefing,
  useSalvarComoModelo, useSetorDoProjeto, type AtividadeRow,
} from '@/hooks/useProjetos';

export default function ProjetoDetalhe() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { data: projeto, isLoading } = useProjeto(id);
  const { data: estrutura } = useEstruturaDoProjeto(id);
  const setores = useMemo(() => (estrutura?.setores ?? []).map((s) => s.setor), [estrutura]);
  const { data: pode } = usePodeNoProjeto(id, setores);
  const [editando, setEditando] = useState<AtividadeRow | null>(null);
  const [nova, setNova] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const [modelo, setModelo] = useState(false);

  if (isLoading || !estrutura) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  if (!projeto) {
    return <div className="p-6 text-[14px] text-muted-foreground">Projeto não encontrado — ou você não está na equipe dele.</div>;
  }

  const hoje = todayISO();
  const { fases, atividades, nomes } = estrutura;
  const grupos = numerarCronograma(fases, atividades);
  const numeradas = grupos.flatMap((g) => g.atividades);
  const setoresQuePlanejo = setores.filter((s) => pode?.planeja[s]);
  const editaProjeto = !!pode?.editaProjeto;
  const atividadeAberta = numeradas.find((a) => a.id === aberta) ?? null;
  const janela = janelaDoCronograma(atividades, projeto.due_date, hoje);
  const meses = janela ? mesesDaJanela(janela) : [];
  const atrasadas = atividades.filter((a) => farolDaAtividade(a, hoje) === 'atrasado').length;
  const comFator = atividades.filter((a) => a.fator_externo && a.status !== 'completed').length;
  const finalizadas = atividades.filter((a) => a.status === 'completed').length;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        icon={FolderKanban}
        title={projeto.name}
        description={`${fases.length} ${fases.length === 1 ? 'fase' : 'fases'} · ${atividades.length} atividades${projeto.due_date ? ` · entrega ${diaCurto(projeto.due_date)}` : ''}`}
        onBack={() => navigate(tenantPath('/projetos'))}
        actions={(
          <div className="flex gap-2 flex-wrap">
            {editaProjeto && (
              <Button variant="outline" onClick={() => setModelo(true)}><BookmarkPlus className="w-4 h-4 mr-1.5" />Salvar como modelo</Button>
            )}
            {setoresQuePlanejo.length > 0 && (
              <Button onClick={() => { setEditando(null); setNova(true); }}><Plus className="w-4 h-4 mr-1.5" />Atividade do meu setor</Button>
            )}
          </div>
        )}
      />

      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        <Tabs defaultValue="cronograma">
          <TabsList>
            <TabsTrigger value="cronograma">Cronograma</TabsTrigger>
            <TabsTrigger value="setores">Setores e planejamento</TabsTrigger>
            <TabsTrigger value="briefing">Briefing</TabsTrigger>
          </TabsList>

          <TabsContent value="cronograma" className="space-y-4">
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <Kpi rotulo="Concluído" valor={`${percentualMedio(atividades)}%`} id="projetos.concluido" />
              <Kpi rotulo="Atrasadas" valor={String(atrasadas)} id="projetos.atrasadas" tom={atrasadas ? 'text-destructive' : ''} />
              <Kpi rotulo="Esperando fator externo" valor={String(comFator)} id="projetos.fator_externo" tom={comFator ? 'text-status-warning' : ''} />
              <Kpi rotulo="Finalizadas" valor={`${finalizadas} de ${atividades.length}`} id="projetos.finalizadas" />
            </div>

            {atividades.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-6 text-center text-[14px] text-muted-foreground">
                Nenhum setor planejou ainda. Cada setor envolvido cria as suas atividades com "+ Atividade do meu setor".
              </p>
            ) : (
              <div className="rounded-lg border border-border bg-card overflow-x-auto">
                <div className="min-w-[980px]">
                  <div className="grid grid-cols-[56px_minmax(220px,1fr)_120px_120px_92px_92px_120px_64px_180px] gap-2 px-3 py-2 bg-muted/50 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>ID</span><span>Fase / atividade</span><span>Setor</span><span>Responsável</span><span>Início</span><span>Término</span><span>Farol</span><span>%</span>
                    <span className="relative h-4">
                      {janela ? meses.map((m) => (
                        <span key={`${m.rotulo}-${m.esquerda}`} className="absolute normal-case" style={{ left: `${m.esquerda}%` }}>{m.rotulo}</span>
                      )) : 'Linha do tempo'}
                    </span>
                  </div>
                  {grupos.map((g) => (
                    <Collapsible key={g.fase?.id ?? 'sem'} defaultOpen>
                      <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-muted/30">
                        <CollapsibleTrigger className="group flex flex-1 items-center gap-2 text-left text-[14px] font-semibold">
                          <ChevronRight className="w-4 h-4 transition-transform group-data-[state=open]:rotate-90" aria-hidden="true" />
                          <span className="font-mono w-6">{g.numero || '—'}</span>
                          {g.fase ? `Fase ${g.numero} · ${g.fase.nome}` : 'Sem fase'}
                          <span className="text-[12px] font-normal text-muted-foreground">· {g.atividades.length} {g.atividades.length === 1 ? 'atividade' : 'atividades'}</span>
                          <span className="ml-auto flex items-center gap-3">
                            {(() => { const s = seloDoConjunto(g.atividades, hoje); return <SeloDoFarol farol={s.tom} texto={s.texto} />; })()}
                            <span className="font-mono text-[13px] tabular-nums w-10 text-right">{percentualMedio(g.atividades)}%</span>
                          </span>
                        </CollapsibleTrigger>
                        {editaProjeto && g.fase && <AcoesDaFase projectId={id} faseId={g.fase.id} nome={g.fase.nome} fases={fases} />}
                      </div>
                      <CollapsibleContent>
                        {g.atividades.map((a) => {
                          const pos = janela ? posicaoNaJanela(a.inicio, a.termino, janela) : null;
                          const farol = farolDaAtividade(a, hoje);
                          const dep = a.depende_de ? numeradas.find((x) => x.id === a.depende_de) : null;
                          return (
                            <button key={a.id} type="button" onClick={() => setAberta(a.id)}
                              className="grid w-full grid-cols-[56px_minmax(220px,1fr)_120px_120px_92px_92px_120px_64px_180px] gap-2 px-3 py-2 border-t border-border text-left text-[14px] items-center hover:bg-primary/5">
                              <span className="font-mono text-[13px]">{a.numero}</span>
                              <span className="min-w-0">
                                <span className="block truncate">{a.title}</span>
                                <span className="flex flex-wrap gap-1 mt-0.5">
                                  {dep && <span className="rounded px-1.5 text-[12px] font-semibold bg-secondary text-muted-foreground">↳ depende de {dep.numero}</span>}
                                  {a.fator_externo && a.status !== 'completed' && (
                                    <span className="rounded px-1.5 text-[12px] font-semibold badge-warning">⚑ {a.fator_externo}</span>
                                  )}
                                </span>
                              </span>
                              <span className="text-[13px]">{rotuloDoSetor(a.setor)}</span>
                              <span className="text-[13px] truncate">{a.user_id ? nomes[a.user_id] ?? '—' : <em className="text-muted-foreground not-italic">sem responsável</em>}</span>
                              <span className="font-mono text-[13px]">{a.inicio ? diaCurto(a.inicio) : '—'}</span>
                              <span className="font-mono text-[13px]">{a.termino ? diaCurto(a.termino) : '—'}</span>
                              <span><SeloDoFarol farol={farol} /></span>
                              <span className="font-mono text-[13px] tabular-nums">{a.percentual}%</span>
                              <span className="relative h-4 rounded bg-muted" aria-hidden="true">
                                {meses.map((m) => m.esquerda > 0 && <i key={m.esquerda} className="absolute inset-y-0 w-px bg-border" style={{ left: `${m.esquerda}%` }} />)}
                                {pos && (
                                  <i className={`absolute top-1 h-2 rounded ${farol === 'atrasado' ? 'bg-destructive' : farol === 'finalizado' ? 'bg-status-success' : 'bg-primary'}`}
                                    style={{ left: `${pos.esquerda}%`, width: `${pos.largura}%` }} />
                                )}
                                {janela && <i className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-destructive" style={{ left: `${hojeNaJanela(hoje, janela)}%` }} />}
                              </span>
                            </button>
                          );
                        })}
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              </div>
            )}
            <p className="text-[12px] text-muted-foreground">Linha vermelha na barra = hoje. O farol "Atrasado" acende sozinho quando passa do término sem 100%.</p>
          </TabsContent>

          <TabsContent value="setores">
            <SetoresDoProjeto projectId={id} editaProjeto={editaProjeto} estrutura={estrutura} />
          </TabsContent>

          <TabsContent value="briefing">
            <Briefing projectId={id} editaProjeto={editaProjeto} nome={projeto.name} objetivo={projeto.description} entrega={projeto.due_date} status={projeto.status} />
          </TabsContent>
        </Tabs>
      </div>

      <AtividadeDialog
        projectId={id}
        aberta={nova || !!editando}
        onFechar={() => { setNova(false); setEditando(null); }}
        atividade={editando}
        setoresQuePlanejo={editando?.setor && !setoresQuePlanejo.includes(editando.setor) ? [editando.setor, ...setoresQuePlanejo] : setoresQuePlanejo}
        fases={[...fases].sort((x, y) => x.ordem - y.ordem)}
        atividades={atividades}
      />
      <AtividadePainel
        atividade={atividadeAberta}
        onFechar={() => setAberta(null)}
        nomes={nomes}
        dependeDe={atividadeAberta?.depende_de ? numeradas.find((x) => x.id === atividadeAberta.depende_de) ?? null : null}
        faseNome={fases.find((f) => f.id === atividadeAberta?.fase_id)?.nome ?? null}
        podePlanejar={!!atividadeAberta?.setor && !!pode?.planeja[atividadeAberta.setor]}
        podeEditarProjeto={editaProjeto}
        onEditar={() => { setEditando(atividadeAberta); setAberta(null); }}
      />
      <SalvarComoModelo projectId={id} nome={projeto.name} aberto={modelo} onFechar={() => setModelo(false)} />
    </div>
  );
}

function Kpi({ rotulo, valor, id, tom = '' }: { rotulo: string; valor: string; id: Parameters<typeof ExplicacaoDoIndicador>[0]['id']; tom?: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-[12px] text-muted-foreground flex items-center gap-1">{rotulo} <ExplicacaoDoIndicador id={id} /></p>
      <p className={`text-[20px] font-bold tabular-nums ${tom}`}>{valor}</p>
    </div>
  );
}

/** Renomear, subir, descer e apagar a fase — só quem edita o projeto. */
function AcoesDaFase({ projectId, faseId, nome, fases }: { projectId: string; faseId: string; nome: string; fases: { id: string; ordem: number }[] }) {
  const { salvar, apagar } = useFases(projectId);
  const [renomeando, setRenomeando] = useState(false);
  const [texto, setTexto] = useState(nome);
  const ordenadas = [...fases].sort((a, b) => a.ordem - b.ordem);
  const i = ordenadas.findIndex((f) => f.id === faseId);
  const trocar = (j: number) => {
    const outra = ordenadas[j];
    if (!outra) return;
    salvar.mutate({ id: faseId, ordem: outra.ordem });
    salvar.mutate({ id: outra.id, ordem: ordenadas[i].ordem });
  };
  if (renomeando) {
    return (
      <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); salvar.mutate({ id: faseId, nome: texto }); setRenomeando(false); }}>
        <Input className="h-7 w-48 text-[13px]" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Novo nome da fase" />
        <Button size="sm" className="h-7" type="submit">Salvar</Button>
      </form>
    );
  }
  return (
    <div className="flex gap-0.5">
      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Subir a fase" disabled={i <= 0} onClick={() => trocar(i - 1)}><ArrowUp className="w-3.5 h-3.5" /></Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Descer a fase" disabled={i >= ordenadas.length - 1} onClick={() => trocar(i + 1)}><ArrowDown className="w-3.5 h-3.5" /></Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Renomear a fase" onClick={() => setRenomeando(true)}><Pencil className="w-3.5 h-3.5" /></Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label="Apagar a fase" onClick={() => apagar.mutate(faseId)}><Trash2 className="w-3.5 h-3.5" /></Button>
    </div>
  );
}

function NumeroDoSetor({ rotulo, valor, tom = '' }: { rotulo: string; valor: number; tom?: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-[12px] text-muted-foreground">{rotulo}</p>
      <p className={`text-[22px] font-bold font-mono tabular-nums ${tom}`}>{valor}</p>
    </div>
  );
}

function SetoresDoProjeto({ projectId, editaProjeto, estrutura }: {
  projectId: string; editaProjeto: boolean; estrutura: NonNullable<ReturnType<typeof useEstruturaDoProjeto>['data']>;
}) {
  const { marcar, referencia, tirar } = useSetorDoProjeto(projectId);
  const { data: pessoas = [] } = usePessoasDaEmpresa();
  const [novoSetor, setNovoSetor] = useState('');
  const [novaPessoa, setNovaPessoa] = useState('');
  // A pessoa do setor é sempre do setor (dono, 2026-10-09); o banco recusa a de fora.
  const genteDo = (setor: string) => pessoas.filter((p) => p.setores.includes(setor));
  const semPlano = new Set(setoresSemPlano(estrutura.setores.map((s) => s.setor), estrutura.atividades));
  const naoEnvolvidos = SETORES.filter((s) => !estrutura.setores.some((x) => x.setor === s.value));
  const hoje = todayISO();
  // O número de cada fase (1, 2, 3…), para "8 · fases 1, 3, 5" — como no desenho aprovado.
  const numeroDaFase = new Map([...estrutura.fases].sort((x, y) => x.ordem - y.ordem).map((f, i) => [f.id, i + 1]));
  const planejaram = estrutura.setores.length - semPlano.size;
  const colunas = editaProjeto
    ? 'md:grid-cols-[36px_minmax(160px,1fr)_150px_minmax(180px,1.4fr)_130px_230px]'
    : 'md:grid-cols-[36px_minmax(160px,1fr)_150px_minmax(180px,1.4fr)_130px]';
  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <NumeroDoSetor rotulo="Setores envolvidos" valor={estrutura.setores.length} />
        <NumeroDoSetor rotulo="Já planejaram" valor={planejaram} tom="text-status-success" />
        <NumeroDoSetor rotulo="Aguardando plano do setor" valor={semPlano.size} tom={semPlano.size ? 'text-status-warning' : ''} />
        <NumeroDoSetor rotulo="Pessoas na equipe" valor={estrutura.equipe.length} />
      </div>
      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        <div className={`hidden md:grid gap-3 px-3 py-2 bg-muted/50 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground ${colunas}`}>
          <span /><span>Setor</span><span>Planejamento</span><span>Pessoas do setor no projeto</span><span>Atividades</span>{editaProjeto && <span>Pessoa do setor</span>}
        </div>
        {estrutura.setores.map((s) => {
          const doSetor = estrutura.atividades.filter((a) => a.setor === s.setor);
          const doSetorNaEquipe = estrutura.equipe.filter((u) => pessoas.some((p) => p.id === u && p.setores.includes(s.setor)));
          const atrasadas = doSetor.filter((a) => farolDaAtividade(a, hoje) === 'atrasado').length;
          const fasesDoSetor = [...new Set(doSetor.map((a) => (a.fase_id ? numeroDaFase.get(a.fase_id) : undefined)).filter((n): n is number => !!n))].sort((x, y) => x - y);
          return (
            <div key={s.id} className={`grid gap-2 md:gap-3 p-3 md:items-center text-[14px] ${colunas}`}>
              <span className="hidden md:grid h-[30px] w-[30px] place-items-center rounded-full bg-primary/10 text-[11px] font-extrabold text-primary">
                {iniciais(rotuloDoSetor(s.setor)).slice(0, 2)}
              </span>
              <div><b>{rotuloDoSetor(s.setor)}</b><br /><span className="text-[12px] text-muted-foreground">pessoa: {s.referencia_id ? estrutura.nomes[s.referencia_id] ?? '—' : 'sem pessoa'}</span></div>
              <span>{semPlano.has(s.setor)
                ? <SeloDoFarol farol="em_andamento" texto="Aguardando plano" />
                : <SeloDoFarol farol="finalizado" texto="Planejado" />}</span>
              <span className={`text-[13px] ${doSetorNaEquipe.length ? '' : 'text-muted-foreground'}`}>
                {doSetorNaEquipe.length ? doSetorNaEquipe.map((u) => estrutura.nomes[u] ?? '—').join(' · ') : 'ninguém ainda'}
              </span>
              <span className={`font-mono text-[13px] ${atrasadas ? 'text-destructive' : ''}`}>
                {doSetor.length}{atrasadas ? ` · ${atrasadas} ${atrasadas === 1 ? 'atrasada' : 'atrasadas'}` : fasesDoSetor.length ? ` · ${fasesDoSetor.length === 1 ? 'fase' : 'fases'} ${fasesDoSetor.join(', ')}` : ''}
              </span>
              {editaProjeto && (
                <div className="flex gap-1">
                  <Select value={s.referencia_id ?? '__sem__'} onValueChange={(v) => referencia.mutate({ id: s.id, referencia_id: v })}>
                    <SelectTrigger className="h-8 text-[13px]" aria-label="Pessoa do setor"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__sem__" disabled>Escolha a pessoa…</SelectItem>
                      {genteDo(s.setor).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label={`Tirar ${rotuloDoSetor(s.setor)} do projeto`} onClick={() => tirar.mutate(s.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
        {estrutura.setores.length === 0 && <p className="p-4 text-[14px] text-muted-foreground">Nenhum setor envolvido ainda.</p>}
      </div>
      {editaProjeto && naoEnvolvidos.length > 0 && (
        <div className="flex gap-2 items-end flex-wrap">
          <div className="grid gap-1.5">
            <Label>Envolver outro setor</Label>
            <Select value={novoSetor} onValueChange={(v) => { setNovoSetor(v); setNovaPessoa(''); }}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Escolha o setor" /></SelectTrigger>
              <SelectContent>{naoEnvolvidos.map((s) => <SelectItem key={s.value} value={s.value} disabled={genteDo(s.value).length === 0}>{s.label}{genteDo(s.value).length === 0 ? ' — ninguém cadastrado' : ''}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {novoSetor && (
            <div className="grid gap-1.5">
              <Label>Pessoa do setor</Label>
              <Select value={novaPessoa} onValueChange={setNovaPessoa}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Escolha a pessoa" /></SelectTrigger>
                <SelectContent>{genteDo(novoSetor).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <Button disabled={!novoSetor || !novaPessoa || marcar.isPending} onClick={() => { marcar.mutate({ setor: novoSetor, referencia_id: novaPessoa }); setNovoSetor(''); setNovaPessoa(''); }}>
            Envolver e avisar
          </Button>
        </div>
      )}
      <p className="text-[12px] text-muted-foreground">
        "Aguardando plano" = o setor foi chamado e ainda não criou nenhuma atividade. Na equipe: {estrutura.equipe.map((u) => estrutura.nomes[u] ?? '—').join(', ') || 'ninguém'}.
      </p>
    </div>
  );
}

function Briefing({ projectId, editaProjeto, nome, objetivo, entrega, status }: {
  projectId: string; editaProjeto: boolean; nome: string; objetivo: string | null; entrega: string | null; status: string;
}) {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const salvar = useSalvarBriefing(projectId);
  const apagar = useApagarProjeto();
  const [f, setF] = useState({ name: nome, description: objetivo ?? '', due_date: entrega ?? '', status });
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid gap-4 rounded-lg border border-border bg-card p-4">
        <div className="grid gap-1.5"><Label htmlFor="br-nome">Nome</Label>
          <Input id="br-nome" value={f.name} disabled={!editaProjeto} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="grid gap-1.5"><Label htmlFor="br-obj">Objetivo</Label>
          <Textarea id="br-obj" rows={8} value={f.description} disabled={!editaProjeto} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5"><Label htmlFor="br-entrega">Entrega desejada</Label>
            <Input id="br-entrega" type="date" value={f.due_date} disabled={!editaProjeto} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label>Situação do projeto</Label>
            <Select value={f.status} disabled={!editaProjeto} onValueChange={(v) => setF({ ...f, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="planned">A começar</SelectItem><SelectItem value="active">Em andamento</SelectItem>
                <SelectItem value="done">Concluído</SelectItem><SelectItem value="cancelled">Cancelado</SelectItem>
              </SelectContent>
            </Select></div>
        </div>
        {editaProjeto && (
          <div className="flex gap-2 flex-wrap">
            <Button disabled={!f.name.trim() || salvar.isPending}
              onClick={() => salvar.mutate({ name: f.name.trim(), description: f.description.trim() || null, due_date: f.due_date || null, status: f.status })}>
              Salvar briefing
            </Button>
            <Button variant="ghost" className="text-destructive" onClick={async () => { await apagar.mutateAsync(projectId); navigate(tenantPath('/projetos')); }}>
              Apagar projeto
            </Button>
          </div>
        )}
      </div>
      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        <h3 className="text-[14px] font-semibold">Arquivos do briefing</h3>
        <AnexosDoProjeto projectId={projectId} taskId={null} podeApagarTodos={editaProjeto} />
      </div>
    </div>
  );
}

function SalvarComoModelo({ projectId, nome, aberto, onFechar }: { projectId: string; nome: string; aberto: boolean; onFechar: () => void }) {
  const salvar = useSalvarComoModelo();
  const [texto, setTexto] = useState(`Modelo — ${nome}`);
  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Salvar como modelo</DialogTitle></DialogHeader>
        <p className="text-[14px] text-muted-foreground">Guarda as fases, as atividades de cada setor e os setores — sem datas, pessoas e %. O próximo projeto pode começar dele.</p>
        <div className="grid gap-1.5"><Label htmlFor="modelo-nome">Nome do modelo</Label><Input id="modelo-nome" value={texto} onChange={(e) => setTexto(e.target.value)} /></div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button disabled={!texto.trim() || salvar.isPending} onClick={async () => { await salvar.mutateAsync({ projectId, nome: texto }); onFechar(); }}>Salvar modelo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
