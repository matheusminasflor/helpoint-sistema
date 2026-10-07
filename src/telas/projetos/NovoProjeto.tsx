// Novo projeto: o BRIEFING (nome, objetivo, entrega) e os SETORES envolvidos, com a pessoa de referência
// opcional (decisão do dono, 2026-10-07: quem cria não precisa saber as fases — cada setor planeja a sua
// parte). Pode começar de um modelo: as fases e atividades sugeridas já vêm, e os setores do modelo também.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderPlus } from 'lucide-react';
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
import { useCriarProjeto, useModelosDeProjeto, usePessoasDaEmpresa } from '@/hooks/useProjetos';

const SEM = '__sem__';

export default function NovoProjeto() {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const criar = useCriarProjeto();
  const { data: modelos = [] } = useModelosDeProjeto();
  const { data: pessoas = [] } = usePessoasDaEmpresa();
  const [nome, setNome] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [entrega, setEntrega] = useState('');
  const [modeloId, setModeloId] = useState(SEM);
  const [setores, setSetores] = useState<Record<string, string | null>>({});

  const modelo = modelos.find((m) => m.id === modeloId);
  // Trocar de modelo (ou voltar a "Sem modelo") tira os setores que o modelo ANTERIOR tinha marcado —
  // menos os que a pessoa já ajustou com uma referência (teste do dono, 2026-10-07: voltar a "Sem
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

  const enviar = async () => {
    const id = await criar.mutateAsync({
      nome, objetivo, entrega: entrega || null, modeloId: modelo ? modelo.id : null,
      setores: Object.entries(setores).map(([setor, referencia_id]) => ({ setor, referencia_id })),
    });
    navigate(tenantPath(`/projetos/${id}`));
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader icon={FolderPlus} title="Novo projeto" description="Escreva a ideia e chame os setores. Cada setor planeja a sua parte depois." onBack={() => navigate(tenantPath('/projetos'))} />
      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] max-w-6xl">
          <Card>
            <CardHeader><CardTitle className="text-[16px]">Briefing</CardTitle><CardDescription>O que todo setor vai ler antes de planejar.</CardDescription></CardHeader>
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
                {modelo?.description && <p className="text-[13px] text-muted-foreground">{modelo.description}</p>}
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
              <p className="text-[13px] text-muted-foreground">Os arquivos do briefing você anexa depois de criar, na aba Briefing do projeto.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-[16px]">Setores envolvidos</CardTitle><CardDescription>Cada setor marcado recebe um aviso para planejar a sua parte. A referência é opcional.</CardDescription></CardHeader>
            <CardContent className="grid gap-2">
              {SETORES.map((s) => {
                const marcado = s.value in setores;
                return (
                  <div key={s.value} className="rounded-md border border-border p-2 space-y-2">
                    <label className="flex items-center gap-2 text-[14px] cursor-pointer">
                      <Checkbox checked={marcado} onCheckedChange={(v) => marcar(s.value, !!v)} />
                      {rotuloDoSetor(s.value)}
                    </label>
                    {marcado && (
                      <Select value={setores[s.value] ?? SEM} onValueChange={(v) => setSetores((x) => ({ ...x, [s.value]: v === SEM ? null : v }))}>
                        <SelectTrigger className="h-8 text-[13px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SEM}>Sem referência</SelectItem>
                          {[...pessoas].sort((a, b) => Number(b.setor === s.value) - Number(a.setor === s.value))
                            .map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}{p.setor ? ` · ${rotuloDoSetor(p.setor)}` : ''}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                );
              })}
              <Button className="mt-2" onClick={enviar} disabled={!nome.trim() || criar.isPending}>
                {criar.isPending ? 'Criando…' : 'Criar projeto e avisar os setores'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
