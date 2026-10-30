// Início › Rotinas (dono, 2026-10-30; docs/proposta-rotinas.md): cadastrar o que se repete no dia. A pessoa cria as
// suas; quem tem a caixinha "Rotinas" do setor (o Gestor) cria para a equipe — e a rotina do gestor a pessoa não muda
// (o banco confere: policy `rotinas_muda`). Excluir tira do dia a dia; o que já foi marcado fica no histórico.
import { useMemo, useState } from 'react';
import { ListChecks, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmarExclusao } from '@/components/ui/ConfirmarExclusao';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { usePessoasDaEmpresa } from '@/hooks/useProjetos';
import { useExcluirRotina, useRotinasCadastradas, useSalvarRotina, useSetoresDaRotina, type Rotina, type RotinaNova } from '@/hooks/useRotinas';
import {
  DIAS_UTEIS, PERIODOS, ROTULO_DA_REPETICAO, ROTULO_DO_PEDE, ROTULO_DO_PERIODO, descreverRepeticao,
  type Pede, type Periodo, type Repeticao,
} from '@/lib/rotinas';
import { rotuloDoSetor } from '@/lib/setores';
import { cn } from '@/lib/utils';

/** Botões lado a lado para uma escolha só (Hick: as opções à vista, um toque). */
function Escolha<T extends string>({ id, valor, opcoes, onChange }: { id: string; valor: T; opcoes: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div id={id} role="radiogroup" className="flex flex-wrap gap-2">
      {opcoes.map(([v, r]) => (
        <button key={v} type="button" role="radio" aria-checked={valor === v} onClick={() => onChange(v)}
          className={cn('h-10 rounded-lg border px-3.5 text-[14px] font-semibold transition-colors',
            valor === v ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card hover:bg-muted')}>
          {r}
        </button>
      ))}
    </div>
  );
}

const vazia = (setor: string, eu: string): RotinaNova => ({
  setor, titulo: '', como_fazer: null, periodo: 'manha', repeticao: 'dias_uteis', dias_da_semana: null, dia_do_mes: null,
  pede: 'nada', passa_ao_substituto: false, pessoas: [eu],
});

export default function Rotinas() {
  const { user } = useAuth();
  const eu = user?.id ?? '';
  const { data: rotinas = [], isLoading, error } = useRotinasCadastradas();
  const { data: setores = [] } = useSetoresDaRotina();
  const { data: pessoas = [] } = usePessoasDaEmpresa();
  const excluir = useExcluirRotina();
  const [editando, setEditando] = useState<{ id?: string; dados: RotinaNova } | null>(null);
  const [apagando, setApagando] = useState<Rotina | null>(null);

  const nome = useMemo(() => new Map(pessoas.map((p) => [p.id, p.nome])), [pessoas]);
  const gerencio = new Set(setores.filter((s) => s.gerencio).map((s) => s.setor));
  const meuSetor = setores.find((s) => !s.gerencio)?.setor ?? setores[0]?.setor ?? '';
  // Mexe quem criou a rotina só sua, ou o gestor do setor — a mesma conta da policy `rotinas_muda`.
  const podeMexer = (r: Rotina) => gerencio.has(r.setor) || (r.criada_por === eu && r.pessoas.length === 1 && r.pessoas[0] === eu);

  const minhas = rotinas.filter((r) => r.pessoas.includes(eu));
  const daEquipe = rotinas.filter((r) => !r.pessoas.includes(eu));

  const cartao = (r: Rotina) => (
    <li key={r.id} className="flex flex-wrap items-start gap-3 px-4 py-3 sm:px-6">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-[15px] font-bold text-foreground">{r.titulo}</p>
        <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
          <span className="estado badge-info">{ROTULO_DO_PERIODO[r.periodo]}</span>
          <span className="estado badge-neutral">{descreverRepeticao(r)}</span>
          {r.pede !== 'nada' && <span className="estado badge-purple">Pede {r.pede === 'anexo' ? 'foto ou arquivo' : 'observação'}</span>}
          {r.passa_ao_substituto && <span className="estado badge-neutral">Passa ao substituto nas férias</span>}
        </div>
        <p className="text-[13px] text-muted-foreground">
          {rotuloDoSetor(r.setor)} · {r.pessoas.length === 1 && r.pessoas[0] === eu ? 'Só você' : r.pessoas.map((p) => (p === eu ? 'você' : nome.get(p) ?? 'Pessoa')).join(', ')}
          {r.criada_por !== eu && ` · criada por ${nome.get(r.criada_por) ?? 'o gestor'}`}
        </p>
      </div>
      {podeMexer(r) && (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setEditando({ id: r.id, dados: { ...r } })}><Pencil className="mr-1 h-4 w-4" aria-hidden="true" />Editar</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" aria-label={`Mais ações de ${r.titulo}`}><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setApagando(r)}>
                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />Excluir…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </li>
  );

  const secao = (titulo: string, lista: Rotina[]) => lista.length > 0 && (
    <section className="panel overflow-hidden">
      <h2 className="px-4 pb-2 pt-5 text-[20px] font-bold sm:px-6">{titulo} <span className="text-[15px] font-semibold text-muted-foreground">· {lista.length}</span></h2>
      {PERIODOS.map((p) => {
        const doPeriodo = lista.filter((r) => r.periodo === p);
        return doPeriodo.length > 0 && (
          <div key={p}>
            <p className="bg-muted/60 px-4 py-1.5 text-[13px] font-bold uppercase tracking-wide text-muted-foreground sm:px-6">{ROTULO_DO_PERIODO[p]}</p>
            <ul className="divide-y">{doPeriodo.map(cartao)}</ul>
          </div>
        );
      })}
    </section>
  );

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader icon={ListChecks} title="Rotinas" description="O que se repete no seu dia: manhã, tarde e fim do dia. Aparece no Início, antes dos chamados."
        actions={setores.length > 0 ? <Button onClick={() => setEditando({ dados: vazia(meuSetor, eu) })}><Plus className="mr-1 h-4 w-4" />Nova rotina</Button> : undefined} />
      <div className="w-full space-y-5 px-4 pb-6 lg:px-8">
        {error ? <p className="text-sm text-destructive">Não foi possível carregar as rotinas.</p>
          : isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p>
            : rotinas.length === 0 ? (
              <EmptyState icon={ListChecks} title="Nenhuma rotina ainda"
                description="Cadastre o que você faz todo dia — conferir pedidos de manhã, enviar o resumo no fim do dia — e marque no Início conforme for fazendo." />
            ) : (
              <>
                {secao('As minhas', minhas)}
                {secao('Da equipe', daEquipe)}
              </>
            )}
      </div>

      {editando && (
        <FormularioDaRotina inicial={editando} eu={eu} setores={setores} pessoas={pessoas} onClose={() => setEditando(null)} />
      )}
      <ConfirmarExclusao aberto={!!apagando} titulo="Excluir esta rotina?" acao="Excluir"
        descricao={apagando ? `“${apagando.titulo}” sai do Início de todos que a têm. O que já foi marcado continua no histórico.` : ''}
        enviando={excluir.isPending} onCancelar={() => setApagando(null)}
        onConfirmar={() => apagando && excluir.mutate(apagando.id, { onSuccess: () => setApagando(null) })} />
    </div>
  );
}

function FormularioDaRotina({ inicial, eu, setores, pessoas, onClose }: {
  inicial: { id?: string; dados: RotinaNova };
  eu: string;
  setores: { setor: string; gerencio: boolean }[];
  pessoas: { id: string; nome: string; setores: string[] }[];
  onClose: () => void;
}) {
  const salvar = useSalvarRotina();
  const [d, setD] = useState<RotinaNova>(inicial.dados);
  const muda = (p: Partial<RotinaNova>) => setD((x) => ({ ...x, ...p }));
  const gerencioEste = setores.some((s) => s.setor === d.setor && s.gerencio);
  // As pessoas do setor — a mesma régua do banco (perfil, módulo e perfil de acesso).
  const doSetor = pessoas.filter((p) => p.setores.some((s) => (s === 'tickets' ? 'ti' : s) === d.setor));

  const trocarSetor = (setor: string) => {
    const gerencia = setores.some((s) => s.setor === setor && s.gerencio);
    muda({ setor, pessoas: gerencia ? d.pessoas.filter((p) => pessoas.find((x) => x.id === p)?.setores.some((s) => (s === 'tickets' ? 'ti' : s) === setor)) : [eu] });
  };
  const alternarPessoa = (id: string) => muda({ pessoas: d.pessoas.includes(id) ? d.pessoas.filter((p) => p !== id) : [...d.pessoas, id] });
  const alternarDia = (n: number) => {
    const atual = d.dias_da_semana ?? [];
    muda({ dias_da_semana: atual.includes(n) ? atual.filter((x) => x !== n) : [...atual, n].sort() });
  };

  const valido = d.titulo.trim().length >= 3 && d.pessoas.length > 0
    && (d.repeticao !== 'dias_da_semana' || (d.dias_da_semana?.length ?? 0) > 0)
    && (d.repeticao !== 'mensal' || (!!d.dia_do_mes && d.dia_do_mes >= 1 && d.dia_do_mes <= 31));

  const enviar = () => salvar.mutate({
    id: inicial.id,
    dados: {
      ...d,
      titulo: d.titulo.trim(),
      como_fazer: d.como_fazer?.trim() || null,
      dias_da_semana: d.repeticao === 'dias_da_semana' ? d.dias_da_semana : null,
      dia_do_mes: d.repeticao === 'mensal' ? d.dia_do_mes : null,
      passa_ao_substituto: gerencioEste && d.passa_ao_substituto,
    },
  }, { onSuccess: onClose });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{inicial.id ? 'Editar rotina' : 'Nova rotina'}</DialogTitle></DialogHeader>
        <div className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="rotina-titulo" className="text-[14px] font-bold">O que fazer</label>
            <Input id="rotina-titulo" value={d.titulo} onChange={(e) => muda({ titulo: e.target.value })} maxLength={140}
              placeholder="Ex.: Conferir os pedidos do Forteplus" className="h-11" />
          </div>

          <div className="space-y-1.5">
            <span className="text-[14px] font-bold">Período</span>
            <Escolha id="rotina-periodo" valor={d.periodo} onChange={(v: Periodo) => muda({ periodo: v })}
              opcoes={PERIODOS.map((p) => [p, ROTULO_DO_PERIODO[p]])} />
            <p className="text-[13px] text-muted-foreground">A manhã vai até o seu almoço; o fim do dia é a última hora do expediente.</p>
          </div>

          <div className="space-y-2">
            <span className="text-[14px] font-bold">Quando se repete</span>
            <Escolha id="rotina-repeticao" valor={d.repeticao} onChange={(v: Repeticao) => muda({ repeticao: v })}
              opcoes={(Object.keys(ROTULO_DA_REPETICAO) as Repeticao[]).map((r) => [r, ROTULO_DA_REPETICAO[r]])} />
            {d.repeticao === 'dias_da_semana' && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Dias da semana">
                {DIAS_UTEIS.map((dia) => (
                  <button key={dia.n} type="button" aria-pressed={d.dias_da_semana?.includes(dia.n) ?? false} onClick={() => alternarDia(dia.n)}
                    className={cn('h-10 w-14 rounded-lg border text-[14px] font-semibold',
                      d.dias_da_semana?.includes(dia.n) ? 'border-primary bg-primary/10 text-primary' : 'border-input bg-card hover:bg-muted')}>
                    {dia.curto}
                  </button>
                ))}
              </div>
            )}
            {d.repeticao === 'mensal' && (
              <div className="flex items-center gap-2 text-[14px]">
                <label htmlFor="rotina-dia">Todo dia</label>
                <Input id="rotina-dia" type="number" min={1} max={31} value={d.dia_do_mes ?? ''} className="h-10 w-20"
                  onChange={(e) => muda({ dia_do_mes: e.target.value ? Number(e.target.value) : null })} />
                <span className="text-muted-foreground">do mês</span>
              </div>
            )}
            <p className="text-[13px] text-muted-foreground">
              Fim de semana, feriado e férias pulam sozinhos. Se o dia do mês cair num dia sem expediente, a rotina vem no dia útil anterior.
            </p>
          </div>

          {setores.length > 1 && (
            <div className="space-y-1.5">
              <label htmlFor="rotina-setor" className="text-[14px] font-bold">Setor</label>
              <select id="rotina-setor" value={d.setor} onChange={(e) => trocarSetor(e.target.value)}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-[15px]">
                {setores.map((s) => <option key={s.setor} value={s.setor}>{rotuloDoSetor(s.setor)}</option>)}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <span className="text-[14px] font-bold">Para quem</span>
            {gerencioEste ? (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2">
                {doSetor.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[15px] hover:bg-muted/50">
                    <Checkbox checked={d.pessoas.includes(p.id)} onCheckedChange={() => alternarPessoa(p.id)} />
                    {p.id === eu ? `${p.nome} (você)` : p.nome}
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-[15px] text-muted-foreground">Só você. Rotina para a equipe é o gestor do setor quem cria.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <span className="text-[14px] font-bold">Ao marcar, pedir</span>
            <Escolha id="rotina-pede" valor={d.pede} onChange={(v: Pede) => muda({ pede: v })}
              opcoes={(Object.keys(ROTULO_DO_PEDE) as Pede[]).map((p) => [p, ROTULO_DO_PEDE[p]])} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="rotina-como" className="text-[14px] font-bold">Como fazer <span className="font-normal text-muted-foreground">(opcional)</span></label>
            <Textarea id="rotina-como" rows={3} maxLength={2000} value={d.como_fazer ?? ''} onChange={(e) => muda({ como_fazer: e.target.value })}
              placeholder="O passo a passo, ou onde está a Diretriz do setor." />
          </div>

          {gerencioEste && (
            <label className="flex cursor-pointer items-start gap-2.5 text-[15px]">
              <Checkbox className="mt-0.5" checked={d.passa_ao_substituto} onCheckedChange={(v) => muda({ passa_ao_substituto: v === true })} />
              <span>Nas férias, passa ao substituto<span className="block text-[13px] text-muted-foreground">Sem marcar, a rotina pausa enquanto a pessoa está fora.</span></span>
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={enviar} disabled={!valido || salvar.isPending}>{salvar.isPending ? 'Salvando…' : inicial.id ? 'Salvar' : 'Criar rotina'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
