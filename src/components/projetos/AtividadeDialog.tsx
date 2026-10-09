// Criar ou editar uma atividade do projeto — os campos da planilha do dono (docs/especificacao-projetos.md).
// Só aparecem os setores que a pessoa pode planejar (o banco é quem barra de verdade). A fase: escolhe uma
// que já existe, ou cria uma nova ali mesmo — as fases são de todos os setores. O responsável é sempre do
// setor da atividade e cada campo tem a sua explicação (dono, 2026-10-09).
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DicaDoCampo } from '@/components/ajuda/DicaDoCampo';
import { rotuloDoSetor } from '@/lib/setores';
import { useAtividades, useFases, usePessoasDaEmpresa, type AtividadeRow, type FaseRow } from '@/hooks/useProjetos';

const NENHUM = '__nenhum__';
const NOVA_FASE = '__nova__';

/** O que cada campo quer dizer, em linguagem de quem usa. */
const DICAS = {
  atividade: 'O que precisa ser feito, em poucas palavras. Ex.: "Criação da arte da embalagem".',
  setor: 'O setor que faz esta atividade. Só quem é desse setor e está no projeto edita ou exclui a atividade.',
  fase: 'A etapa do projeto em que a atividade entra (ex.: Briefing, Embalagem, Lançamento). As fases são de todos os setores; se faltar uma, crie aqui.',
  responsavel: 'A pessoa do setor que vai fazer. Ela recebe e-mail e aviso, e atualiza o % concluído e o farol. Sem responsável, o gestor do setor distribui.',
  dependeDe: 'Outra atividade que precisa terminar antes desta começar. Quando ela for finalizada, o responsável desta recebe o aviso "pode começar". Ex.: a Arte depende da Volumetria.',
  inicio: 'O dia em que a atividade começa.',
  termino: 'O dia em que a atividade deve estar pronta. Dois dias antes o responsável é avisado; passou do término sem 100%, o farol fica "Atrasado".',
  descricao: 'Detalhes para quem vai fazer: o que entregar, referências, cuidados.',
  fatorExterno: 'Algo fora da empresa que pode atrasar a atividade, para todos saberem do risco. Ex.: aguardando fornecedor, aguardando a Anvisa.',
  link: 'O endereço do arquivo ou da pasta da atividade (Drive, Canva, Figma…), para abrir com um clique.',
};

function Rotulo({ htmlFor, campo, dica }: { htmlFor?: string; campo: string; dica: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor}>{campo}</Label>
      <DicaDoCampo campo={campo} texto={dica} />
    </span>
  );
}

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
  const doSetor = pessoas.filter((p) => p.setores.includes(f.setor));
  // Trocar o setor tira o responsável que não é do setor novo (o banco recusaria).
  const trocarSetor = (setor: string) => setF((x) => ({
    ...x, setor, user_id: pessoas.some((p) => p.id === x.user_id && p.setores.includes(setor)) ? x.user_id : NENHUM,
  }));

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
          <DialogDescription>Você planeja só os setores em que atua neste projeto. Passe o mouse no (i) para ver o que cada campo quer dizer.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Rotulo htmlFor="at-titulo" campo="Atividade" dica={DICAS.atividade} />
            <Input id="at-titulo" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex.: Criação da Arte da Embalagem" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Rotulo campo="Setor" dica={DICAS.setor} />
              <Select value={f.setor} onValueChange={trocarSetor}>
                <SelectTrigger><SelectValue placeholder="Escolha o setor" /></SelectTrigger>
                <SelectContent>
                  {setoresQuePlanejo.map((s) => <SelectItem key={s} value={s}>{rotuloDoSetor(s)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Rotulo campo="Fase" dica={DICAS.fase} />
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
              <Rotulo campo="Responsável" dica={DICAS.responsavel} />
              <Select value={f.user_id} onValueChange={(v) => set('user_id', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NENHUM}>Sem responsável (o gestor do setor distribui)</SelectItem>
                  {doSetor.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              {f.setor && doSetor.length === 0 && (
                <p className="text-xs text-muted-foreground">Ninguém cadastrado em {rotuloDoSetor(f.setor)}.</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Rotulo campo="Depende de" dica={DICAS.dependeDe} />
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
              <Rotulo htmlFor="at-inicio" campo="Início" dica={DICAS.inicio} />
              <Input id="at-inicio" type="date" value={f.inicio} onChange={(e) => set('inicio', e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Rotulo htmlFor="at-termino" campo="Término" dica={DICAS.termino} />
              <Input id="at-termino" type="date" value={f.termino} min={f.inicio || undefined} onChange={(e) => set('termino', e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Rotulo htmlFor="at-descricao" campo="Descrição" dica={DICAS.descricao} />
            <Textarea id="at-descricao" rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Rotulo htmlFor="at-fator" campo="Fator externo" dica={DICAS.fatorExterno} />
              <Input id="at-fator" value={f.fator_externo} onChange={(e) => set('fator_externo', e.target.value)} placeholder="Ex.: Aguardando fornecedor" />
            </div>
            <div className="grid gap-1.5">
              <Rotulo htmlFor="at-link" campo="Link de acesso" dica={DICAS.link} />
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
