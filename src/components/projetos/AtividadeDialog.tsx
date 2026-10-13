// Criar ou editar uma tarefa do projeto. Desenho do dono (2026-10-13, "está muito técnico, parece um Excel"):
// três perguntas — O que fazer? Quem faz? Até quando? — e o resto escondido em "Mais opções". A etapa vem de
// onde a pessoa clicou. Só aparecem os setores que a pessoa planeja (o banco é quem barra de verdade); quem
// faz é sempre do setor da tarefa, e cada campo tem a sua explicação (dono, 2026-10-09).
import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  oQue: 'O que precisa ser feito, em poucas palavras. Ex.: "Criar a arte do rótulo".',
  setor: 'O setor que faz esta tarefa. Só quem é desse setor e está no projeto muda ou exclui a tarefa.',
  quem: 'A pessoa do setor que vai fazer. Ela recebe e-mail e aviso e marca A fazer / Fazendo / Pronto. Sem ninguém, o gestor do setor distribui.',
  ate: 'O dia em que a tarefa deve estar pronta. Dois dias antes quem faz é avisado; passou do prazo sem ficar pronta, ela fica "Atrasada".',
  etapa: 'A parte do projeto em que a tarefa entra (ex.: Briefing, Embalagem, Lançamento). As etapas são de todos os setores; se faltar uma, crie aqui.',
  inicio: 'O dia em que a tarefa começa. Serve para a linha do tempo; pode ficar em branco.',
  descricao: 'Detalhes para quem vai fazer: o que entregar, referências, cuidados.',
  depois: 'Outra tarefa que precisa ficar pronta antes desta começar. Quando ela ficar pronta, quem faz esta recebe o aviso "pode começar". Ex.: a arte só começa depois da volumetria.',
  fora: 'Algo fora da empresa que pode atrasar a tarefa, para todos saberem do risco. Ex.: aguardando fornecedor, aguardando a Anvisa.',
  link: 'O endereço do arquivo ou da pasta da tarefa (Drive, Canva, Figma…), para abrir com um clique.',
};

function Rotulo({ htmlFor, campo, dica }: { htmlFor?: string; campo: string; dica: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor} className="text-[14px]">{campo}</Label>
      <DicaDoCampo campo={campo} texto={dica} />
    </span>
  );
}

interface Props {
  projectId: string;
  aberta: boolean;
  onFechar: () => void;
  /** Tarefa a editar; sem ela, cria. */
  atividade: AtividadeRow | null;
  setoresQuePlanejo: string[];
  fases: FaseRow[];
  atividades: AtividadeRow[];
  /** A etapa de onde a pessoa clicou em "+ Nova tarefa" (nula = sem etapa). */
  faseInicial?: string | null;
}

