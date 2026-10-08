// Novo projeto: o BRIEFING (nome, objetivo, entrega) e os SETORES envolvidos, cada um com a sua pessoa
// (decisão do dono, 2026-10-07: quem cria não precisa saber as fases — cada setor planeja a sua parte).
// Pode começar de um modelo: as fases e atividades sugeridas já vêm, e os setores do modelo também.
// Em 3 etapas e com a pessoa obrigatória em cada setor (dono, 2026-10-08: "ele se sente perdido" e
// "ter como obrigatório atrelar as pessoas"); a pessoa escolhida recebe e-mail (20261218010000).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, FolderPlus, Mail } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SETORES, rotuloDoSetor } from '@/lib/setores';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useCriarProjeto, useModelosDeProjeto, usePessoasDaEmpresa } from '@/hooks/useProjetos';
import { cn } from '@/lib/utils';

const SEM = '__sem__';
const ETAPAS = ['A ideia', 'Setores e pessoas', 'Revisar e criar'] as const;

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

  const modelo = modelos.find((m) => m.id === modeloId);
  // Trocar de modelo (ou voltar a "Sem modelo") tira os setores que o modelo ANTERIOR tinha marcado —
  // menos os que a pessoa já ajustou com uma pessoa (teste do dono, 2026-10-07: voltar a "Sem
  // modelo" deixava os 6 setores do modelo marcados).
  const escolherModelo = (id: string) => {
    const anterior = modelos.find((x) => x.id === modeloId);
    const m = modelos.find((x) => x.id === id);
    setModeloId(id);
    setSetores((s) => {
      const n = { ...s };
      for (const setor of anterior?.setores ?? []) if (n[setor] === null) delete n[setor];
      for (const setor of m?.setores ?? []) n[setor] = n[setor] ?? null;
      return n;
    });
  };
  const marcar = (setor: string, sim: boolean) =>
    setSetores((s) => { const n = { ...s }; if (sim) n[setor] = n[setor] ?? null; else delete n[setor]; return n; });

  const marcados = Object.entries(setores);
  const semPessoa = marcados.filter(([, p]) => !p).map(([s]) => s);
  const nomeDe = (id: string | null) => pessoas.find((p) => p.id === id)?.nome ?? '';
  const podeSeguir = etapa === 0 ? nome.trim().length > 0 : marcados.length > 0 && semPessoa.length === 0;

  const enviar = async () => {
    const id = await criar.mutateAsync({
      nome, objetivo, entrega: entrega || null, modeloId: modelo ? modelo.id : null,
      setores: marcados.map(([setor, referencia_id]) => ({ setor, referencia_id })),
    });
    navigate(tenantPath(`/projetos/${id}`));
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader icon={FolderPlus} title="Novo projeto" description="Escreva a ideia, chame os setores e escolha quem responde por cada um. Cada setor planeja a sua parte depois." onBack={() => navigate(tenantPath('/projetos'))} />
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
                    {modelo?.description ?? 'O modelo já traz as fases e as atividades sugeridas de cada setor; dá para mudar tudo depois.'}
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
                <CardDescription>Marque os setores que participam e escolha a pessoa que responde por cada um. Ela recebe e-mail, entra no projeto e planeja a parte do setor.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                {SETORES.map((s) => {
                  const marcado = s.value in setores;
                  const doSetor = pessoas.filter((p) => p.setor === s.value);
                  const outras = pessoas.filter((p) => p.setor !== s.value);
                  return (
                    <div key={s.value} className="rounded-md border border-border p-2 space-y-2">
                      <label className="flex items-center gap-2 text-[14px] cursor-pointer">
                        <Checkbox checked={marcado} onCheckedChange={(v) => marcar(s.value, !!v)} />
                        {rotuloDoSetor(s.value)}
                      </label>
                      {marcado && (
                        <Select value={setores[s.value] ?? SEM} onValueChange={(v) => setSetores((x) => ({ ...x, [s.value]: v === SEM ? null : v }))}>
                          <SelectTrigger className={cn('h-8 text-[13px]', !setores[s.value] && 'border-destructive')} aria-label={`Pessoa do setor ${rotuloDoSetor(s.value)}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SEM} disabled>Escolha a pessoa…</SelectItem>
                            <SelectGroup>
                              <SelectLabel>Do setor {rotuloDoSetor(s.value)}</SelectLabel>
                              {doSetor.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                            </SelectGroup>
                            <SelectGroup>
                              <SelectLabel>Outras pessoas</SelectLabel>
                              {outras.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}{p.setor ? ` · ${rotuloDoSetor(p.setor)}` : ''}</SelectItem>)}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      )}
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
              <CardHeader><CardTitle className="text-[16px]">3. Revisar e criar</CardTitle><CardDescription>Confira antes de avisar as pessoas.</CardDescription></CardHeader>
              <CardContent className="grid gap-4 text-[14px]">
                <dl className="grid gap-2">
                  <div><dt className="text-muted-foreground text-[13px]">Projeto</dt><dd className="font-medium">{nome}</dd></div>
                  <div><dt className="text-muted-foreground text-[13px]">Modelo</dt><dd>{modelo ? `${modelo.name} · ${modelo.atividades} atividades sugeridas` : 'Sem modelo — cada setor monta do zero'}</dd></div>
                  {entrega && <div><dt className="text-muted-foreground text-[13px]">Entrega desejada</dt><dd>{entrega.split('-').reverse().join('/')}</dd></div>}
                </dl>
                <div>
                  <p className="text-muted-foreground text-[13px] mb-1">Quem recebe e-mail e aviso</p>
                  <ul className="grid gap-1">
                    {marcados.map(([setor, pessoa]) => (
                      <li key={setor} className="flex items-center gap-2"><Mail className="h-4 w-4 text-primary shrink-0" />{nomeDe(pessoa)} <span className="text-muted-foreground">· {rotuloDoSetor(setor)}</span></li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-md bg-muted/60 p-3 text-[13px] space-y-1">
                  <p className="font-medium">O que acontece depois</p>
                  <p>• Cada pessoa lê o briefing e planeja as atividades do seu setor{modelo ? ' (as sugeridas pelo modelo já estão lá)' : ''}.</p>
                  <p>• O gestor de cada setor também é avisado na tela inicial.</p>
                  <p>• Os arquivos do briefing você anexa na aba Briefing do projeto.</p>
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
