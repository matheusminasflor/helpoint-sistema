// Criar ou editar uma atividade do projeto — os campos da planilha do dono (docs/especificacao-projetos.md).
// Só aparecem os setores que a pessoa pode planejar (o banco é quem barra de verdade). A fase: escolhe uma
// que já existe, ou cria uma nova ali mesmo — as fases são de todos os setores.
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { rotuloDoSetor } from '@/lib/setores';
import { useAtividades, useFases, usePessoasDaEmpresa, type AtividadeRow, type FaseRow } from '@/hooks/useProjetos';

const NENHUM = '__nenhum__';
const NOVA_FASE = '__nova__';

interface Props {
  projectId: string;
  aberta: boolean;
  onFechar: () => void;
  /** Atividade a editar; sem ela, cria. */
  atividade: AtividadeRow | null;
  setoresQuePlanejo: string[];
  fases: FaseRow[];
  atividades: AtividadeRow[];
}

export function AtividadeDialog({ projectId, aberta, onFechar, atividade, setoresQuePlanejo, fases, atividades }: Props) {
  const { salvar } = useAtividades(projectId);
  const { criar: criarFase } = useFases(projectId);
  const { data: pessoas = [] } = usePessoasDaEmpresa();
  const [f, setF] = useState(() => vazio(atividade, setoresQuePlanejo));
  const [novaFase, setNovaFase] = useState('');

  useEffect(() => { if (aberta) { setF(vazio(atividade, setoresQuePlanejo)); setNovaFase(''); } }, [aberta, atividade, setoresQuePlanejo]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  // Quem é do setor vem primeiro na lista de responsáveis.
  const pessoasOrdenadas = [...pessoas].sort((a, b) =>
    Number(b.setor === f.setor) - Number(a.setor === f.setor) || a.nome.localeCompare(b.nome, 'pt-BR'));

  const salvarAtividade = async () => {
    let faseId = f.fase_id === NENHUM ? null : f.fase_id;
    if (f.fase_id === NOVA_FASE) {
      if (!novaFase.trim()) return;
      faseId = await criarFase.mutateAsync({ nome: novaFase, ordem: (fases.at(-1)?.ordem ?? 0) + 1 });
    }
    await salvar.mutateAsync({
      id: atividade?.id,
      title: f.title,
      description: f.description.trim() || null,
      setor: f.setor,
      fase_id: faseId,
      user_id: f.user_id === NENHUM ? null : f.user_id,
      inicio: f.inicio || null,
      termino: f.termino || null,
      depende_de: f.depende_de === NENHUM ? null : f.depende_de,
      fator_externo: f.fator_externo.trim() || null,
      link: f.link.trim() || null,
    });
    onFechar();
  };

  const podeSalvar = f.title.trim().length > 0 && !!f.setor && (f.fase_id !== NOVA_FASE || novaFase.trim().length > 0);

  return (
    <Dialog open={aberta} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{atividade ? 'Editar atividade' : 'Nova atividade do setor'}</DialogTitle>
          <DialogDescription>Você planeja só os setores em que atua; o dono do projeto ajusta o resto.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="at-titulo">Atividade</Label>
            <Input id="at-titulo" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex.: Criação da Arte da Embalagem" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Setor</Label>
              <Select value={f.setor} onValueChange={(v) => set('setor', v)}>
                <SelectTrigger><SelectValue placeholder="Escolha o setor" /></SelectTrigger>
                <SelectContent>
                  {setoresQuePlanejo.map((s) => <SelectItem key={s} value={s}>{rotuloDoSetor(s)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Fase</Label>
              <Select value={f.fase_id} onValueChange={(v) => set('fase_id', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NENHUM}>Sem fase</SelectItem>
                  {fases.map((fa, i) => <SelectItem key={fa.id} value={fa.id}>{i + 1} · {fa.nome}</SelectItem>)}
                  <SelectItem value={NOVA_FASE}>+ Nova fase…</SelectItem>
                </SelectContent>
              </Select>
              {f.fase_id === NOVA_FASE && (
                <Input value={novaFase} onChange={(e) => setNovaFase(e.target.value)} placeholder="Nome da nova fase" aria-label="Nome da nova fase" />
              )}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Responsável</Label>
              <Select value={f.user_id} onValueChange={(v) => set('user_id', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NENHUM}>Sem responsável (o gestor do setor distribui)</SelectItem>
                  {/* Os do setor num grupo com título (teste do dono, 2026-10-07: a lista misturada
                      parecia oferecer "qualquer um" para a atividade do setor). */}
                  <SelectGroup>
                    <SelectLabel>Do setor {rotuloDoSetor(f.setor)}</SelectLabel>
                    {pessoasOrdenadas.filter((p) => p.setor === f.setor).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Outras pessoas</SelectLabel>
                    {pessoasOrdenadas.filter((p) => p.setor !== f.setor).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}{p.setor ? ` · ${rotuloDoSetor(p.setor)}` : ''}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Depende de</Label>
              <Select value={f.depende_de} onValueChange={(v) => set('depende_de', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NENHUM}>Nenhuma</SelectItem>
                  {atividades.filter((a) => a.id !== atividade?.id).map((a) => <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="at-inicio">Início</Label>
              <Input id="at-inicio" type="date" value={f.inicio} onChange={(e) => set('inicio', e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="at-termino">Término</Label>
              <Input id="at-termino" type="date" value={f.termino} min={f.inicio || undefined} onChange={(e) => set('termino', e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="at-descricao">Descrição</Label>
            <Textarea id="at-descricao" rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="at-fator">Fator externo</Label>
              <Input id="at-fator" value={f.fator_externo} onChange={(e) => set('fator_externo', e.target.value)} placeholder="Ex.: Aguardando fornecedor" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="at-link">Link de acesso</Label>
              <Input id="at-link" type="url" value={f.link} onChange={(e) => set('link', e.target.value)} placeholder="https://…" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={salvarAtividade} disabled={!podeSalvar || salvar.isPending || criarFase.isPending}>
            {salvar.isPending ? 'Salvando…' : 'Salvar atividade'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function vazio(a: AtividadeRow | null, setores: string[]) {
  return {
    title: a?.title ?? '',
    description: a?.description ?? '',
    setor: a?.setor ?? setores[0] ?? '',
    fase_id: a?.fase_id ?? NENHUM,
    user_id: a?.user_id ?? NENHUM,
    inicio: a?.inicio ?? '',
    termino: a?.termino ?? '',
    depende_de: a?.depende_de ?? NENHUM,
    fator_externo: a?.fator_externo ?? '',
    link: a?.link ?? '',
  };
}