export function AtividadeDialog({ projectId, aberta, onFechar, atividade, setoresQuePlanejo, fases, atividades, faseInicial }: Props) {
  const { salvar } = useAtividades(projectId);
  const { criar: criarFase } = useFases(projectId);
  const { data: pessoas = [] } = usePessoasDaEmpresa();
  const [f, setF] = useState(() => vazio(atividade, setoresQuePlanejo, faseInicial));
  const [novaFase, setNovaFase] = useState('');
  const [mais, setMais] = useState(false);

  useEffect(() => {
    if (!aberta) return;
    const v = vazio(atividade, setoresQuePlanejo, faseInicial);
    setF(v);
    setNovaFase('');
    // Editando uma tarefa que já usa as opções extras, elas já vêm abertas.
    setMais(!!atividade && !!(v.description || v.inicio || v.depende_de !== NENHUM || v.fator_externo || v.link));
  }, [aberta, atividade, setoresQuePlanejo, faseInicial]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const doSetor = pessoas.filter((p) => p.setores.includes(f.setor));
  // Trocar o setor tira quem faz, se não for do setor novo (o banco recusaria).
  const trocarSetor = (setor: string) => setF((x) => ({
    ...x, setor, user_id: pessoas.some((p) => p.id === x.user_id && p.setores.includes(setor)) ? x.user_id : NENHUM,
  }));
  const nomeDaFase = fases.find((x) => x.id === f.fase_id)?.nome;

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

  const podeSalvar = f.title.trim().length > 0 && !!f.setor && (f.fase_id !== NOVA_FASE || novaFase.trim().length > 0)
    && !(f.inicio && f.termino && f.termino < f.inicio);

  return (
    <Dialog open={aberta} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{atividade ? 'Editar tarefa' : 'Nova tarefa'}</DialogTitle>
          <DialogDescription>
            {f.fase_id === NOVA_FASE ? 'Numa etapa nova' : nomeDaFase ? `Etapa: ${nomeDaFase}` : 'Sem etapa'}
            {setoresQuePlanejo.length <= 1 && f.setor ? ` · ${rotuloDoSetor(f.setor)}` : ''}
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); if (podeSalvar) void salvarAtividade(); }}>
          <div className="grid gap-1.5">
            <Rotulo htmlFor="at-titulo" campo="O que fazer?" dica={DICAS.oQue} />
            <Input id="at-titulo" autoFocus value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex.: Criar a arte do rótulo" />
          </div>
          {setoresQuePlanejo.length > 1 && (
            <div className="grid gap-1.5">
              <Rotulo campo="De qual setor?" dica={DICAS.setor} />
              <Select value={f.setor} onValueChange={trocarSetor}>
                <SelectTrigger><SelectValue placeholder="Escolha o setor" /></SelectTrigger>
                <SelectContent>
                  {setoresQuePlanejo.map((s) => <SelectItem key={s} value={s}>{rotuloDoSetor(s)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-1.5">
            <Rotulo campo="Quem faz?" dica={DICAS.quem} />
            <Select value={f.user_id} onValueChange={(v) => set('user_id', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NENHUM}>Ainda não sei (o gestor do setor distribui)</SelectItem>
                {doSetor.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            {f.setor && doSetor.length === 0 && (
              <p className="text-[13px] text-muted-foreground">Ninguém cadastrado em {rotuloDoSetor(f.setor)}.</p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Rotulo htmlFor="at-termino" campo="Até quando?" dica={DICAS.ate} />
            <Input id="at-termino" type="date" className="max-w-[200px]" value={f.termino} min={f.inicio || undefined}
              onChange={(e) => set('termino', e.target.value)} />
          </div>

          <Collapsible open={mais} onOpenChange={setMais}>
            <CollapsibleTrigger className="group flex items-center gap-1.5 text-[14px] font-medium text-primary">
              <ChevronRight className="w-4 h-4 transition-transform group-data-[state=open]:rotate-90" aria-hidden="true" />
              Mais opções <span className="font-normal text-muted-foreground">(etapa, detalhes, link, depende de…)</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="grid gap-4 pt-4">
              <div className="grid gap-1.5">
                <Rotulo campo="Etapa" dica={DICAS.etapa} />
                <Select value={f.fase_id} onValueChange={(v) => set('fase_id', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NENHUM}>Sem etapa</SelectItem>
                    {fases.map((fa, i) => <SelectItem key={fa.id} value={fa.id}>{i + 1} · {fa.nome}</SelectItem>)}
                    <SelectItem value={NOVA_FASE}>+ Nova etapa…</SelectItem>
                  </SelectContent>
                </Select>
                {f.fase_id === NOVA_FASE && (
                  <Input value={novaFase} onChange={(e) => setNovaFase(e.target.value)} placeholder="Nome da nova etapa" aria-label="Nome da nova etapa" />
                )}
              </div>
              <div className="grid gap-1.5">
                <Rotulo htmlFor="at-descricao" campo="Detalhes" dica={DICAS.descricao} />
                <Textarea id="at-descricao" rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Rotulo htmlFor="at-inicio" campo="Começa em" dica={DICAS.inicio} />
                <Input id="at-inicio" type="date" className="max-w-[200px]" value={f.inicio} max={f.termino || undefined}
                  onChange={(e) => set('inicio', e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Rotulo campo="Só começa depois de" dica={DICAS.depois} />
                <Select value={f.depende_de} onValueChange={(v) => set('depende_de', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NENHUM}>Pode começar já</SelectItem>
                    {atividades.filter((a) => a.id !== atividade?.id).map((a) => <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Rotulo htmlFor="at-fator" campo="Esperando algo de fora?" dica={DICAS.fora} />
                <Input id="at-fator" value={f.fator_externo} onChange={(e) => set('fator_externo', e.target.value)} placeholder="Ex.: Aguardando o fornecedor" />
              </div>
              <div className="grid gap-1.5">
                <Rotulo htmlFor="at-link" campo="Link do arquivo" dica={DICAS.link} />
                <Input id="at-link" type="url" value={f.link} onChange={(e) => set('link', e.target.value)} placeholder="https://…" />
              </div>
            </CollapsibleContent>
          </Collapsible>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>Cancelar</Button>
            <Button type="submit" disabled={!podeSalvar || salvar.isPending || criarFase.isPending}>
              {salvar.isPending ? 'Salvando…' : atividade ? 'Salvar' : 'Criar tarefa'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function vazio(a: AtividadeRow | null, setores: string[], faseInicial?: string | null) {
  return {
    title: a?.title ?? '',
    description: a?.description ?? '',
    setor: a?.setor ?? setores[0] ?? '',
    fase_id: a ? a.fase_id ?? NENHUM : faseInicial ?? NENHUM,
    user_id: a?.user_id ?? NENHUM,
    inicio: a?.inicio ?? '',
    termino: a?.termino ?? '',
    depende_de: a?.depende_de ?? NENHUM,
    fator_externo: a?.fator_externo ?? '',
    link: a?.link ?? '',
  };
}
