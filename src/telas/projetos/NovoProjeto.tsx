// Novo projeto: o BRIEFING (nome, objetivo, entrega), os SETORES com a pessoa de cada um e as ATIVIDADES.
// Decisões do dono: quem cria não precisa saber as fases — cada setor planeja a sua parte (2026-10-07);
// passo a passo e pessoa obrigatória em cada setor (2026-10-08); a ordem é 1 A ideia → 2 Setores e pessoas
// → 3 Atividades → Criar, com as atividades do modelo revisadas (editar, excluir, criar) ANTES de criar, e a
// pessoa do setor sempre do setor (2026-10-09). Nada é gravado antes de "Criar" (`criar_projeto`).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, FolderPlus, Mail, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SETORES, rotuloDoSetor } from '@/lib/setores';
import { useTenantPath } from '@/hooks/useTenantPath';
import {
  useCriarProjeto, useEstruturaDoModelo, useModelosDeProjeto, usePessoasDaEmpresa, type FaseRascunho,
} from '@/hooks/useProjetos';
import { cn } from '@/lib/utils';

const SEM = '__sem__';
const ETAPAS = ['A ideia', 'Setores e pessoas', 'Atividades'] as const;
const nova = () => crypto.randomUUID();

export default function NovoProjeto() {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const criar = useCriarProjeto();
  const { data: modelos = [] } = useModelosDeProjeto();
  const { data: pessoas = [] } = usePessoasDaEmpresa();
  const [etapa, setEtapa] = useState(0);
  const [nome, setNome] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [entrega, setEntrega] = useState('');
  const [modeloId, setModeloId] = useState(SEM);
  const [setores, setSetores] = useState<Record<string, string | null>>({});
  const [fases, setFases] = useState<FaseRascunho[]>([]);

  const modelo = modelos.find((m) => m.id === modeloId);
  const { data: estruturaDoModelo } = useEstruturaDoModelo(modelo ? modelo.id : null);
  // As atividades do modelo chegam como rascunho; trocar de modelo troca o rascunho inteiro.
  const idDoModelo = modelo?.id;
  useEffect(() => { setFases(idDoModelo ? estruturaDoModelo ?? [] : []); }, [idDoModelo, estruturaDoModelo]);

  const escolherModelo = (id: string) => {
    const anterior = modelos.find((x) => x.id === modeloId);
    const m = modelos.find((x) => x.id === id);
    setModeloId(id);
    // Trocar de modelo tira os setores que o anterior marcou e ninguém ajustou (teste do dono, 2026-10-07).
    setSetores((s) => {
      const n = { ...s };
      for (const setor of anterior?.setores ?? []) if (n[setor] === null) delete n[setor];
      for (const setor of m?.setores ?? []) n[setor] = n[setor] ?? null;
      return n;
    });
  };
  const marcar = (setor: string, sim: boolean) =>
    setSetores((s) => { const n = { ...s }; if (sim) n[setor] = n[setor] ?? null; else delete n[setor]; return n; });

  const doSetor = (setor: string) => pessoas.filter((p) => p.setores.includes(setor));
  const marcados = Object.entries(setores);
  const setoresMarcados = marcados.map(([s]) => s);
  const semPessoa = marcados.filter(([, p]) => !p).map(([s]) => s);
  const nomeDe = (id: string | null) => pessoas.find((p) => p.id === id)?.nome ?? '';

  // ─── O rascunho das atividades ───
  const mudarFase = (chave: string, muda: (f: FaseRascunho) => FaseRascunho) =>
    setFases((fs) => fs.map((f) => (f.chave === chave ? muda(f) : f)));
  const mudarAtividade = (fase: string, ativ: string, campo: 'titulo' | 'setor' | 'descricao', valor: string) =>
    mudarFase(fase, (f) => ({ ...f, atividades: f.atividades.map((a) => (a.chave === ativ ? { ...a, [campo]: valor } : a)) }));
  // Só entram as atividades dos setores marcados (desmarcar um setor na etapa 2 tira as dele).
  const visiveis = (f: FaseRascunho) => f.atividades.filter((a) => setoresMarcados.includes(a.setor));
  const foraDosSetores = fases.reduce((n, f) => n + f.atividades.length - visiveis(f).length, 0);
  const totalDeAtividades = fases.reduce((n, f) => n + visiveis(f).filter((a) => a.titulo.trim()).length, 0);

  const podeSeguir = etapa === 0 ? nome.trim().length > 0 : marcados.length > 0 && semPessoa.length === 0;

  const enviar = async () => {
    const id = await criar.mutateAsync({
      nome, objetivo, entrega: entrega || null,
      setores: marcados.map(([setor, referencia_id]) => ({ setor, referencia_id: referencia_id! })),
      fases: fases.map((f, i) => ({ ...f, nome: f.nome.trim() || `Fase ${i + 1}`, atividades: visiveis(f).filter((a) => a.titulo.trim()) })),
    });
    navigate(tenantPath(`/projetos/${id}`));
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader icon={FolderPlus} title="Novo projeto" description="Escreva a ideia, chame os setores com a pessoa de cada um e revise as atividades. Nada é gravado antes de Criar." onBack={() => navigate(tenantPath('/projetos'))} />
      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          <ol className="flex items-center gap-2" aria-label="Etapas">
            {ETAPAS.map((rotulo, i) => (
              <li key={rotulo} className="flex items-center gap-2 flex-1 min-w-0" aria-current={i === etapa ? 'step' : undefined}>
                <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[13px] font-semibold',
                  i < etapa && 'bg-primary border-primary text-primary-foreground',
                  i === etapa && 'border-primary text-primary',
                  i > etapa && 'border-border text-muted-foreground')}>
                  {i < etapa ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span className={cn('text-[13px] truncate', i === etapa ? 'font-semibold' : 'text-muted-foreground')}>{rotulo}</span>
                {i < ETAPAS.length - 1 && <span className="h-px flex-1 bg-border" />}
              </li>
            ))}
          </ol>

          {etapa === 0 && (
            <Card>
              <CardHeader><CardTitle className="text-[16px]">1. A ideia</CardTitle><CardDescription>O briefing: o que todo setor vai ler antes de planejar.</CardDescription></CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label>Começar de um modelo</Label>
                  <Select value={modeloId} onValueChange={escolherModelo}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEM}>Sem modelo — cada setor monta do zero</SelectItem>
                      {modelos.map((m) => <SelectItem key={m.id} value={m.id}>{m.name} · {m.atividades} atividades</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-[13px] text-muted-foreground">
                    {modelo?.description ?? 'O modelo traz os setores e as atividades sugeridas; você revisa tudo na etapa 3, antes de criar.'}
                  </p>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="np-nome">Nome do projeto</Label>
                  <Input id="np-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Nutribalance 1 Litro" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="np-objetivo">Objetivo — o que queremos alcançar</Label>
                  <Textarea id="np-objetivo" rows={6} value={objetivo} onChange={(e) => setObjetivo(e.target.value)}
                    placeholder="A ideia, para quem, o resultado esperado, restrições (margem, prazo, público)…" />
                </div>
                <div className="grid gap-1.5 max-w-xs">
                  <Label htmlFor="np-entrega">Entrega desejada</Label>
                  <Input id="np-entrega" type="date" value={entrega} onChange={(e) => setEntrega(e.target.value)} />
                </div>
              </CardContent>
            </Card>
          )}

          {etapa === 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-[16px]">2. Setores e pessoas</CardTitle>
                <CardDescription>Marque os setores que participam e escolha, entre as pessoas DO setor, quem responde por ele. Ela recebe e-mail, entra no projeto e planeja a parte do setor.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                {SETORES.map((s) => {
                  const marcado = s.value in setores;
                  const gente = doSetor(s.value);
                  return (
                    <div key={s.value} className="rounded-md border border-border p-2 space-y-2">
                      <label className={cn('flex items-center gap-2 text-[14px]', gente.length || marcado ? 'cursor-pointer' : 'opacity-60')}>
                        <Checkbox checked={marcado} disabled={!marcado && gente.length === 0} onCheckedChange={(v) => marcar(s.value, !!v)} />
                        {rotuloDoSetor(s.value)}
                        {gente.length === 0 && <span className="text-[12px] text-muted-foreground">— ninguém cadastrado neste setor</span>}
                      </label>
                      {marcado && (gente.length > 0 ? (
                        <Select value={setores[s.value] ?? SEM} onValueChange={(v) => setSetores((x) => ({ ...x, [s.value]: v === SEM ? null : v }))}>
                          <SelectTrigger className={cn('h-8 text-[13px]', !setores[s.value] && 'border-destructive')} aria-label={`Pessoa do setor ${rotuloDoSetor(s.value)}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SEM} disabled>Escolha a pessoa…</SelectItem>
                            {gente.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-[13px] text-destructive">
                          Ninguém cadastrado em {rotuloDoSetor(s.value)}: peça para cadastrar o setor no perfil da pessoa, ou desmarque.
                        </p>
                      ))}
                    </div>
                  );
                })}
                {marcados.length === 0 && <p className="text-[13px] text-muted-foreground">Marque pelo menos um setor.</p>}
                {semPessoa.length > 0 && (
                  <p className="text-[13px] text-destructive">Falta escolher a pessoa de: {semPessoa.map(rotuloDoSetor).join(', ')}.</p>
                )}
              </CardContent>
            </Card>
          )}

          {etapa === 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-[16px]">3. Atividades</CardTitle>
                <CardDescription>
                  {modelo ? `As atividades sugeridas pelo modelo "${modelo.name}".` : 'Sem modelo: crie as fases e atividades que já souber, ou deixe para cada setor planejar depois.'}{' '}
                  Edite, exclua ou crie à vontade — só vale ao clicar em Criar. Pessoa e datas, cada setor põe depois.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {fases.map((f, i) => (
                  <div key={f.chave} className="rounded-md border border-border">
                    <div className="flex items-center gap-2 border-b border-border bg-muted/40 p-2">
                      <span className="text-[13px] font-semibold text-muted-foreground shrink-0">Fase {i + 1}</span>
                      <Input className="h-8" value={f.nome} aria-label={`Nome da fase ${i + 1}`}
                        onChange={(e) => mudarFase(f.chave, (x) => ({ ...x, nome: e.target.value }))} />
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" aria-label={`Excluir a fase ${i + 1} e as atividades dela`}
                        onClick={() => setFases((fs) => fs.filter((x) => x.chave !== f.chave))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="divide-y divide-border">
                      {visiveis(f).map((a) => (
                        <div key={a.chave} className="grid gap-2 p-2 sm:grid-cols-[minmax(0,1fr)_150px_auto]">
                          <div className="grid gap-1">
                            <Input className="h-8" value={a.titulo} placeholder="O que fazer" aria-label="Atividade"
                              onChange={(e) => mudarAtividade(f.chave, a.chave, 'titulo', e.target.value)} />
                            <Input className="h-8 text-[13px]" value={a.descricao} placeholder="Descrição (opcional)" aria-label="Descrição"
                              onChange={(e) => mudarAtividade(f.chave, a.chave, 'descricao', e.target.value)} />
                          </div>
                          <Select value={a.setor} onValueChange={(v) => mudarAtividade(f.chave, a.chave, 'setor', v)}>
                            <SelectTrigger className="h-8 text-[13px]" aria-label="Setor da atividade"><SelectValue /></SelectTrigger>
                            <SelectContent>{setoresMarcados.map((s) => <SelectItem key={s} value={s}>{rotuloDoSetor(s)}</SelectItem>)}</SelectContent>
                          </Select>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label="Excluir a atividade"
                            onClick={() => mudarFase(f.chave, (x) => ({ ...x, atividades: x.atividades.filter((y) => y.chave !== a.chave) }))}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <div className="p-2">
                        <Button variant="ghost" size="sm" className="gap-1.5"
                          onClick={() => mudarFase(f.chave, (x) => ({ ...x, atividades: [...x.atividades, { chave: nova(), titulo: '', setor: setoresMarcados[0], descricao: '' }] }))}>
                          <Plus className="h-4 w-4" /> Atividade
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                <Button variant="outline" className="gap-1.5 justify-self-start"
                  onClick={() => setFases((fs) => [...fs, { chave: nova(), nome: '', atividades: [] }])}>
                  <Plus className="h-4 w-4" /> Nova fase
                </Button>
                {foraDosSetores > 0 && (
                  <p className="text-[13px] text-muted-foreground">
                    {foraDosSetores} atividade(s) do modelo ficaram de fora por serem de setores que você desmarcou na etapa 2.
                  </p>
                )}

                <div className="rounded-md bg-muted/60 p-3 text-[13px] space-y-1">
                  <p className="font-medium">Ao criar</p>
                  <p>• O projeto "{nome}" nasce com {fases.length} fase(s) e {totalDeAtividades} atividade(s).</p>
                  {marcados.map(([setor, pessoa]) => (
                    <p key={setor} className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-primary shrink-0" />{nomeDe(pessoa)} ({rotuloDoSetor(setor)}) recebe e-mail e aviso.</p>
                  ))}
                  <p>• Cada setor põe pessoa e datas nas suas atividades; os arquivos do briefing você anexa na aba Briefing.</p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={() => setEtapa((e) => e - 1)} disabled={etapa === 0}>Voltar</Button>
            {etapa < ETAPAS.length - 1
              ? <Button onClick={() => setEtapa((e) => e + 1)} disabled={!podeSeguir}>Próximo</Button>
              : <Button onClick={enviar} disabled={criar.isPending}>{criar.isPending ? 'Criando…' : 'Criar projeto e avisar'}</Button>}
          </div>
        </div>
      </div>
    </div>
  );
}
